import type { Anthropic } from "@anthropic-ai/sdk";
import { resolveAwaiting } from "@yaklabs/catalog/awaiting";
import { resolve } from "@yaklabs/catalog/catalog";
import {
  playgroundTools,
  reportFailureInputSchema,
  reportOutcomeInputSchema,
  showCardInputSchema,
  updateWorkInputSchema,
  type PlaygroundEvent,
} from "@yaklabs/catalog/playground";
import type { z } from "zod";

// An event before the gateway gives it its place in the stream.
type Unstamped<E> = E extends unknown ? Omit<E, "seq"> : never;

/** A playground event without its `seq`; `stamp` numbers it. */
export type EventDraft = Unstamped<PlaygroundEvent>;

/**
 * Everything one turn counts, carried from event to event so every limit is checked against
 * the same numbers: the next `seq`, rounds opened, tool calls made, the distinct cards shown
 * and validation failures per tool name (a tool that reaches its limit is retired). `shown`
 * is whether text, a card, an outcome, a failure or a question reached the page.
 */
export type TurnState = Readonly<{
  seq: number;
  round: number;
  toolCalls: number;
  cardIds: readonly string[];
  failures: Readonly<Record<string, number>>;
  shown: boolean;
  /** Tool execution permission; recovery can never reopen tools. */
  policy: "tools" | "recovery" | "proseOnly" | "stopped";
}>;

/** A tool call read whole from the stream; `input` is `{ ok: false }` when its JSON broke. */
export type ToolCall = {
  id: string;
  name: string;
  input: { ok: true; value: unknown } | { ok: false };
};

/**
 * What one tool call becomes: the events the page sees and the tool_result the model reads
 * next round, or "asked" when a question ends the turn and the user's reply is the result.
 */
export type Translation = {
  state: TurnState;
  events: PlaygroundEvent[];
  result: Anthropic.ToolResultBlockParam | "asked";
};

/** A turn before its first event. */
export const initialTurn: TurnState = {
  seq: 0,
  round: 0,
  toolCalls: 0,
  cardIds: [],
  failures: {},
  shown: false,
  policy: "tools",
};

// Tool calls one turn may make; Kimi was seen making one per round.
const MAX_TOOL_CALLS = 16;
// Distinct cards one turn may show; updating a card by its id does not count.
const MAX_CARDS = 6;
const RECOVERY_LABEL = "Send this";

// Validation failures that retire a tool for the rest of the turn: the failure that reaches
// the limit returns the last error that tool answers this turn, and the next round no longer
// offers it. The table is also the roster: HANDLERS below must answer for every name here,
// and a handler added without a limit fails the build.
const REMOVE_AFTER = {
  update_work: 2,
  show_card: 2,
  ask_question: 2,
  report_outcome: 2,
  report_failure: 2,
};

// A tool the turn offers, as the policy table names it.
type ToolName = keyof typeof REMOVE_AFTER;

// The table as a lookup: Map.get finds nothing inherited and needs no cast for a plain string.
const REMOVAL_LIMITS: ReadonlyMap<string, number> = new Map(Object.entries(REMOVE_AFTER));

// Whether `name`'s failures have retired it for this turn.
const isRemoved = (state: TurnState, name: string): boolean => {
  const limit = REMOVAL_LIMITS.get(name); // → number | undefined
  return limit !== undefined && (state.failures[name] ?? 0) >= limit;
};

/** Available tools, excluding retired tools or all tools when execution is disabled. */
export function toolsFor(state: TurnState): Anthropic.Tool[] {
  return state.policy === "tools"
    ? playgroundTools.filter((tool) => !isRemoved(state, tool.name))
    : [];
}

// A handler's verdict. "invalid" counts toward the tool's validation failures; "refused" is a
// limit, not a mistake in the input; "removed" is a retired tool called anyway.
type Verdict =
  | { kind: "shown"; state: TurnState; drafts: EventDraft[]; reply: string }
  | { kind: "asked"; drafts: EventDraft[] }
  | { kind: "invalid"; reason: string }
  | { kind: "refused"; reason: string }
  | { kind: "removed"; reason: string };

type Handler = (state: TurnState, input: unknown, id: string) => Verdict;

// Zod issues as one line the model can act on, in the style of `resolveAwaiting`.
const formatIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");

const updateWork: Handler = (state, input) => {
  const parsed = updateWorkInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid", reason: formatIssues(parsed.error) };
  const { workId, label, status } = parsed.data;
  return { kind: "shown", state, drafts: [{ type: "work", workId, label, status }], reply: "ok" };
};

const showCard: Handler = (state, input) => {
  const parsed = showCardInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid", reason: formatIssues(parsed.error) };
  const { cardId, card } = parsed.data;
  const known = state.cardIds.includes(cardId);
  if (!known && state.cardIds.length >= MAX_CARDS)
    return { kind: "refused", reason: "card limit reached" };
  const next = known ? state : { ...state, cardIds: [...state.cardIds, cardId] };
  const resolution = resolve(card); // → approved | fallback | empty | rejected
  switch (resolution.kind) {
    case "approved":
    case "empty":
      return {
        kind: "shown",
        state: next,
        drafts: [{ type: "card", cardId, selection: card }],
        reply: "shown",
      };
    case "fallback": {
      const { selection, reason } = resolution;
      const drafts: EventDraft[] = [{ type: "card", cardId, selection, note: reason }];
      return { kind: "shown", state: next, drafts, reply: `shown as a table: ${reason}` };
    }
    case "rejected":
      return { kind: "invalid", reason: resolution.reason };
    default: {
      const unhandled: never = resolution;
      return unhandled;
    }
  }
};

const askQuestion: Handler = (_state, input, id) => {
  const payload =
    typeof input === "object" && input !== null && "question" in input ? input.question : undefined;
  const resolution = resolveAwaiting(payload); // → approved | malformed
  if (resolution.kind === "malformed") return { kind: "invalid", reason: resolution.reason };
  return {
    kind: "asked",
    drafts: [{ type: "question", questionId: id, question: resolution.question }],
  };
};

const reportOutcome: Handler = (state, input) => {
  const parsed = reportOutcomeInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid", reason: formatIssues(parsed.error) };
  const { workId, result, evidence } = parsed.data;
  const drafts: EventDraft[] = [{ type: "outcome", workId, result, evidence }];
  return { kind: "shown", state, drafts, reply: "ok" };
};

const reportFailure: Handler = (state, input) => {
  const parsed = reportFailureInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid", reason: formatIssues(parsed.error) };
  const { workId, limitation, recovery_prompt: prompt } = parsed.data;
  const recovery = prompt === undefined ? null : { label: RECOVERY_LABEL, prompt };
  const drafts: EventDraft[] = [{ type: "failure", workId: workId ?? null, limitation, recovery }];
  return { kind: "shown", state, drafts, reply: "ok" };
};

// What one call to each tool becomes, keyed by every name in REMOVE_AFTER: a handler added
// without a limit there, or a limit without a handler here, fails the build.
const HANDLERS: Readonly<Record<ToolName, Handler>> = {
  update_work: updateWork,
  show_card: showCard,
  ask_question: askQuestion,
  report_outcome: reportOutcome,
  report_failure: reportFailure,
};

// The roster as a lookup: a name like "constructor" finds nothing inherited.
const HANDLERS_BY_NAME: ReadonlyMap<string, Handler> = new Map(Object.entries(HANDLERS));

// The tool's handler, or undefined for a name the roster does not know.
const handlerOf = (name: string): Handler | undefined => HANDLERS_BY_NAME.get(name);

const toolResult = (
  id: string,
  content: string,
  isError: boolean,
): Anthropic.ToolResultBlockParam =>
  isError
    ? { type: "tool_result", tool_use_id: id, content, is_error: true }
    : { type: "tool_result", tool_use_id: id, content };

// The unknown-tool error names what is still on offer, or prose when failures retired all.
const unknownTool = (state: TurnState, name: string): string => {
  const names = toolsFor(state)
    .map((tool) => tool.name)
    .join(", ");
  return names === ""
    ? `Unknown tool ${name}. Answer in prose.`
    : `Unknown tool ${name}. Use one of: ${names}.`;
};

// The handler's verdict for a call, before any counting. A retired tool is refused first: the
// round no longer offers it, but the model can hallucinate the call anyway.
const judge = (state: TurnState, { id, name, input }: ToolCall): Verdict => {
  if (isRemoved(state, name))
    return { kind: "removed", reason: `${name} is no longer available this turn.` };
  const handler = handlerOf(name);
  if (handler === undefined) return { kind: "invalid", reason: unknownTool(state, name) };
  if (!input.ok) return { kind: "invalid", reason: "The input was not valid JSON." };
  return handler(state, input.value, id);
};

// A retired-tool call requests recovery without increasing its failure count. Input mistakes
// count toward retirement; resource refusals leave the policy alone.
const rejectCall = (
  state: TurnState,
  call: ToolCall,
  verdict: Verdict & { reason: string },
): Translation => {
  if (verdict.kind === "refused" || verdict.kind === "removed")
    return {
      state: verdict.kind === "removed" ? { ...state, policy: "recovery" } : state,
      events: [],
      result: toolResult(call.id, verdict.reason, true),
    };
  const count = (state.failures[call.name] ?? 0) + 1;
  const limit = REMOVAL_LIMITS.get(call.name) ?? 2; // an unknown name has no offer to lose
  const reason = count >= limit ? `${verdict.reason} Answer in prose instead.` : verdict.reason;
  const next = { ...state, failures: { ...state.failures, [call.name]: count } };
  return { state: next, events: [], result: toolResult(call.id, reason, true) };
};

// Which events count as an answer the user can see. A Record over every type, so a new event
// type fails the build until it is placed here. Text counts from its first delta, which always
// carries a visible character (`playgroundRound` holds leading whitespace back).
const SHOWS_ANSWER: Readonly<Record<EventDraft["type"], boolean>> = {
  start: false,
  text: true,
  thinking: false,
  work: false,
  card: true,
  outcome: true,
  failure: true,
  question: true,
  end: false,
};

// What one draft changes about the answer the page shows.
const noteShown = (state: TurnState, draft: EventDraft): TurnState =>
  SHOWS_ANSWER[draft.type] && !state.shown ? { ...state, shown: true } : state;

/** Numbers drafts from the turn's next `seq`, in order, noting what they show. */
export function stamp(
  state: TurnState,
  drafts: readonly EventDraft[],
): { state: TurnState; events: PlaygroundEvent[] } {
  const events = drafts.map((draft, index): PlaygroundEvent => ({
    ...draft,
    seq: state.seq + index,
  }));
  const noted = drafts.reduce((next, draft) => noteShown(next, draft), state); // → TurnState
  return { state: { ...noted, seq: state.seq + drafts.length }, events };
}

/**
 * Checks one tool call with the catalog's own validators and translates it into page events
 * plus the tool_result the model reads. Invalid input never reaches the page; its reason goes
 * back to the model as an error, and a tool's second failure in a turn asks for prose instead
 * and retires the tool. A later call to it disables all tools and requests a final prose round.
 * A tool call during that prose-only round stops the turn without executing the handler.
 */
export function translateToolUse(state: TurnState, call: ToolCall): Translation {
  if (state.policy !== "tools")
    return {
      state: state.policy === "proseOnly" ? { ...state, policy: "stopped" } : state,
      events: [],
      result: toolResult(call.id, "Tools are disabled for the rest of this turn.", true),
    };
  const counted = { ...state, toolCalls: state.toolCalls + 1 };
  if (counted.toolCalls > MAX_TOOL_CALLS)
    return {
      state: { ...counted, policy: "recovery" },
      events: [],
      result: toolResult(call.id, "Tool call limit reached. Answer in prose now.", true),
    };
  const verdict = judge(counted, call); // → shown | asked | invalid | refused | removed
  switch (verdict.kind) {
    case "shown": {
      const stamped = stamp(verdict.state, verdict.drafts);
      return { ...stamped, result: toolResult(call.id, verdict.reply, false) };
    }
    case "asked":
      return { ...stamp(counted, verdict.drafts), result: "asked" };
    case "invalid":
    case "refused":
    case "removed":
      return rejectCall(counted, call, verdict);
    default: {
      const unhandled: never = verdict;
      return unhandled;
    }
  }
}
