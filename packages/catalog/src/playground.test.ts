import { describe, expect, it } from "vitest";
import { playgroundEventSchema, playgroundRequestSchema, playgroundTools } from "./playground";

const selection = {
  catalogVersion: "1",
  component: "BarChart",
  props: {
    title: "Cases by team",
    source: "Illustrative numbers",
    unit: "cases",
    variant: "comparison",
    rows: [
      { label: "North", value: 12 },
      { label: "South", value: 7 },
    ],
  },
};
const question = {
  question: "Which week should I chart?",
  options: [{ label: "Last week" }, { label: "This week" }],
  answer: { placeholder: "Name a week" },
};
const events = [
  { type: "start", seq: 0, v: 4 },
  { type: "thinking", seq: 1, blockId: "r0b0", delta: "They want cases by team." },
  { type: "text", seq: 2, blockId: "r0b1", delta: "Here" },
  { type: "work", seq: 3, workId: "chart", label: "Totalling cases", status: "running" },
  { type: "card", seq: 4, cardId: "cases", selection, note: "Shown as a table" },
  { type: "question", seq: 5, questionId: "functions.ask_question:1", question },
  { type: "outcome", seq: 6, workId: "chart", result: "Charted", evidence: ["2 teams"] },
  {
    type: "failure",
    seq: 7,
    workId: null,
    limitation: "I cannot fetch real data.",
    recovery: { label: "Send this", prompt: "Chart these numbers: 3, 5" },
  },
  { type: "end", seq: 8, reason: "answered" },
  { type: "end", seq: 9, reason: "limit", line: "I stopped before finishing this reply." },
];

const skip = (questionId: string) => ({ exchanges: [{ user: { kind: "skip", questionId } }] });

describe("playground contract", () => {
  it.each(playgroundTools)("gives $name a top-level object input schema", (tool) => {
    expect(tool.input_schema.type).toBe("object");
    expect(tool.description.length).toBeGreaterThan(0);
  });
  it("tells the model what ask_question's elsewhere and placeholder are for", () => {
    const ask = playgroundTools.find((tool) => tool.name === "ask_question");
    expect(ask?.description).toMatch(/`elsewhere` is the label of the final way-out row/);
    expect(ask?.description).toMatch(/never put notes or explanations/i);
    expect(ask?.description).toMatch(/`answer\.placeholder` is a short example answer/);
  });
  it.each(events)("parses a valid $type event", (event) => {
    expect(playgroundEventSchema.safeParse(event).success).toBe(true);
  });
  it.each(events)("rejects a $type event with an unknown key", (event) => {
    expect(playgroundEventSchema.safeParse({ ...event, extra: true }).success).toBe(false);
  });
  it("rejects a card event whose selection is outside the catalog", () => {
    const card = { ...events[4], selection: { ...selection, component: "PieChart" } };
    expect(playgroundEventSchema.safeParse(card).success).toBe(false);
  });
  it("accepts a two-exchange history with a card and an answered question", () => {
    const request = {
      exchanges: [
        {
          user: { kind: "say", text: "Chart cases by team" },
          agent: {
            text: "Here are the cases.",
            cards: [{ cardId: "cases", selection }],
            outcomes: [{ workId: "chart", result: "Charted" }],
            failures: [],
            question: { questionId: "q1", question },
          },
        },
        { user: { kind: "answer", questionId: "q1", text: "Last week" } },
      ],
    };
    expect(playgroundRequestSchema.safeParse(request).success).toBe(true);
  });
  it("rejects a questionId longer than 64 characters", () => {
    expect(playgroundRequestSchema.safeParse(skip("q".repeat(64))).success).toBe(true);
    expect(playgroundRequestSchema.safeParse(skip("q".repeat(65))).success).toBe(false);
  });
  it("rejects a request with no exchanges", () => {
    expect(playgroundRequestSchema.safeParse({ exchanges: [] }).success).toBe(false);
  });
});

describe("playground protocol 4", () => {
  it("rejects a start event from another protocol version", () => {
    expect(playgroundEventSchema.safeParse({ type: "start", seq: 0, v: 2 }).success).toBe(false);
  });
  it("has no event that relabels streamed text", () => {
    const relabel = { type: "narration", seq: 2, blockId: "r0b1", workId: "chart" };
    expect(playgroundEventSchema.safeParse(relabel).success).toBe(false);
  });
  it("rejects an end event whose line is blank", () => {
    const blank = { type: "end", seq: 8, reason: "upstream", line: " " };
    expect(playgroundEventSchema.safeParse(blank).success).toBe(false);
  });
});
