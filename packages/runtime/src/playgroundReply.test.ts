import type { Selection } from "@yaklabs/catalog/catalog";
import { card, em, limitation, paragraph, strong, text } from "@yaklabs/catalog/prose";
import { applyChunk, startReply, type AgentMessage, type ReplyChunk } from "@yaklabs/catalog/reply";
import { describe, expect, it } from "vitest";
import { COPY } from "./playgroundCopy";
import { endShort, newReply, readLine, receive, type Received } from "./playgroundReply";

// Events without their seq; `play` numbers them from 0, after a `start` of protocol 4.
type Draft = Received extends infer E ? (E extends Received ? Omit<E, "seq"> : never) : never;

const SELECTION: Selection = {
  catalogVersion: "1",
  component: "BarChart",
  props: {
    title: "Cases by day",
    source: "Numbers you gave me",
    unit: "cases",
    variant: "comparison",
    rows: [{ label: "Mon", value: 12 }],
  },
};
const QUESTION = {
  question: "What matters most next week?",
  options: [{ label: "Cost" }, { label: "Coverage" }],
  answer: { placeholder: "Something else" },
};

const start: Draft = { type: "start", v: 4 };
const working: Draft = { type: "work", workId: "sum", label: "Adding up", status: "running" };

const numbered = (drafts: Draft[]): Received[] => drafts.map((draft, seq) => ({ ...draft, seq }));

// Folds `events` from a fresh reply: every chunk in order, and whether reading stopped.
function run(events: Received[]): { chunks: ReplyChunk[]; done: boolean } {
  let state = newReply;
  const chunks: ReplyChunk[] = [];
  for (const event of events) {
    const receipt = receive(state, event);
    state = receipt.state;
    chunks.push(...receipt.chunks);
    if (receipt.done === true) return { chunks, done: true };
  }
  return { chunks, done: false };
}

const play = (...drafts: Draft[]) => run(numbered([start, ...drafts]));

// The turn the chunks build, as the worker folds it.
const turnOf = (chunks: ReplyChunk[]): AgentMessage =>
  chunks.reduce((turn, chunk) => applyChunk(turn, chunk), startReply("r1", "9:00"));

describe("receive streams text", () => {
  it("streams text through the markdown emitter, a block per blockId", () => {
    const { chunks, done } = play(
      { type: "text", blockId: "r1b0", delta: "Friday was " },
      { type: "text", blockId: "r1b0", delta: "**busiest**." },
      { type: "text", blockId: "r2b0", delta: "It *eased* after." },
      { type: "end", reason: "answered" },
    );
    expect(done).toBe(true);
    expect(chunks.slice(0, 2)).toEqual([
      { kind: "block", block: "paragraph" },
      { kind: "text", text: "Friday " },
    ]);
    expect(turnOf(chunks).blocks).toEqual([
      paragraph([text("Friday was "), strong("busiest"), text(".")]),
      paragraph([text("It "), em("eased"), text(" after.")]),
    ]);
  });
});

describe("receive streams thinking", () => {
  it("replaces the approach summary without closing the words it interrupts", () => {
    const { chunks } = play(
      { type: "thinking", blockId: "approach", delta: "I plan to compare the days." },
      { type: "thinking", blockId: "approach", delta: "I plan to compare known weekdays." },
      { type: "text", blockId: "r1b1", delta: "Friday was " },
      {
        type: "thinking",
        blockId: "approach",
        delta: "I plan to compare weekdays without filling gaps.",
      },
      { type: "text", blockId: "r1b1", delta: "busiest." },
      { type: "end", reason: "answered" },
    );
    const turn = turnOf(chunks);
    expect(turn.thinking).toBe("I plan to compare weekdays without filling gaps.");
    expect(turn.blocks).toEqual([paragraph([text("Friday was busiest.")])]);
    expect(turn.work).toBeUndefined();
  });
});

describe("receive folds work and cards", () => {
  it("turns work into a step, and an outcome into its result, basis and a summary", () => {
    const { chunks } = play(working, {
      type: "outcome",
      workId: "sum",
      result: "Friday was busiest",
      evidence: ["Added Monday to Friday"],
    });
    const settled = {
      id: "sum",
      label: "Adding up",
      status: "done",
      outcome: "Friday was busiest",
    };
    expect(chunks).toEqual([
      { kind: "step", step: { id: "sum", label: "Adding up", status: "running" } },
      { kind: "step", step: { ...settled, basis: ["Added Monday to Friday"] } },
      { kind: "summary", text: "Friday was busiest" },
    ]);
  });

  it("shows a card under its id, so a repeat replaces it in place, and logs a note", () => {
    const shown: Draft = { type: "card", cardId: "week", selection: SELECTION };
    const redrawn: Selection = { ...SELECTION, props: { ...SELECTION.props, title: "Redrawn" } };
    const { chunks } = play(
      shown,
      { type: "text", blockId: "r1b0", delta: "Between." },
      { ...shown, selection: redrawn, note: "Rows trimmed" },
    );
    expect(chunks.at(-1)).toEqual({ kind: "log", text: COPY.cardNote("week", "Rows trimmed") });
    expect(turnOf(chunks).blocks).toEqual([card(redrawn, "week"), paragraph([text("Between.")])]);
  });
});

describe("receive folds limitations and questions", () => {
  it("fails a limitation's step and says it in the words with its recovery", () => {
    const recovery = { label: "Use examples", prompt: "Chart example numbers" };
    const { chunks, done } = play(working, {
      type: "failure",
      workId: "sum",
      limitation: "I cannot fetch real sales.",
      recovery,
    });
    expect(done).toBe(false);
    const turn = turnOf(chunks);
    expect(turn.work?.steps).toEqual([
      { id: "sum", label: "Adding up", status: "failed", outcome: "I cannot fetch real sales." },
    ]);
    expect(turn.blocks).toEqual([limitation("I cannot fetch real sales.", recovery)]);
    expect(turn.ended).toBeUndefined();
  });

  it("says a limitation with no step or recovery in the words alone", () => {
    const { chunks } = play({
      type: "failure",
      workId: null,
      limitation: "I cannot see files.",
      recovery: null,
    });
    const turn = turnOf(chunks);
    expect(turn.blocks).toEqual([limitation("I cannot see files.")]);
    expect(turn.work).toBeUndefined();
  });

  it("docks a question and stops reading, closing the words before it", () => {
    const { chunks, done } = play(
      { type: "text", blockId: "r1b0", delta: "One choice" },
      { type: "question", questionId: "t1_1", question: QUESTION },
      { type: "end", reason: "asked" },
    );
    expect(done).toBe(true);
    expect(chunks.at(-1)).toEqual({ kind: "question", question: QUESTION });
    expect(turnOf(chunks)).toMatchObject({ text: "One choice", asks: QUESTION });
  });
});

describe("receive ends a reply", () => {
  it("normally when it answered, leaving no failure", () => {
    const { chunks, done } = play(working, { type: "end", reason: "answered" });
    expect(done).toBe(true);
    expect(turnOf(chunks).failure).toBeUndefined();
  });

  it("short at a limit, with running steps cancelled first and the end's line as detail", () => {
    const { chunks } = play(
      working,
      { type: "text", blockId: "r1b0", delta: "Friday was" },
      { type: "end", reason: "limit", line: "I stopped before finishing this reply." },
    );
    expect(chunks.slice(-2)).toEqual([
      { kind: "step", step: { id: "sum", label: "Adding up", status: "cancelled" } },
      {
        kind: "failure",
        failure: {
          title: COPY.ended.limit.title,
          detail: "I stopped before finishing this reply.",
        },
      },
    ]);
    expect(turnOf(chunks)).toMatchObject({ text: "Friday was", ended: "interrupted" });
  });

  it("short when the upstream stopped, in its own words when `end` has no line", () => {
    const { chunks } = play({ type: "end", reason: "upstream" });
    expect(chunks).toEqual([{ kind: "failure", failure: COPY.ended.upstream }]);
    expect(turnOf(chunks).ended).toBe("failed");
  });
});

describe("receive ends a broken stream", () => {
  it("naming a version mismatch at a start of another protocol", () => {
    const { chunks, done } = run(numbered([{ type: "start", v: 1 }, working]));
    expect(done).toBe(true);
    expect(chunks).toEqual([{ kind: "failure", failure: COPY.version }]);
  });

  it("cut off when the first line is not a start", () => {
    expect(run(numbered([working])).chunks).toEqual([{ kind: "failure", failure: COPY.cutOff }]);
  });

  it("cut off by the caller, with the held words flushed and the steps cancelled", () => {
    const events = numbered([start, working, { type: "text", blockId: "r1b0", delta: "Half **a" }]);
    const read = events.reduce(
      (receipt, event) => {
        const next = receive(receipt.state, event);
        return { state: next.state, chunks: [...receipt.chunks, ...next.chunks] };
      },
      { state: newReply, chunks: [] as ReplyChunk[] },
    );
    const broken = endShort(read.state, COPY.cutOff);
    expect(turnOf([...read.chunks, ...broken.chunks])).toMatchObject({
      blocks: [paragraph([text("Half "), strong("a")])],
      work: { steps: [{ id: "sum", status: "cancelled" }] },
      failure: COPY.cutOff,
    });
  });
});

describe("receive counts seq", () => {
  it("ignores a replayed line", () => {
    const [first, second] = numbered([start, working]);
    expect(run([first, second, second, first]).chunks).toHaveLength(1);
  });

  it("treats a gap as a lost line and ends the reply cut off", () => {
    const events = numbered([start, working, working]).filter((event) => event.seq !== 1);
    expect(run(events)).toEqual({
      chunks: [{ kind: "failure", failure: COPY.cutOff }],
      done: true,
    });
  });
});

describe("readLine", () => {
  it("reads an event of this protocol, a start of any version, and nothing else", () => {
    expect(readLine('{"type":"start","seq":0,"v":3}')).toEqual({ type: "start", seq: 0, v: 3 });
    expect(readLine('{"type":"start","seq":0,"v":1}')).toEqual({ type: "start", seq: 0, v: 1 });
    expect(readLine('{"type":"narration","seq":1}')).toBeUndefined();
    expect(readLine("{not json")).toBeUndefined();
  });
});
