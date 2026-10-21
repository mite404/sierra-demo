import type { ThreadMessage } from "@yaklabs/catalog/thread";
import type { ThreadSummary } from "@yaklabs/runtime";

// A thread's turns as the worker hands them over: on their way, here, or refused.
export type Turns =
  | { kind: "loading" }
  | { kind: "open"; messages: ThreadMessage[] }
  | { kind: "failed"; reason: string };

/** Turns still on their way from the worker. */
export const LOADING: Turns = { kind: "loading" };

// A thread that holds no turns, which is what the worker would answer for it.
const NONE: Turns = { kind: "open", messages: [] };

/**
 * What a thread shows before it asks the worker for its turns. One the snapshot says holds
 * none, such as a thread just started, opens empty at once, since the worker could only answer
 * the same; its welcome then paints in the first frame, never after a frame of waiting. Any
 * other thread waits for its turns.
 */
export function turnsBefore(thread: ThreadSummary): Turns {
  return thread.turnCount === 0 ? NONE : LOADING;
}
