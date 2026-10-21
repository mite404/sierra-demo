import { describe, expect, it } from "vitest";
import type { ThreadMessage } from "./thread";
import {
  activityOf,
  awaitingOf,
  groupAnswers,
  latestEnded,
  recapOf,
  requestBefore,
  runningActivity,
} from "./transcript";

const ask = (id: string, text: string): ThreadMessage => ({ id, role: "user", text, time: "9:00" });
const answer = (id: string, question: string, text: string): ThreadMessage => ({
  id,
  role: "user",
  text,
  question,
  time: "9:01",
});
const reply = (id: string, text = "Done."): Extract<ThreadMessage, { role: "agent" }> => ({
  id,
  role: "agent",
  text,
  time: "9:02",
});

describe("groupAnswers", () => {
  it("keeps every turn on its own when nothing answered a question", () => {
    const items = groupAnswers([ask("u1", "Hi"), reply("a1")]);
    expect(items.map((item) => item.kind)).toEqual(["turn", "turn"]);
  });

  it("merges consecutive answers into one item, keyed by the first", () => {
    const items = groupAnswers([
      ask("u1", "Plan the week"),
      reply("a1"),
      answer("u2", "Which region?", "North"),
      answer("u3", "How many weeks?", "Four"),
      reply("a2"),
    ]);
    expect(items.map((item) => item.kind)).toEqual(["turn", "turn", "answers", "turn"]);
    expect(items[2]).toMatchObject({
      kind: "answers",
      id: "answers-u2",
      messages: [{ id: "u2" }, { id: "u3" }],
    });
  });

  it("starts a new surface when a turn comes between two answers", () => {
    const items = groupAnswers([
      answer("u1", "Which region?", "North"),
      reply("a1"),
      answer("u2", "How many weeks?", "Four"),
    ]);
    expect(items.map((item) => item.kind)).toEqual(["answers", "turn", "answers"]);
  });

  it("never merges a plain request into an answer surface", () => {
    const items = groupAnswers([answer("u1", "Which region?", "North"), ask("u2", "Also south")]);
    expect(items.map((item) => item.kind)).toEqual(["answers", "turn"]);
  });
});

describe("requestBefore", () => {
  const messages = [
    ask("u1", "Compare the regions"),
    reply("a1"),
    answer("u2", "Which region?", "North"),
    reply("a2"),
  ];

  it("reads a reply's request back as a message", () => {
    expect(requestBefore(messages, "a1")).toEqual({
      kind: "message",
      text: "Compare the regions",
      attachments: [],
    });
  });

  it("reads an answer back as an answer", () => {
    expect(requestBefore(messages, "a2")).toEqual({ kind: "answer", text: "North" });
  });

  it("finds nothing before the first turn, or for a turn not in the thread", () => {
    expect(requestBefore([reply("a0"), ...messages], "a0")).toBeUndefined();
    expect(requestBefore(messages, "gone")).toBeUndefined();
  });
});

describe("latestEnded", () => {
  it("finds the latest reply that stopped short, of any kind", () => {
    const messages: ThreadMessage[] = [
      { ...reply("a1"), ended: "interrupted" },
      reply("a2"),
      { ...reply("a3"), ended: "cancelled" },
      reply("a4"),
    ];
    expect(latestEnded(messages)).toBe("a3");
    expect(latestEnded([reply("a1")])).toBeUndefined();
  });
});

describe("runningActivity", () => {
  it("reads the latest streaming reply's narration, or says it is working", () => {
    expect(runningActivity([reply("a1")])).toBeUndefined();
    expect(runningActivity([{ ...reply("a1"), streaming: true }])).toBe("Working");
    expect(
      runningActivity([
        { ...reply("a1"), streaming: true, activity: "Reading the cases." },
        { ...reply("a2"), streaming: true, activity: "Checking the refunds." },
      ]),
    ).toBe("Checking the refunds.");
  });
});

describe("recapOf", () => {
  it("lists each finished or failed step's outcome and a broken reply's title, by turn", () => {
    const worked: ThreadMessage = {
      ...reply("a1"),
      work: {
        steps: [
          { id: "n", label: "North", status: "done", outcome: "84 matched." },
          { id: "s", label: "South", status: "running" },
          { id: "c", label: "Central", status: "failed", outcome: "The ledger was locked." },
          { id: "p", label: "Pending", status: "cancelled", outcome: "Stopped early." },
        ],
        logs: [],
        narration: [],
      },
    };
    const broke: ThreadMessage = {
      ...reply("a2"),
      ended: "interrupted",
      failure: { title: "Reply interrupted", detail: "The line dropped." },
    };
    const stopped: ThreadMessage = {
      ...reply("a3"),
      ended: "cancelled",
      failure: { title: "Stopped", detail: "" },
    };
    expect(recapOf([ask("u1", "Go"), worked, broke, stopped])).toEqual([
      { text: "84 matched.", turnId: "a1", stepId: "n" },
      { text: "The ledger was locked.", turnId: "a1", stepId: "c" },
      { text: "Reply interrupted", turnId: "a2" },
    ]);
  });

  it("is empty for plain replies", () => {
    expect(recapOf([ask("u1", "Hi"), reply("a1")])).toEqual([]);
  });
});

describe("activityOf", () => {
  const at = "2026-09-30T09:00:00.000Z";
  it("reads when the user last spoke and whether a reply has settled since", () => {
    const settled = [{ ...ask("u1", "Go"), time: at }, reply("a1")];
    expect(activityOf(settled)).toEqual({ active: true, lastUserInputAt: Date.parse(at) });
    const streaming = [
      { ...ask("u1", "Go"), time: at },
      { ...reply("a1"), streaming: true },
    ];
    expect(activityOf(streaming)).toEqual({ active: false, lastUserInputAt: Date.parse(at) });
    const unanswered = [reply("a0"), { ...ask("u1", "Go"), time: at }];
    expect(activityOf(unanswered)).toEqual({ active: false, lastUserInputAt: Date.parse(at) });
  });

  it("is undefined with no user turn, or a user turn timed as a clock reading", () => {
    expect(activityOf([reply("a1")])).toBeUndefined();
    expect(activityOf([ask("u1", "Go"), reply("a1")])).toBeUndefined();
  });
});

describe("awaitingOf", () => {
  const question = { question: "Which order?" };
  it("is the question the latest reply ended on, until a turn follows it", () => {
    expect(awaitingOf([ask("u1", "Go"), { ...reply("a1"), asks: question }])).toEqual(question);
    expect(
      awaitingOf([ask("u1", "Go"), { ...reply("a1"), asks: question }, answer("u2", "Q", "A")]),
    ).toBeUndefined();
    expect(awaitingOf([ask("u1", "Go"), reply("a1")])).toBeUndefined();
    expect(awaitingOf([])).toBeUndefined();
  });
});
