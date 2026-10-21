import { describe, expect, it } from "vitest";
import { plainText } from "./prose";
import {
  applyChunk,
  cancelReply,
  completeReply,
  failReply,
  hasWork,
  isEmptyReply,
  startReply,
  workLabel,
  type AgentMessage,
  type ReplyChunk,
  type Work,
} from "./reply";

const fold = (chunks: ReplyChunk[]): AgentMessage =>
  chunks.reduce(applyChunk, startReply("a1", "9:02"));

describe("applyChunk", () => {
  it("keeps a plain word stream plain: text grows, no blocks appear", () => {
    const turn = fold(["Closed", " cases", " rose."]);
    expect(turn.text).toBe("Closed cases rose.");
    expect(turn.blocks).toBeUndefined();
  });

  it("turns structured the moment a mark arrives, carrying the words so far", () => {
    const turn = fold([
      "The backlog fell from ",
      { kind: "text", text: "46 to 18", mark: "strong" },
    ]);
    expect(turn.blocks).toEqual([
      {
        kind: "paragraph",
        content: [
          { kind: "run", text: "The backlog fell from " },
          { kind: "run", text: "46 to 18", mark: "strong" },
        ],
      },
    ]);
    expect(turn.text).toBe("The backlog fell from 46 to 18");
  });

  it("joins words streamed one at a time into one run per mark", () => {
    const turn = fold([
      { kind: "text", text: "12", mark: "strong" },
      { kind: "text", text: " are", mark: "strong" },
      { kind: "text", text: " billing", mark: "strong" },
      { kind: "text", text: "." },
    ]);
    expect(turn.blocks?.[0]).toEqual({
      kind: "paragraph",
      content: [
        { kind: "run", text: "12 are billing", mark: "strong" },
        { kind: "run", text: "." },
      ],
    });
  });

  it("opens paragraphs, headings and list items where the stream says", () => {
    const turn = fold([
      { kind: "block", block: "heading" },
      { kind: "text", text: "What I'd flag" },
      { kind: "block", block: "list" },
      { kind: "text", text: "Access requests" },
      { kind: "block", block: "item" },
      { kind: "text", text: "Product questions" },
      { kind: "block", block: "paragraph" },
      { kind: "text", text: "Nothing needs escalation." },
    ]);
    expect(turn.blocks?.map((block) => block.kind)).toEqual(["heading", "list", "paragraph"]);
    expect(turn.blocks?.[1]).toEqual({
      kind: "list",
      items: [
        [{ kind: "run", text: "Access requests" }],
        [{ kind: "run", text: "Product questions" }],
      ],
    });
    expect(plainText(turn.blocks ?? [])).toBe(
      "What I'd flag\nAccess requests\nProduct questions\nNothing needs escalation.",
    );
  });

  it("places a card between paragraphs and starts a new paragraph after it", () => {
    const turn = fold([
      "Before.",
      { kind: "card", payload: { component: "LineChart" } },
      { kind: "text", text: "After." },
    ]);
    expect(turn.blocks?.map((block) => block.kind)).toEqual(["paragraph", "card", "paragraph"]);
    expect(turn.text).toBe("Before.After.");
  });

  it("replaces a card in place when a later card carries its id", () => {
    const draft = { component: "BarChart", props: { title: "Draft" } };
    const settled = { component: "BarChart", props: { title: "Settled" } };
    const turn = fold([
      "Before.",
      { kind: "card", payload: draft, id: "issues" },
      { kind: "card", payload: { component: "LineChart" } },
      { kind: "text", text: "After." },
      { kind: "card", payload: settled, id: "issues" },
      { kind: "text", text: " Still after." },
    ]);
    expect(turn.blocks).toEqual([
      { kind: "paragraph", content: [{ kind: "run", text: "Before." }] },
      { kind: "card", payload: settled, id: "issues" },
      { kind: "card", payload: { component: "LineChart" } },
      { kind: "paragraph", content: [{ kind: "run", text: "After. Still after." }] },
    ]);
  });

  it("says a limitation in the words and goes on: still streaming, a new paragraph after", () => {
    const recovery = { label: "Show it as a bar chart", prompt: "Show it as a bar chart" };
    const turn = fold([
      "First responses slowed.",
      { kind: "limitation", text: "The catalog has no pie chart.", recovery },
      { kind: "text", text: "Thursday was slowest." },
    ]);
    expect(turn.blocks).toEqual([
      { kind: "paragraph", content: [{ kind: "run", text: "First responses slowed." }] },
      { kind: "limitation", text: "The catalog has no pie chart.", recovery },
      { kind: "paragraph", content: [{ kind: "run", text: "Thursday was slowest." }] },
    ]);
    expect(turn.streaming).toBe(true);
    expect(turn.ended).toBeUndefined();
    expect(turn.failure).toBeUndefined();
    expect(turn.text).toBe(
      "First responses slowed.The catalog has no pie chart.Thursday was slowest.",
    );
    expect(plainText(turn.blocks ?? [])).toBe(
      "First responses slowed.\nThe catalog has no pie chart.\nThursday was slowest.",
    );
  });

  it("appends a card whose id no earlier card carries", () => {
    const turn = fold([
      { kind: "card", payload: 1, id: "a" },
      { kind: "card", payload: 2, id: "b" },
    ]);
    expect(turn.blocks).toEqual([
      { kind: "card", payload: 1, id: "a" },
      { kind: "card", payload: 2, id: "b" },
    ]);
  });

  it("supersedes narration and keeps what it replaced", () => {
    const turn = fold([
      { kind: "activity", text: "Thinking." },
      { kind: "activity", text: "Selecting the support records." },
      { kind: "activity", text: "Checking the workload." },
    ]);
    expect(turn.activity).toBe("Checking the workload.");
    expect(turn.work?.narration).toEqual(["Thinking.", "Selecting the support records."]);
  });

  it("replaces the thinking summary, apart from its words and its work", () => {
    const turn = fold([
      { kind: "thinking", text: "I plan to compare the days." },
      "Friday.",
      { kind: "thinking", text: "I plan to compare the known weekdays without filling gaps." },
    ]);
    expect(turn.thinking).toBe("I plan to compare the known weekdays without filling gaps.");
    expect(turn.text).toBe("Friday.");
    expect(turn.work).toBeUndefined();
    expect(hasWork(turn)).toBe(false);
  });

  it("upserts steps by id in the order they first appeared", () => {
    const turn = fold([
      { kind: "step", step: { id: "a", label: "Workload", status: "running" } },
      { kind: "step", step: { id: "b", label: "Issues", status: "running" } },
      {
        kind: "step",
        step: { id: "a", label: "Workload", status: "done", outcome: "Fell to 18." },
      },
      { kind: "log", text: "check:a done" },
    ]);
    expect(turn.work?.steps.map((step) => [step.id, step.status])).toEqual([
      ["a", "done"],
      ["b", "running"],
    ]);
    expect(turn.work?.logs).toEqual(["check:a done"]);
  });

  it("ends a reply that fails before any words as failed, and after some as interrupted", () => {
    const failure = { title: "Reply interrupted", detail: "The order system stopped answering." };
    const before = fold([
      { kind: "activity", text: "Thinking." },
      { kind: "failure", failure },
    ]);
    expect(before.ended).toBe("failed");
    expect(before.streaming).toBe(false);
    expect(before.activity).toBeUndefined();
    const after = fold(["39 of 41 match", { kind: "failure", failure }]);
    expect(after.ended).toBe("interrupted");
    expect(after.failure).toEqual(failure);
  });

  it("keeps a failure's word that asking again cannot help", () => {
    const failure = { title: "Sign-in needed", detail: "Nothing was sent.", retry: false as const };
    expect(fold([{ kind: "failure", failure }])).toMatchObject({ ended: "failed", failure });
  });

  it("keeps the question a reply ends on, so the dock can be read back from the record", () => {
    const turn = fold(["Ready.", { kind: "question", question: { question: "Which order?" } }]);
    expect(turn).toEqual({
      ...startReply("a1", "9:02"),
      text: "Ready.",
      asks: { question: "Which order?" },
    });
  });
});

describe("completeReply and cancelReply", () => {
  it("completes with the narration gone and nothing marked ended", () => {
    const turn = completeReply(fold([{ kind: "activity", text: "Writing." }, "Done."]));
    expect(turn).toMatchObject({ streaming: false, text: "Done." });
    expect(turn.activity).toBeUndefined();
    expect(turn.ended).toBeUndefined();
  });

  it("cancels with every unfinished step marked cancelled and the finished ones kept", () => {
    const turn = cancelReply(
      fold([
        { kind: "step", step: { id: "n", label: "North", status: "done", outcome: "84 matched." } },
        { kind: "step", step: { id: "s", label: "South", status: "running" } },
        { kind: "step", step: { id: "c", label: "Central", status: "pending" } },
      ]),
    );
    expect(turn.ended).toBe("cancelled");
    expect(turn.work?.steps.map((step) => step.status)).toEqual(["done", "cancelled", "cancelled"]);
  });
});

describe("failReply", () => {
  it("fails a reply that broke off before any words, in plain words", () => {
    const turn = failReply(fold([{ kind: "activity", text: "Thinking." }]));
    expect(turn).toMatchObject({
      ended: "failed",
      streaming: false,
      failure: { title: "Reply could not start" },
    });
    expect(turn.failure?.detail).toContain("Your request is still here");
    expect(turn.activity).toBeUndefined();
  });

  it("interrupts a reply that broke off after some words, keeping them", () => {
    const turn = failReply(fold(["39 of 41 match"]));
    expect(turn).toMatchObject({
      ended: "interrupted",
      text: "39 of 41 match",
      failure: { title: "Reply interrupted" },
    });
  });

  it("keeps how a turn already ended", () => {
    const stopped = cancelReply(fold(["Partial"]));
    expect(failReply(stopped)).toBe(stopped);
  });
});

describe("isEmptyReply", () => {
  it("calls a reply empty until it holds words, a card, work or an ending, however it thought", () => {
    expect(isEmptyReply(fold([]))).toBe(true);
    expect(isEmptyReply(fold([{ kind: "activity", text: "Thinking." }]))).toBe(true);
    expect(isEmptyReply(fold([{ kind: "thinking", text: "Hmm." }]))).toBe(true);
    expect(isEmptyReply(fold(["Done."]))).toBe(false);
    expect(isEmptyReply(fold([{ kind: "card", payload: {} }]))).toBe(false);
    expect(isEmptyReply(fold([{ kind: "log", text: "check ok" }]))).toBe(false);
    expect(isEmptyReply(fold([{ kind: "question", question: {} }]))).toBe(false);
    expect(isEmptyReply(cancelReply(fold([])))).toBe(false);
  });
});

// A settled reply with four steps in every state, and the summary it gave, if any.
const worked = (summary?: string): AgentMessage => ({
  ...startReply("a1", "9:02"),
  streaming: false,
  work: {
    steps: [
      { id: "a", label: "A", status: "done" },
      { id: "b", label: "B", status: "running" },
      { id: "c", label: "C", status: "failed" },
      { id: "d", label: "D", status: "cancelled" },
    ],
    logs: [],
    narration: [],
    summary,
  },
});

// A settled reply holding `work`, if any.
const settled = (work?: Work): AgentMessage => ({
  ...startReply("a1", "9:02"),
  streaming: false,
  work,
});

describe("hasWork", () => {
  it("counts steps, technical lines and kept narration, and nothing else", () => {
    const bare: Work = { steps: [], logs: [], narration: [] };
    const step: Work["steps"][number] = { id: "a", label: "A", status: "done" };
    expect(hasWork(settled())).toBe(false);
    expect(hasWork(settled(bare))).toBe(false);
    expect(hasWork(settled({ ...bare, steps: [step] }))).toBe(true);
    expect(hasWork(settled({ ...bare, logs: ["hold:south"] }))).toBe(true);
    expect(hasWork(settled({ ...bare, narration: ["Checking the vault."] }))).toBe(true);
  });
});

describe("workLabel", () => {
  it("says what the reply is doing while it streams, live, with the count beside it", () => {
    const streaming = { ...worked(), streaming: true, activity: "Checking open issues" };
    expect(workLabel(streaming)).toEqual({
      label: "Checking open issues",
      detail: "4 checks · 2 need attention",
      live: true,
    });
    expect(workLabel({ ...streaming, activity: undefined }).label).toBe("Working");
    expect(workLabel({ ...streaming, activity: "Writing the brief." }).label).toBe(
      "Writing the brief",
    );
  });

  it("says what the work amounted to once settled, in the reply's words or a plain state", () => {
    expect(workLabel(worked("Checked workload and open issues"))).toEqual({
      label: "Checked workload and open issues",
      detail: "4 checks · 2 need attention",
      live: false,
    });
    expect(workLabel(worked()).label).toBe("Work finished");
    expect(workLabel({ ...worked(), ended: "interrupted" }).label).toBe("Work incomplete");
    expect(workLabel({ ...worked(), ended: "cancelled" }).label).toBe("Stopped");
  });

  it("counts one check, one that needs attention, or technical lines alone", () => {
    const one: AgentMessage = {
      ...startReply("a1", "9:02"),
      streaming: false,
      work: { steps: [{ id: "a", label: "A", status: "failed" }], logs: [], narration: [] },
    };
    expect(workLabel(one).detail).toBe("1 check · 1 needs attention");
    const lines: AgentMessage = {
      ...startReply("a1", "9:02"),
      streaming: false,
      work: { steps: [], logs: ["hold:south"], narration: [] },
    };
    expect(workLabel(lines).detail).toBe("1 technical line");
    expect(workLabel(startReply("a1", "9:02")).detail).toBeUndefined();
  });
});
