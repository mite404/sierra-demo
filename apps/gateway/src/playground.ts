import { APIError, APIUserAbortError, type Anthropic } from "@anthropic-ai/sdk";
import {
  PLAYGROUND_PROTOCOL,
  type PlaygroundEvent,
  type PlaygroundRequest,
} from "@yaklabs/catalog/playground";
import { toUpstreamMessages } from "./playgroundHistory";
import { SYSTEM_PROMPT } from "./playgroundPrompt";
import { assistantContent, newRound, readEvent, type Round } from "./playgroundRound";
import { summarizeThinking } from "./playgroundThinking";
import {
  initialTurn,
  stamp,
  toolsFor,
  translateToolUse,
  type EventDraft,
  type TurnState,
} from "./playgroundTools";

/** The model the playground talks to and its per-round budgets; the app passes its own. */
export type PlaygroundUpstream = {
  client: Anthropic;
  model: string;
  maxTokens: number;
  thinking: Anthropic.ThinkingConfigParam;
};

type Messages = Anthropic.MessageParam[];
type UpstreamEvents = AsyncIterable<Anthropic.RawMessageStreamEvent>;

// How a round ended, with the turn state it left behind (every seq it used included).
type RoundEnd = {
  state: TurnState;
  round: Round;
  results: Anthropic.ToolResultBlockParam[];
  asked: boolean;
  broken: boolean;
};

// The turn's closing event, before its `seq`.
type EndDraft = Extract<EventDraft, { type: "end" }>;

// What the loop does after a round: stop with the closing event, or send the results and go on.
type Decision =
  | { kind: "stop"; end: EndDraft }
  | { kind: "continue"; messages: Messages; state: TurnState };

// How a turn went, for its one summary log, and when that was known (`Date.now()`).
type TurnOutcome = EndDraft["reason"] | "cancelled" | "internal";
type Settled = { outcome: TurnOutcome; at: number };

const RECOVERY_PROMPT = `You are Kay's assistant. Tools are disabled for this final reply.
Explain briefly in plain prose what could not finish and what the user can try next.
Preserve results already shown. Do not claim that failed work succeeded or invent data.
Do not call tools, repeat displayed results, or use tables or headings.`;
// Rounds one turn may take; Kimi was seen making one tool call per round.
const MAX_ROUNDS = 8;
const CUT_SHORT = "I stopped before finishing this reply.";
const NO_RESPONSE = "The model stopped responding.";
// The upstream accepted the turn, then ran out of credit before its next round.
const CREDIT_OUT = "The model's credit ran out before it could finish.";
const NO_ANSWER = "I finished without an answer.";
const encoder = new TextEncoder();

// A turn that stops short says why in the closing event itself.
const stoppedShort = (reason: "limit" | "upstream", line: string): Decision => ({
  kind: "stop",
  end: { type: "end", reason, line },
});

// A turn that answered. A reply that showed nothing is the model failing, so it says so and
// the page can offer Try again.
const answered = (state: TurnState): Decision =>
  state.shown
    ? { kind: "stop", end: { type: "end", reason: "answered" } }
    : stoppedShort("upstream", NO_ANSWER);

const decide = (
  { state, round, results, asked, broken }: RoundEnd,
  messages: Messages,
): Decision => {
  if (broken) return stoppedShort("upstream", NO_RESPONSE);
  if (state.policy === "stopped") return stoppedShort("limit", CUT_SHORT);
  if (asked) return { kind: "stop", end: { type: "end", reason: "asked" } };
  if (round.stop === null) return stoppedShort("upstream", NO_RESPONSE);
  if (round.stop === "max_tokens") return stoppedShort("limit", CUT_SHORT);
  if (state.policy === "proseOnly")
    return round.stop === "tool_use" ? stoppedShort("limit", CUT_SHORT) : answered(state);
  if (round.stop !== "tool_use" || results.length === 0) return answered(state);
  if (state.round >= MAX_ROUNDS) return stoppedShort("limit", CUT_SHORT);
  const next: Messages = [
    ...messages,
    { role: "assistant", content: assistantContent(round) },
    { role: "user", content: results },
  ];
  return {
    kind: "continue",
    messages: next,
    state: toolsFor(state).length === 0 ? { ...state, policy: "proseOnly" } : state,
  };
};

// Sends one round upstream with the tools the turn still offers; resolves once the upstream
// accepts it, or throws its APIError.
const openRound = (
  upstream: PlaygroundUpstream,
  messages: Messages,
  state: TurnState,
  signal: AbortSignal,
): Promise<UpstreamEvents> =>
  upstream.client.messages.create(
    {
      model: upstream.model,
      max_tokens: upstream.maxTokens,
      thinking: upstream.thinking,
      system: state.policy === "proseOnly" ? RECOVERY_PROMPT : SYSTEM_PROMPT,
      tools: toolsFor(state),
      ...(state.policy === "proseOnly"
        ? { tool_choice: { type: "none" } satisfies Anthropic.ToolChoiceNone }
        : {}),
      messages,
      stream: true,
    },
    { signal },
  );

// One upstream event folded into the round, with the page events it makes. Pure.
const advance = (
  end: RoundEnd,
  event: Anthropic.RawMessageStreamEvent,
): { end: RoundEnd; events: PlaygroundEvent[] } => {
  const step = readEvent(end.round, event); // → { round, text?, thinking?, tool? }
  const drafts: EventDraft[] = [
    ...(step.thinking === undefined ? [] : [{ type: "thinking" as const, ...step.thinking }]),
    ...(step.text === undefined ? [] : [{ type: "text" as const, ...step.text }]),
  ];
  const text = stamp(end.state, drafts); // → { state, events }
  const read: RoundEnd = { ...end, round: step.round, state: text.state };
  if (step.tool === undefined) return { end: read, events: text.events };
  const { state, events, result } = translateToolUse(read.state, step.tool); // → Translation
  const settled: RoundEnd =
    result === "asked"
      ? { ...read, state, asked: true }
      : { ...read, state, results: [...read.results, result] };
  return { end: settled, events: [...text.events, ...events] };
};

// A round that failed, logged as a marker and the upstream's status alone: the raw error could
// echo the turn or the key. An APIError (a refusal or a dropped connection) is the upstream
// failing; anything else is a bug in the loop, and the turn still ends as an upstream failure
// so the page never hangs. A closed browser is not a failure.
const noteFailure = (error: unknown): void => {
  if (error instanceof APIUserAbortError) return;
  if (error instanceof APIError) {
    const status = typeof error.status === "number" ? error.status : null; // → number | null
    // oxlint-disable-next-line eslint/no-console -- Workers Observability keeps console records
    console.warn({ event: "playground_round_failed", cause: "upstream", status });
    return;
  }
  // oxlint-disable-next-line eslint/no-console -- Workers Observability keeps console records
  console.error({ event: "playground_round_failed", cause: "internal", status: null });
};

// Whether the upstream refused because its credit ran out.
const isCreditRefusal = (error: unknown): boolean =>
  error instanceof APIError && error.status === 402;

// Streams one round's page events and returns how it ended. An upstream failure mid-round
// ends it `broken` with the seq it reached, so the closing events keep counting from there.
async function* streamRound(
  events: UpstreamEvents,
  start: TurnState,
): AsyncGenerator<PlaygroundEvent, RoundEnd> {
  let end: RoundEnd = {
    state: start,
    round: newRound(start.round),
    results: [],
    asked: false,
    broken: false,
  };
  try {
    for await (const event of events) {
      const next = advance(end, event); // → { end, events }
      end = next.end;
      yield* next.events;
      // A question or a forbidden recovery call cancels the rest of the round.
      if (end.asked || end.state.policy === "stopped") return end;
    }
  } catch (error) {
    noteFailure(error);
    return { ...end, broken: true };
  }
  return end;
}

// Opens the next round, or names credit running out; another upstream refusal is undefined.
const tryOpenRound = async (
  upstream: PlaygroundUpstream,
  messages: Messages,
  state: TurnState,
  signal: AbortSignal,
): Promise<UpstreamEvents | "credit" | undefined> => {
  try {
    return await openRound(upstream, messages, state, signal);
  } catch (error) {
    noteFailure(error);
    return isCreditRefusal(error) ? "credit" : undefined;
  }
};

// A thrown turn: a closed browser, the upstream refusing the first round, or a bug.
const thrownOutcome = (error: unknown, signal: AbortSignal): TurnOutcome => {
  if (signal.aborted) return "cancelled";
  return error instanceof APIError ? "upstream" : "internal";
};

// The playground's tool loop, the only part that talks to the model: it opens a round, turns
// each upstream event into page events, answers the tool calls and goes round again until the
// model answers, asks, hits a limit or stops responding. The first event is `start`, the last
// is `end`, and `seq` counts up from 0 without a gap. A closed browser (`signal`) stops it.
// It throws the first round's `APIError` before `start`, so the route can answer before streaming.
// However it ends, it logs one `playground_turn` record: counts and time only, never the turn.
async function* playgroundEvents(
  upstream: PlaygroundUpstream,
  request: PlaygroundRequest,
  signal: AbortSignal,
): AsyncGenerator<PlaygroundEvent, void> {
  const started = Date.now();
  let rounds = 0;
  // Set once, when the turn's outcome is known; a cancel after that keeps it.
  let settled: Settled | undefined;
  try {
    let messages = toUpstreamMessages(request); // → MessageParam[]
    rounds++;
    // The first round opens before the turn has failed anything, so it offers every tool.
    let events: UpstreamEvents | "credit" | undefined = await openRound(
      upstream,
      messages,
      initialTurn,
      signal,
    );
    const opened = stamp(initialTurn, [{ type: "start", v: PLAYGROUND_PROTOCOL }]);
    let state = opened.state;
    yield* opened.events;
    while (events !== undefined && events !== "credit") {
      const end: RoundEnd = yield* streamRound(events, { ...state, round: state.round + 1 });
      if (signal.aborted) return;
      const decision = decide(end, messages); // → stop | continue
      if (decision.kind === "stop") {
        settled = { outcome: decision.end.reason, at: Date.now() };
        yield* stamp(end.state, [decision.end]).events;
        return;
      }
      state = decision.state;
      messages = decision.messages;
      rounds++;
      // oxlint-disable-next-line no-await-in-loop -- each round needs the last round's tool results
      events = await tryOpenRound(upstream, messages, state, signal);
    }
    if (signal.aborted) return;
    const line = events === "credit" ? CREDIT_OUT : NO_RESPONSE;
    settled = { outcome: "upstream", at: Date.now() };
    yield* stamp(state, [{ type: "end", reason: "upstream", line }]).events;
  } catch (error) {
    settled = { outcome: thrownOutcome(error, signal), at: Date.now() };
    throw error;
  } finally {
    const { outcome, at } = settled ?? { outcome: "cancelled", at: Date.now() };
    // oxlint-disable-next-line eslint/no-console -- Workers Observability keeps console records
    console.info({ event: "playground_turn", outcome, rounds, elapsedMs: at - started });
  }
}

// One event per line, as the page reads them.
const ndjsonLine = (event: PlaygroundEvent): Uint8Array =>
  encoder.encode(`${JSON.stringify(event)}\n`);

/**
 * Starts the playground's reply and waits for the upstream to accept the first round, so a
 * refusal becomes a status code before a byte of the body is sent (like `/api/messages`).
 * Cancelling the returned stream stops the loop and the round in flight.
 *
 * @returns an NDJSON stream of `PlaygroundEvent`s, one per line.
 * @throws the upstream's `APIError` when it refuses the first round.
 */
export async function openPlayground(
  upstream: PlaygroundUpstream,
  request: PlaygroundRequest,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const stop = new AbortController();
  const readingSignal = AbortSignal.any([signal, stop.signal]);
  const events = summarizeThinking(
    upstream,
    playgroundEvents(upstream, request, readingSignal),
    readingSignal,
  );
  const first = await events.next(); // → the `start` event, or throws the first round's refusal
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done === true) controller.close();
      else controller.enqueue(ndjsonLine(first.value));
    },
    async pull(controller) {
      const next = await events.next();
      if (next.done === true) controller.close();
      else controller.enqueue(ndjsonLine(next.value));
    },
    async cancel() {
      stop.abort();
      await events.return();
    },
  });
}
