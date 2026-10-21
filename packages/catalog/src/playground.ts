import { z } from "zod";
import { awaitingSchema } from "./awaiting";
import { selectionSchema } from "./catalog";

// Shared field shapes. `slug` is an id the model picks (cardId, workId); `line` is one short
// line of text the page shows as is.
const seq = z.number().int().nonnegative();
const slug = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const line = z.string().trim().min(1).max(160);
const id = z.string().min(1).max(64);
const workStatus = z.enum(["running", "done", "failed"]);

/**
 * Wire version of the playground stream; bump on any breaking change to the event union. A
 * page on one version fails the `start` event of a gateway on another.
 */
export const PLAYGROUND_PROTOCOL = 4;

/**
 * One NDJSON line of the gateway's /api/playground stream. The gateway emits only events that
 * parse here, and the page rejects any line that does not; unknown keys are rejected.
 *
 * Every event means what it says when it arrives, and nothing is relabelled after emission:
 * `text` is answer prose from its first delta, `thinking.delta` is a complete approach summary
 * replacing the previous summary, never raw reasoning and never
 * the answer, progress reaches the page only through `work` labels, and `end` carries the closing failure's sentence in `line` (for `limit` and
 * `upstream`), so a reader never has to look one event ahead.
 */
export const playgroundEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), seq, v: z.literal(PLAYGROUND_PROTOCOL) }),
  z.strictObject({ type: z.literal("text"), seq, blockId: id, delta: z.string() }),
  z.strictObject({ type: z.literal("thinking"), seq, blockId: id, delta: z.string() }),
  z.strictObject({ type: z.literal("work"), seq, workId: slug, label: line, status: workStatus }),
  z.strictObject({
    type: z.literal("card"),
    seq,
    cardId: slug,
    selection: selectionSchema,
    note: line.optional(),
  }),
  z.strictObject({ type: z.literal("question"), seq, questionId: id, question: awaitingSchema }),
  z.strictObject({
    type: z.literal("outcome"),
    seq,
    workId: slug,
    result: line,
    evidence: z.array(line).max(6),
  }),
  z.strictObject({
    type: z.literal("failure"),
    seq,
    workId: slug.nullable(),
    limitation: line,
    recovery: z.strictObject({ label: z.string().trim().min(1).max(40), prompt: line }).nullable(),
  }),
  z.strictObject({
    type: z.literal("end"),
    seq,
    reason: z.enum(["answered", "asked", "limit", "upstream"]),
    line: line.optional(),
  }),
]);

/** A validated playground stream event. */
export type PlaygroundEvent = z.infer<typeof playgroundEventSchema>;

/** Input of `update_work`: starts or updates one visible work item. */
export const updateWorkInputSchema = z.strictObject({
  workId: slug,
  label: line,
  status: workStatus,
});
/** Validated `update_work` input. */
export type UpdateWorkInput = z.infer<typeof updateWorkInputSchema>;

/** Input of `show_card`: one catalog card; the same cardId replaces the earlier card. */
export const showCardInputSchema = z.strictObject({ cardId: slug, card: selectionSchema });
/** Validated `show_card` input. */
export type ShowCardInput = z.infer<typeof showCardInputSchema>;

/** Input of `ask_question`: a decision the user must answer or skip (ADR-039). */
export const askQuestionInputSchema = z.strictObject({ question: awaitingSchema });
/** Validated `ask_question` input. */
export type AskQuestionInput = z.infer<typeof askQuestionInputSchema>;

/** Input of `report_outcome`: settles one work item with its result and evidence. */
export const reportOutcomeInputSchema = z.strictObject({
  workId: slug,
  result: line,
  evidence: z.array(line).max(6),
});
/** Validated `report_outcome` input. */
export type ReportOutcomeInput = z.infer<typeof reportOutcomeInputSchema>;

/** Input of `report_failure`: a limitation the user must see, with an optional way forward. */
export const reportFailureInputSchema = z.strictObject({
  workId: slug.nullable().optional(),
  limitation: line,
  recovery_prompt: line.optional(),
});
/** Validated `report_failure` input. */
export type ReportFailureInput = z.infer<typeof reportFailureInputSchema>;

// A tool as the Anthropic Messages API takes it; `input_schema` must be a top-level object.
type PlaygroundTool = {
  name: string;
  description: string;
  input_schema: { type: "object"; [key: string]: unknown };
};

// JSON Schema for a tool input. Refinements (the awaiting sentence count) do not survive the
// conversion; the gateway enforces them with safeParse, which is intended.
function toolSchema(schema: z.ZodObject): PlaygroundTool["input_schema"] {
  return { ...z.toJSONSchema(schema), type: "object" }; // → top-level object JSON Schema
}

/** The tools the playground agent may call, in the Anthropic `tools` shape. */
export const playgroundTools: readonly PlaygroundTool[] = [
  {
    name: "update_work",
    description:
      "Start or update one step of work the user can watch. Call it before each step, with a " +
      "short factual label such as 'Totalling cases by week'. Reuse the same workId to update " +
      "that step; set status done or failed when it ends. Put progress here, never in prose.",
    input_schema: toolSchema(updateWorkInputSchema),
  },
  {
    name: "show_card",
    description:
      "Show data to the user as one catalog card (LineChart, BarChart or DataTable). This is the " +
      "only way to show numbers as a chart or table. Use only numbers the user gave you or " +
      "plainly illustrative ones, and say which in source. Reuse a cardId to replace that card.",
    input_schema: toolSchema(showCardInputSchema),
  },
  {
    name: "ask_question",
    description:
      "Ask the user one decision you cannot make for them. `options` are the choices, up to " +
      "four. `answer.placeholder` is a short example answer for the row where the user types " +
      "their own. `elsewhere` is the label of the final way-out row the user can pick instead " +
      'of answering, such as "Chat about something else"; leave it out unless you want to word ' +
      "that row, and never put notes or explanations there. After calling it, stop: the " +
      "user's answer or skip arrives as this tool's result in the next turn.",
    input_schema: toolSchema(askQuestionInputSchema),
  },
  {
    name: "report_outcome",
    description:
      "Settle one work item with its result in one line and up to six short lines of evidence. " +
      "Use the workId you gave update_work.",
    input_schema: toolSchema(reportOutcomeInputSchema),
  },
  {
    name: "report_failure",
    description:
      "Tell the user about something you cannot do, such as fetching real data. State the " +
      "limitation in one plain line and, when there is one, a recovery_prompt the user can " +
      "send instead. Pass the workId it belongs to, or null.",
    input_schema: toolSchema(reportFailureInputSchema),
  },
];

const userTurnSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("say"), text: z.string().trim().min(1).max(4000) }),
  z.strictObject({
    kind: z.literal("answer"),
    questionId: id,
    text: z.string().trim().min(1).max(400),
  }),
  z.strictObject({ kind: z.literal("skip"), questionId: id }),
]);

/** What the user sent for one exchange: a message, an answer to a question, or a skip. */
export type UserInput = z.infer<typeof userTurnSchema>;

const agentTurnSchema = z.strictObject({
  text: z.string().max(20_000), // the reply's prose
  cards: z.array(z.strictObject({ cardId: slug, selection: selectionSchema })).max(12),
  outcomes: z.array(z.strictObject({ workId: slug, result: line })).max(12),
  failures: z.array(z.strictObject({ limitation: line })).max(12),
  question: z.strictObject({ questionId: id, question: awaitingSchema }).optional(),
});

/**
 * The page's history for POST /api/playground. The last exchange has no agent turn: it is the
 * one being asked now. Unknown keys are rejected.
 */
export const playgroundRequestSchema = z.strictObject({
  exchanges: z
    .array(z.strictObject({ user: userTurnSchema, agent: agentTurnSchema.optional() }))
    .min(1)
    .max(50),
});

/** A validated playground request body. */
export type PlaygroundRequest = z.infer<typeof playgroundRequestSchema>;
