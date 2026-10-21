import type { AgentEvent } from "@yaklabs/catalog/agent";
import { card, limitation, paragraph, strong, text as words } from "@yaklabs/catalog/prose";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { describe, expect, it } from "vitest";
// The gateway's own route and test kit, in this test only: the runtime never depends on the
// gateway, but the live agent must read what the real playground route streams.
import {
  BAR_CARD,
  QUESTION,
  overloaded,
  playgroundApp,
  round,
  sentMessages,
  text,
  tool,
} from "../../../apps/gateway/src/playgroundTestKit";
import { init, profit, startLoop } from "./agentLoop.harness";
import { createPlaygroundAgent } from "./playgroundAgent";
import { COPY } from "./playgroundCopy";
import type { Command, Notice } from "./protocol";

type Rounds = Parameters<typeof playgroundApp>;

// The one token the test kit's verifier accepts.
const TOKEN = "workos-access-token";
const working = { workId: "sum", label: "Adding up the week", status: "running" };
const toolReply: Rounds = [
  round(
    "tool_use",
    tool(0, "update_work", working),
    tool(1, "show_card", { cardId: "week", card: BAR_CARD }),
  ),
  round(
    "tool_use",
    tool(0, "report_outcome", { workId: "sum", result: "Friday was busiest", evidence: ["Sum"] }),
  ),
  round("end_turn", text(0, "Friday **led** the week.")),
];

const send = (requestId: string, event: AgentEvent): Command => ({
  kind: "send",
  requestId,
  threadId: profit,
  event,
  accessToken: TOKEN,
});
const ask = (said: string): AgentEvent => ({ kind: "message", text: said, attachments: [] });

// A worker loop on the starter's profit thread whose agent is the live agent, talking to the
// real gateway app scripted with `rounds` through its in-process fetch.
async function liveLoop(...rounds: Rounds) {
  const gateway = playgroundApp(...rounds);
  const loop = await startLoop((_spec, context) =>
    createPlaygroundAgent({
      ...context,
      baseUrl: "http://gateway.test",
      fetch: (input, request) => Promise.resolve(gateway.app.request(input, request)),
    }),
  );
  await loop.run(init);
  return { ...loop, requests: gateway.requests };
}

// The thread's turns as `open` answers them: read back from SQLite through the protocol.
async function opened(run: (data: unknown) => Promise<void>, notices: Notice[]) {
  await run({ kind: "open", requestId: "o1", threadId: profit });
  const answer = notices.at(-1);
  if (answer?.kind !== "opened") throw new Error(`open answered ${answer?.kind}`);
  return answer.messages;
}

const lastTurn = (messages: ThreadMessage[]) => messages.at(-1);

describe("the live agent answers through the worker", () => {
  it("storing the steps, the card and the words the gateway streamed", async () => {
    const { run, notices } = await liveLoop(...toolReply);
    await run(send("r1", ask("Chart the week.")));
    const turn = lastTurn(await opened(run, notices));
    expect(turn).toMatchObject({
      role: "agent",
      text: "Friday led the week.",
      streaming: false,
      blocks: [
        card(BAR_CARD, "week"),
        paragraph([words("Friday "), strong("led"), words(" the week.")]),
      ],
      work: {
        steps: [
          {
            id: "sum",
            label: "Adding up the week",
            status: "done",
            outcome: "Friday was busiest",
            basis: ["Sum"],
          },
        ],
        summary: "Friday was busiest",
      },
    });
    expect(turn).not.toHaveProperty("ended");
  });
});

describe("the live agent asks and admits through the worker", () => {
  it("docking a question, then sending the answer paired to it", async () => {
    const asks = round("tool_use", tool(0, "ask_question", { question: QUESTION }));
    const { run, notices, requests } = await liveLoop(asks, round("end_turn", text(0, "Ok.")));
    await run(send("r1", ask("Plan next week.")));
    expect(lastTurn(await opened(run, notices))).toMatchObject({ asks: QUESTION });
    await run(send("r2", { kind: "answer", text: "Cost" }));
    expect(JSON.stringify(await sentMessages(requests, 1))).toContain("The user answered: Cost");
    expect(lastTurn(await opened(run, notices))).toMatchObject({ text: "Ok." });
  });

  it("keeping a limitation with its recovery, and its step failed", async () => {
    const refused = tool(1, "report_failure", {
      workId: "sum",
      limitation: "I cannot fetch real sales.",
      recovery_prompt: "Chart example numbers",
    });
    const { run, notices } = await liveLoop(
      round("tool_use", tool(0, "update_work", working), refused),
      round("end_turn", text(0, "Here is what I can do.")),
    );
    await run(send("r1", ask("Chart real sales.")));
    expect(lastTurn(await opened(run, notices))).toMatchObject({
      blocks: [
        limitation("I cannot fetch real sales.", {
          label: "Send this",
          prompt: "Chart example numbers",
        }),
        paragraph([words("Here is what I can do.")]),
      ],
      work: { steps: [{ id: "sum", status: "failed", outcome: "I cannot fetch real sales." }] },
    });
  });
});

describe("the live agent ends a reply short through the worker", () => {
  it("at a limit, with the running step cancelled and the end's line kept", async () => {
    const { run, notices } = await liveLoop(
      round("tool_use", tool(0, "update_work", working)),
      round("max_tokens", text(0, "Friday was")),
    );
    await run(send("r1", ask("Which day?")));
    expect(lastTurn(await opened(run, notices))).toMatchObject({
      text: "Friday was",
      ended: "interrupted",
      failure: { title: COPY.ended.limit.title, detail: "I stopped before finishing this reply." },
      work: { steps: [{ id: "sum", status: "cancelled" }] },
    });
  });

  it("when the upstream refuses, and Try again sends the identical request", async () => {
    const { run, notices, requests } = await liveLoop(overloaded, ...toolReply);
    await run(send("r1", ask("Chart the week.")));
    expect(lastTurn(await opened(run, notices))).toMatchObject({
      ended: "failed",
      failure: COPY.unavailable,
    });
    await run(send("r2", ask("Chart the week.")));
    expect(await sentMessages(requests, 1)).toEqual(await sentMessages(requests, 0));
    expect(lastTurn(await opened(run, notices))).toMatchObject({ text: "Friday led the week." });
  });
});
