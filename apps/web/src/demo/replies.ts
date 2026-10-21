import type { AgentEvent } from "@yaklabs/catalog/agent";
import { card, paragraph, text, type Block } from "@yaklabs/catalog/prose";
import {
  cancelReply,
  startReply,
  type AgentMessage,
  type ReplyChunk,
  type WorkStep,
} from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import type { Clock } from "./clock";
import { childOf, type ChildOf } from "../world/spec";
import type { Opening, Script, Timed } from "./script";

/** What the main thread answers once the script's replies are spent. */
export const END_REPLY: Timed[] = [
  {
    after: 600,
    chunk: "That is the end of this scripted scenario. Press Restart to play it again.",
  },
];

// What a child's turn says while its parent's work on it runs.
const WORKING = "Working";

// Whether a chunk is words inside the block at hand.
function isInline(chunk: ReplyChunk): boolean {
  return typeof chunk === "string" || chunk.kind === "text" || chunk.kind === "link";
}

// Held words with one more: onto the last when both are plain or wear the same mark.
function held(words: ReplyChunk[], chunk: ReplyChunk): ReplyChunk[] {
  const last = words.at(-1);
  if (typeof last === "string" && typeof chunk === "string")
    return [...words.slice(0, -1), last + chunk];
  const sameRun =
    typeof last === "object" &&
    typeof chunk === "object" &&
    last.kind === "text" &&
    chunk.kind === "text" &&
    last.mark === chunk.mark;
  if (sameRun) return [...words.slice(0, -1), { ...last, text: last.text + chunk.text }];
  return [...words, chunk];
}

/**
 * A reply's chunks, each once its pause has passed on the clock. With `reduce`, a block's words
 * wait for the block's end and land together, so the page changes once per block rather than
 * once per word. A stop ends it where it is.
 */
export async function* play(
  events: Timed[],
  clock: Clock,
  signal: AbortSignal,
  reduce: boolean,
): AsyncGenerator<ReplyChunk> {
  let words: ReplyChunk[] = [];
  for (const { after, chunk } of events) {
    // oxlint-disable-next-line no-await-in-loop -- a stream waits between its chunks
    await clock.wait(after, signal);
    if (signal.aborted) return;
    if (reduce && isInline(chunk)) {
      words = held(words, chunk);
      continue;
    }
    yield* words;
    words = [];
    yield chunk;
  }
  yield* words;
}

/** The wording of a docked question, read only as far as this check proves. */
export function wordingOf(question: unknown): string | undefined {
  if (typeof question !== "object" || question === null || !("question" in question))
    return undefined;
  const wording = question.question; // → unknown
  return typeof wording === "string" ? wording : undefined;
}

/**
 * The user's turn an event records at `time` (an instant, so the thread can say how long ago):
 * a message, or the answer to the docked question.
 */
export function userTurn(
  event: AgentEvent,
  id: string,
  time: string,
  question?: string,
): ThreadMessage[] {
  switch (event.kind) {
    case "message":
      return [{ id, role: "user", text: event.text, time, attachments: event.attachments }];
    case "answer":
      return [{ id, role: "user", text: event.text, time, question }];
    case "question-rejected":
      return [];
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

/**
 * A child's turns as its parent starts it at `time`: the request it was given, and its work
 * under way.
 */
export function openingTurns(child: ChildOf, time: string): ThreadMessage[] {
  return [
    { id: `${child.local}-1`, role: "user", text: child.request, time },
    { ...startReply(`${child.local}-2`, time), activity: WORKING },
  ];
}

// What a finished step leaves as its child's answer: the outcome, then its evidence.
function outcomeTurn(turn: AgentMessage, step: WorkStep): AgentMessage {
  const outcome = step.outcome ?? "";
  const blocks: Block[] = [paragraph([text(outcome)])];
  if (step.evidence !== undefined) blocks.push(card(step.evidence));
  return { ...turn, text: outcome, blocks, streaming: false, activity: undefined };
}

// The child's last turn once its step settles: answered, failed or cancelled.
function settledTurn(turn: AgentMessage, step: WorkStep): AgentMessage {
  switch (step.status) {
    case "done":
      return outcomeTurn(turn, step);
    case "failed": {
      const failure = { title: "Could not finish", detail: step.outcome ?? "" };
      return { ...turn, streaming: false, activity: undefined, ended: "failed", failure };
    }
    case "cancelled":
      return cancelReply(turn);
    case "pending":
    case "running":
      return turn;
    default: {
      const unhandled: never = step.status;
      return unhandled;
    }
  }
}

/**
 * A child's turns once its step moves: a new attempt when it runs again after it ended, else
 * its last turn settled as the step says.
 */
export function childTurns(turns: ThreadMessage[], step: WorkStep, time: string): ThreadMessage[] {
  const last = turns.at(-1);
  if (last?.role !== "agent") return turns;
  if (step.status !== "running") return [...turns.slice(0, -1), settledTurn(last, step)];
  if (last.streaming === true) return turns;
  const attempt = startReply(`${step.id}-${turns.length + 1}`, time);
  return [...turns, { ...attempt, activity: WORKING }];
}

// One second between an opening's turns, so they keep their order by time too.
const TURN_GAP_MS = 1000;

/** A run that already happened: the main's turns and each child's, all timed. */
export type OpenedRun = { main: ThreadMessage[]; children: Map<ChildOf, ThreadMessage[]> };

// `turns` timed from `from`, a second apart in order.
function timed(turns: ThreadMessage[], from: number): ThreadMessage[] {
  return turns.map((turn, i) => ({
    ...turn,
    time: new Date(from + i * TURN_GAP_MS).toISOString(),
  }));
}

// A step of an opening's work with its child's workspace id, as the scripted reply writes one.
function placed(script: Script, step: WorkStep): { step: WorkStep; child: ChildOf } | undefined {
  if (step.threadId === undefined) return undefined;
  const child = childOf(script, step.threadId);
  return { step: { ...step, threadId: child.id }, child };
}

/**
 * The run a scenario opens on, as a live run would have left it: the main's turns timed from
 * `awayMinutes` before `now`, a second apart, so the recap counts from the user's turn and the
 * latest reply's stamp reads how long ago the run ended; and for each child a step names, that
 * child's request and its outcome as the step settled it, under the child's workspace id.
 * @throws When a step names a child the script does not.
 */
export function openedRun(script: Script, opening: Opening, now: number): OpenedRun {
  const from = now - opening.awayMinutes * 60_000; // → when the user last spoke
  const children = new Map<ChildOf, ThreadMessage[]>();
  const main = timed(opening.turns, from).map((turn) => {
    if (turn.role !== "agent" || turn.work === undefined) return turn;
    const steps = turn.work.steps.map((step) => {
      const found = placed(script, step);
      if (found === undefined) return step;
      children.set(
        found.child,
        childTurns(openingTurns(found.child, turn.time), found.step, turn.time),
      );
      return found.step;
    });
    return { ...turn, work: { ...turn.work, steps } };
  });
  return { main, children };
}
