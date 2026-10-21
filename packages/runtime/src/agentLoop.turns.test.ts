import type { Agent, AgentEvent } from "@yaklabs/catalog/agent";
import {
  applyChunk,
  cancelReply,
  completeReply,
  startReply,
  type AgentMessage,
  type ReplyChunk,
} from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { describe, expect, it, vi } from "vitest";
import { beats, init, lastWorkspace, profit, sendAsk, startLoop } from "./agentLoop.harness";
import type { Command, Notice } from "./protocol";
import { projectIdSchema, threadIdSchema } from "./workspace";

// A reply that shows its work: a check starts, a card and a finding land, the check settles
// with its outcome, and the work is summed up.
const work: ReplyChunk[] = [
  { kind: "step", step: { id: "orders", label: "Pull last week's orders", status: "running" } },
  { kind: "card", payload: { component: "BarChart", props: { title: "Profit by day" } } },
  { kind: "text", text: "Saturday leads", mark: "strong" },
  " the week.",
  {
    kind: "step",
    step: {
      id: "orders",
      label: "Pull last week's orders",
      status: "done",
      outcome: "412 orders, Sep 14–20",
      evidence: { rows: 412 },
    },
  },
  { kind: "summary", text: "Checked last week's orders" },
];

const failure: ReplyChunk = {
  kind: "failure",
  failure: { title: "Reply interrupted", detail: "The sales system stopped answering." },
};

// A question the catalog would dock: a short question, its branches, a typed answer.
const docked = {
  question: "Which week should I compare?",
  options: [{ label: "The week before" }, { label: "The same week last year" }],
  answer: { placeholder: "Sep 7–13" },
};

// An agent that yields `chunks`, then ends, or with `hold`, waits until it is stopped.
function says(chunks: ReplyChunk[], hold = false): Agent {
  return {
    async *respond(_event, signal) {
      yield* chunks;
      if (!hold) return;
      await new Promise((resolve) => {
        signal.addEventListener("abort", resolve, { once: true });
      });
    },
  };
}

// The turn the catalog's fold builds from `chunks`, as the loop starts it for request r1.
const fold = (chunks: ReplyChunk[]): AgentMessage =>
  chunks.reduce((turn, chunk) => applyChunk(turn, chunk), startReply("r1", "10:03"));

// The chunks the loop forwarded, in order.
const forwarded = (notices: Notice[]): ReplyChunk[] =>
  notices.flatMap((notice) => (notice.kind === "chunk" ? [notice.chunk] : []));

// The thread's turns as `open` answers them: read back from SQLite through the protocol.
async function opened(run: (data: unknown) => Promise<void>, notices: Notice[]) {
  await run({ kind: "open", requestId: "o1", threadId: profit });
  const answer = notices.at(-1);
  if (answer?.kind !== "opened") throw new Error(`open answered ${answer?.kind}`);
  return answer.messages;
}

describe("the agent loop carries a reply's events", () => {
  it("forwards every chunk and keeps the turn its fold builds, complete", async () => {
    const { notices, run } = await startLoop(() => says(work));
    await run(init);
    await run(sendAsk);
    expect(beats(notices)).toEqual(["opening", "state", "chunk", "state", "done"]);
    expect(forwarded(notices)).toEqual(work);
    const turn = (await opened(run, notices)).at(-1);
    expect(turn).toEqual({ ...completeReply(fold(work)), id: "a2" });
    expect(turn).toMatchObject({
      text: "Saturday leads the week.",
      streaming: false,
      blocks: [{ kind: "card" }, { kind: "paragraph" }],
      work: {
        steps: [{ id: "orders", status: "done", outcome: "412 orders, Sep 14–20" }],
        summary: "Checked last week's orders",
      },
    });
    expect(turn).not.toHaveProperty("ended");
  });

  it("ends the turn at a failure, and reads nothing the agent says after it", async () => {
    const { notices, run } = await startLoop(() => says([...work, failure, "Never shown."]));
    await run(init);
    await run(sendAsk);
    expect(forwarded(notices)).toEqual([...work, failure]);
    const turn = (await opened(run, notices)).at(-1);
    expect(turn).toEqual({ ...fold([...work, failure]), id: "a2" });
    expect(turn).toMatchObject({
      streaming: false,
      ended: "interrupted",
      failure: { title: "Reply interrupted" },
    });
  });
});

describe("the agent loop settles a stopped or an empty reply", () => {
  it("keeps a stopped turn cancelled, with the check still running marked cancelled", async () => {
    const started: ReplyChunk = {
      kind: "step",
      step: { id: "costs", label: "Subtract the running costs", status: "running" },
    };
    const chunks = [...work, started];
    const { notices, run } = await startLoop(() => says(chunks, true));
    await run(init);
    const sending = run(sendAsk);
    await vi.waitFor(() => {
      expect(forwarded(notices)).toHaveLength(chunks.length);
    });
    await run({ kind: "abort", requestId: "r1" });
    await sending;
    const turn = (await opened(run, notices)).at(-1);
    expect(turn).toEqual({ ...cancelReply(fold(chunks)), id: "a2" });
    expect(turn).toMatchObject({
      ended: "cancelled",
      work: { steps: [{ status: "done" }, { id: "costs", status: "cancelled" }] },
    });
  });

  it("keeps no turn for a reply that showed nothing", async () => {
    const { notices, run } = await startLoop(() => says([{ kind: "activity", text: "Looking" }]));
    await run(init);
    await run(sendAsk);
    expect((await opened(run, notices)).map((message) => message.id)).toEqual(["u1", "a1", "u2"]);
  });
});

describe("the agent loop keeps a question with its answer", () => {
  it("stores the question a reply asks, and the answer to it with the question's wording", async () => {
    const asks: ReplyChunk[] = ["I can compare it.", { kind: "question", question: docked }];
    const { notices, run } = await startLoop(() => says(asks));
    await run(init);
    await run(sendAsk);
    const answer: AgentEvent = { kind: "answer", text: "The week before" };
    await run({ ...sendAsk, requestId: "r2", event: answer });
    const [asked, answered] = (await opened(run, notices)).slice(-3);
    expect(asked).toMatchObject({ id: "a2", role: "agent", asks: docked });
    const expected: ThreadMessage = {
      id: "u3",
      role: "user",
      text: "The week before",
      time: "10:03",
      question: "Which week should I compare?",
    };
    expect(answered).toEqual(expected);
  });

  it("records no question for an answer when the reply asked none the catalog would dock", async () => {
    const malformed = { question: "Which?" }; // no options, so it never docked
    const { notices, run } = await startLoop(() =>
      says([{ kind: "question", question: malformed }]),
    );
    await run(init);
    await run(sendAsk);
    await run({ ...sendAsk, requestId: "r2", event: { kind: "answer", text: "Any" } });
    const answered = (await opened(run, notices)).at(-2);
    expect(answered).toEqual({ id: "u3", role: "user", text: "Any", time: "10:03" });
  });
});

// A main made with no title, a message to it, and its title in the state pushed last.
const untitled: Command = {
  kind: "create",
  requestId: "c1",
  item: { kind: "main", projectId: projectIdSchema.parse("demo-store") },
};
const say = (requestId: string, text: string): Command => ({
  kind: "send",
  requestId,
  threadId: threadIdSchema.parse("t-001"),
  event: { kind: "message", text, attachments: [] },
});
const titleOf = (notices: Notice[]) =>
  lastWorkspace(notices).threads.find((thread) => thread.id === "t-001")?.title;

describe("a thread's first message names it", () => {
  it("titles a new thread from its first message, and keeps that title after", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run(untitled);
    await run(say("r1", "Which refunds  came\nin late last week?"));
    expect(titleOf(notices)).toBe("Which refunds came in late last week?");
    await run(say("r2", "And the week before?"));
    expect(titleOf(notices)).toBe("Which refunds came in late last week?");
  });

  it("leaves a thread someone named alone", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run(untitled);
    const name = "Refunds";
    await run({ kind: "rename", requestId: "n1", target: { kind: "thread", id: "t-001" }, name });
    await run(say("r1", "Which refunds came in late?"));
    expect(titleOf(notices)).toBe("Refunds");
  });
});
