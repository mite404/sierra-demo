import type { Edit } from "./edits";
import type { Notice, Source } from "./protocol";
import type { ThreadId, Workspace } from "./workspace";

/**
 * What the page sees of the worker. `starting` learns its source from the worker's `opening`,
 * so a start that hangs still says where its data would come from; `held` waits while another
 * tab has the device's database (ADR-118); `broken` is for good.
 */
export type RuntimeState =
  | { kind: "starting"; source: Source | null }
  | { kind: "held"; source: null }
  | { kind: "ready"; source: Source; workspace: Workspace; replying: ThreadId[] }
  | { kind: "broken"; source: Source | null; reason: string };

// A notice that answers one request, and whoever waits for its answers.
export type Answer = Extract<Notice, { requestId: string }>;
export type Sink = (answer: Answer) => void;

// The handle's own state: the worker's last word, the edits still waiting for their answer, who
// waits for which request, and what `state()` shows (the confirmed state with the edits on top).
export type Handle = {
  confirmed: RuntimeState;
  edits: Map<string, Edit>; // requestId → an edit shown until its answer
  sinks: Map<string, Sink>; // requestId → whoever waits for its answers
  shown: RuntimeState;
  listeners: Set<() => void>;
};

/** A handle on a runtime still starting, with no edits, waiters or listeners yet. */
export function createHandle(): Handle {
  const starting: RuntimeState = { kind: "starting", source: null };
  return {
    confirmed: starting,
    edits: new Map(),
    sinks: new Map(),
    shown: starting,
    listeners: new Set(),
  };
}

/** Recomputes what `state()` shows and tells every listener. */
export function show(handle: Handle): void {
  const { confirmed, edits } = handle;
  handle.shown =
    confirmed.kind === "ready" && edits.size > 0
      ? {
          ...confirmed,
          workspace: [...edits.values()].reduce((ws, edit) => edit(ws), confirmed.workspace),
        }
      : confirmed;
  for (const listener of handle.listeners) listener();
}

/** Breaks the runtime for good: every request still waiting fails with `reason`. */
export function breakDown(handle: Handle, reason: string): void {
  if (handle.confirmed.kind === "broken") return;
  handle.confirmed = { kind: "broken", source: handle.confirmed.source, reason };
  handle.edits.clear();
  for (const [requestId, sink] of handle.sinks) sink({ kind: "failed", requestId, reason });
  handle.sinks.clear();
  show(handle);
}

/** Routes a notice: an answer to whoever waits for its request; the rest change the state. */
export function receive(handle: Handle, notice: Notice): void {
  if (handle.confirmed.kind === "broken") return;
  if ("requestId" in notice) {
    handle.sinks.get(notice.requestId)?.(notice);
    return;
  }
  switch (notice.kind) {
    case "held":
      handle.confirmed = { kind: "held", source: null };
      show(handle);
      return;
    case "opening":
      handle.confirmed = { kind: "starting", source: notice.source };
      show(handle);
      return;
    case "state": {
      const { source, workspace, replying } = notice;
      handle.confirmed = { kind: "ready", source, workspace, replying };
      show(handle);
      return;
    }
    case "broken":
      breakDown(handle, notice.reason);
      return;
    default: {
      const unhandled: never = notice;
      return unhandled;
    }
  }
}
