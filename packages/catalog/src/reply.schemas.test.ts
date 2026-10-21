import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { blockSchema, type Block } from "./prose";
import {
  applyChunk,
  endedSchema,
  failureSchema,
  replyChunkSchema,
  replyEventSchema,
  startReply,
  workSchema,
  type workStepSchema,
  type Ended,
  type Failure,
  type ReplyChunk,
  type ReplyEvent,
  type Work,
  type WorkStep,
} from "./reply";

// One of every event the seam carries, in an order a reply might send them.
const events: ReplyEvent[] = [
  { kind: "activity", text: "Reading the tickets." },
  { kind: "thinking", text: "The backlog is the queue at close." },
  { kind: "step", step: { id: "s1", label: "Count cases", status: "running" } },
  { kind: "block", block: "heading" },
  { kind: "text", text: "Backlog", mark: "strong" },
  { kind: "block", block: "paragraph" },
  { kind: "link", text: "the queue", href: "https://example.com/queue" },
  { kind: "block", block: "item" },
  { kind: "card", payload: { component: "BarChart" } },
  { kind: "card", payload: { component: "LineChart", draft: true }, id: "trend" },
  { kind: "card", payload: { component: "LineChart" }, id: "trend" },
  { kind: "limitation", text: "No live sales here." },
  {
    kind: "limitation",
    text: "The catalog has no pie chart.",
    recovery: { label: "Show it as a bar chart", prompt: "Show it as a bar chart" },
  },
  {
    kind: "step",
    step: {
      id: "s1",
      label: "Count cases",
      status: "done",
      outcome: "46 open",
      basis: ["Counted open tickets at close", "Left out the weekend"],
      evidence: { rows: 3 },
      threadId: "t-1",
    },
  },
  { kind: "log", text: "GET /tickets 200" },
  { kind: "summary", text: "Counted the backlog" },
  { kind: "question", question: { question: "Which week?" } },
  { kind: "failure", failure: { title: "Reply interrupted", detail: "The source went quiet." } },
  { kind: "failure", failure: { title: "Sign-in needed", detail: "Nothing sent.", retry: false } },
];

describe("the seam's schemas", () => {
  it("parse exactly the seam's types, so a member added to one fails to compile", () => {
    expectTypeOf<z.infer<typeof blockSchema>>().toEqualTypeOf<Block>();
    expectTypeOf<z.infer<typeof workStepSchema>>().toEqualTypeOf<WorkStep>();
    expectTypeOf<z.infer<typeof workSchema>>().toEqualTypeOf<Work>();
    expectTypeOf<z.infer<typeof failureSchema>>().toEqualTypeOf<Failure>();
    expectTypeOf<z.infer<typeof endedSchema>>().toEqualTypeOf<Ended>();
    expectTypeOf<z.infer<typeof replyEventSchema>>().toEqualTypeOf<ReplyEvent>();
    expectTypeOf<z.infer<typeof replyChunkSchema>>().toEqualTypeOf<ReplyChunk>();
  });

  it("parse a plain word and every event unchanged", () => {
    const chunks: ReplyChunk[] = ["Closed cases rose.", ...events];
    expect(chunks.map((chunk) => replyChunkSchema.parse(chunk))).toEqual(chunks);
  });

  it("refuse an event they do not know, a step with no status, and anything but words", () => {
    expect(replyChunkSchema.safeParse({ kind: "shout", text: "Hi" }).success).toBe(false);
    const step = { kind: "step", step: { id: "s1", label: "Count cases" } };
    expect(replyEventSchema.safeParse(step).success).toBe(false);
    expect(replyChunkSchema.safeParse(42).success).toBe(false);
  });

  it("refuse a failure that offers retry: true, since only false says anything", () => {
    const failure = { title: "Reply interrupted", detail: "Try again.", retry: true };
    expect(failureSchema.safeParse(failure).success).toBe(false);
  });

  it("parse the blocks, the work and the ending a folded reply holds", () => {
    const turn = events.reduce(
      (folded, event) => applyChunk(folded, event),
      startReply("a1", "9:02"),
    );
    expect(z.array(blockSchema).parse(turn.blocks)).toEqual(turn.blocks);
    expect(workSchema.parse(turn.work)).toEqual(turn.work);
    expect(failureSchema.parse(turn.failure)).toEqual(turn.failure);
    expect(endedSchema.parse(turn.ended)).toBe("interrupted");
  });
});
