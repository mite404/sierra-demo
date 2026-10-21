import type { AgentEvent } from "@yaklabs/catalog/agent";
import type { PlaygroundRequest } from "@yaklabs/catalog/playground";
import { applyChunk, completeReply, startReply, type AgentMessage } from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { describe, expect, it } from "vitest";
// The gateway's own test kit and history rebuild, in this test only: the runtime never
// depends on the gateway, but its requests must round trip through the gateway's reading.
import { toUpstreamMessages } from "../../../apps/gateway/src/playgroundHistory";
import {
  BAR_CARD,
  QUESTION,
  playgroundApp,
  postPlayground,
  readEvents,
  round,
  say,
  text,
  tool,
} from "../../../apps/gateway/src/playgroundTestKit";
import { COPY } from "./playgroundCopy";
import { newReply, receive } from "./playgroundReply";
import { historyBefore, planRequest, type Plan } from "./playgroundRequest";

type Rounds = Parameters<typeof playgroundApp>;
type Asked = Extract<AgentEvent, { kind: "message" | "answer" }>;

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
const asks: Rounds = [round("tool_use", tool(0, "ask_question", { question: QUESTION }))];

const user = (id: string, words: string, question?: string): ThreadMessage => ({
  id,
  role: "user",
  text: words,
  time: "9:00",
  ...(question === undefined ? {} : { question }),
});
const message = (words: string): Asked => ({ kind: "message", text: words, attachments: [] });

// The turn a reply to "Go." leaves in the thread: the gateway's events for `rounds`, read by
// the real gateway, folded by `receive`, then by the seam's `applyChunk`, as the worker saves it.
async function replyTo(id: string, rounds: Rounds): Promise<AgentMessage> {
  const { app } = playgroundApp(...rounds);
  const events = await readEvents(await postPlayground(app, say("Go.")));
  let state = newReply;
  let turn = startReply(id, "9:00");
  for (const event of events) {
    const receipt = receive(state, event);
    state = receipt.state;
    turn = receipt.chunks.reduce((folded, chunk) => applyChunk(folded, chunk), turn);
  }
  return turn.ended === undefined ? completeReply(turn) : turn;
}

function sent(plan: Plan): PlaygroundRequest {
  if (plan.kind === "refuse") throw new Error(`refused: ${plan.reason}`);
  return plan.request;
}

describe("planRequest projects folded turns", () => {
  it("into the request the gateway reads back as the calls it made", async () => {
    const history = [user("u1", "Go."), await replyTo("a1", toolReply)];
    const request = sent(planRequest(history, message("And Saturday?")));
    expect(request.exchanges).toEqual([
      {
        user: { kind: "say", text: "Go." },
        agent: {
          text: "Friday led the week.",
          cards: [{ cardId: "week", selection: BAR_CARD }],
          outcomes: [{ workId: "sum", result: "Friday was busiest" }],
          failures: [],
        },
      },
      { user: { kind: "say", text: "And Saturday?" } },
    ]);
    const [, assistant] = toUpstreamMessages(request);
    expect(assistant).toMatchObject({
      role: "assistant",
      content: [
        { type: "text", text: "Friday led the week." },
        { type: "tool_use", id: "h0_0", name: "show_card" },
        { type: "tool_use", id: "h0_1", name: "report_outcome" },
      ],
    });
  });

  it("with a question paired to its answer, now and in the past", async () => {
    const asked = await replyTo("a1", asks);
    const answer: Asked = { kind: "answer", text: "Cost" };
    const now = sent(planRequest([user("u1", "Go."), asked], answer));
    expect(now.exchanges.at(-1)?.user).toEqual({ kind: "answer", questionId: "q0", text: "Cost" });
    expect(JSON.stringify(toUpstreamMessages(now))).toContain("The user answered: Cost");
    const later = [user("u1", "Go."), asked, user("u2", "Cost", QUESTION.question)];
    const past = sent(planRequest([...later, await replyTo("a2", toolReply)], message("More.")));
    expect(past.exchanges[1]?.user).toEqual({ kind: "answer", questionId: "q0", text: "Cost" });
  });
});

describe("planRequest leaves the thinking behind", () => {
  it("keeping a reply's reasoning on its turn but never sending it back", async () => {
    const thought = "They want the busiest day.";
    const reply = applyChunk(await replyTo("a1", [round("end_turn", text(1, "Friday."))]), {
      kind: "thinking",
      text: thought,
    });
    expect(reply.thinking).toBe(thought);
    const request = sent(planRequest([user("u1", "Go."), reply], message("Why?")));
    expect(request.exchanges[0]?.agent?.text).toBe("Friday.");
    expect(JSON.stringify(request)).not.toContain(thought);
    expect(JSON.stringify(toUpstreamMessages(request))).not.toContain(thought);
  });
});

describe("planRequest reads questions and short ends", () => {
  it("with a message after an open question sent as a say the gateway reads as a skip", async () => {
    const request = sent(
      planRequest([user("u1", "Go."), await replyTo("a1", asks)], message("No")),
    );
    expect(request.exchanges.at(-1)?.user).toEqual({ kind: "say", text: "No" });
    expect(JSON.stringify(toUpstreamMessages(request))).toContain(
      "The user skipped this question.",
    );
  });

  it("with a failed step's limitation and a short end's cause as failures", async () => {
    const limitation = "I cannot fetch real sales.";
    const refused = tool(1, "report_failure", { workId: "sum", limitation });
    const cut = await replyTo("a1", [
      round("tool_use", tool(0, "update_work", working), refused),
      round("max_tokens", text(0, "Friday was")),
    ]);
    const request = sent(planRequest([user("u1", "Go."), cut], message("Again")));
    expect(request.exchanges[0]?.agent).toMatchObject({
      text: "Friday was",
      failures: [{ limitation }, { limitation: COPY.ended.limit.title }],
    });
  });
});

describe("planRequest keeps Try again idempotent", () => {
  it("dropping an attempt that showed nothing, so the retry sends the first request", () => {
    const failed = applyChunk(startReply("a1", "9:00"), {
      kind: "failure",
      failure: COPY.unavailable,
    });
    const first = planRequest(historyBefore([user("u1", "Go.")], message("Go.")), message("Go."));
    const saved = [user("u1", "Go."), failed, user("u2", "Go.")];
    expect(planRequest(historyBefore(saved, message("Go.")), message("Go."))).toEqual(first);
  });

  it("dropping a user turn no reply settled", () => {
    const plan = planRequest([user("u1", "Go.")], message("Go."));
    expect(sent(plan).exchanges).toEqual([{ user: { kind: "say", text: "Go." } }]);
  });
});

// A settled reply of plain words.
const settled = (id: string): AgentMessage => ({ ...startReply(id, "9:00"), text: "Ok." });

describe("planRequest fits the request schema", () => {
  it("keeping the newest 49 exchanges and clipping a reply's text", () => {
    const long = { ...settled("a0"), text: "x".repeat(25_000) };
    const history = [user("u0", "First"), long];
    for (let n = 1; n < 60; n += 1) history.push(user(`u${n}`, `Ask ${n}`), settled(`a${n}`));
    const { exchanges } = sent(planRequest(history, message("Last")));
    expect(exchanges).toHaveLength(50);
    expect(exchanges[0]?.user).toEqual({ kind: "say", text: "Ask 11" });
    const clipped = sent(planRequest([user("u0", "First"), long], message("Next")));
    expect(clipped.exchanges[0]?.agent?.text).toHaveLength(20_000);
  });

  it("naming a stored card without an id by position, and leaving out one it cannot show", () => {
    const blocks = [
      { kind: "card" as const, payload: { no: 1 } },
      { kind: "card" as const, payload: BAR_CARD },
    ];
    const { exchanges } = sent(
      planRequest([user("u1", "Go."), { ...settled("a1"), blocks }], message("Next")),
    );
    expect(exchanges[0]?.agent?.cards).toEqual([{ cardId: "c2", selection: BAR_CARD }]);
  });

  it("sending a long answer as a say, and refusing a message longer than the gateway reads", () => {
    const answer: Asked = { kind: "answer", text: "y".repeat(500) };
    const { exchanges } = sent(planRequest([], answer));
    expect(exchanges[0]?.user.kind).toBe("say");
    expect(planRequest([], message("z".repeat(4001))).kind).toBe("refuse");
  });
});
