import type { RuntimeState, ThreadId } from "@yaklabs/runtime";

/**
 * Whether a thread's reply is in flight, from the runtime's own live state rather than a guess
 * from which thread the address happens to have open: true only while the id sits in `replying`,
 * so it never lags a beat behind a reply's completion or failure.
 */
export function isWorking(state: RuntimeState, threadId: ThreadId): boolean {
  return state.kind === "ready" && state.replying.includes(threadId);
}
