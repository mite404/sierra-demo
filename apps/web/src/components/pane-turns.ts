import type { Agent } from "@yaklabs/catalog/agent";
import type { ThreadHandle } from "@yaklabs/catalog/thread";
import type { ThreadSummary } from "@yaklabs/runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { reasonOf, useRuntime, useRuntimeState } from "../runtime";
import { isWorking } from "../shell/working";
import { usePanelRegistry } from "./panel-registry";
import { LOADING, turnsBefore, type Turns } from "./turns";

// A thread's turns only ever grow, so a count that drops means they were written over
// elsewhere (a scripted show restarted): the pane reads them again.
function useRewritten(turnCount: number, reread: () => void): void {
  const was = useRef(turnCount);
  useEffect(() => {
    const dropped = turnCount < was.current;
    was.current = turnCount;
    if (dropped) reread();
  }, [turnCount, reread]);
}

/**
 * The thread's turns: none at once for a thread the snapshot says holds none, else asked of the
 * worker while they are loading, which a retry goes back to. What a thread starts with is read
 * once, as its pane mounts, so the turns it gains while on screen never send it back to the
 * frame; the pane is keyed by the thread's id, so it never changes threads. `reread` asks again
 * without the frame, and each answer is a new `revision` of the turns; it also runs by itself
 * when the thread's turn count drops, since turns only shrink when rewritten elsewhere.
 */
export function useTurns(thread: ThreadSummary): {
  turns: Turns;
  retry: () => void;
  reread: () => void;
  revision: number;
} {
  const runtime = useRuntime();
  const { id } = thread;
  const [turns, setTurns] = useState(() => turnsBefore(thread)); // → Turns
  const [revision, setRevision] = useState(0);
  const asking = turns.kind === "loading";
  useEffect(() => {
    let live = true;
    const load = async () => {
      let next: Turns;
      try {
        next = { kind: "open", messages: await runtime.open(id) };
      } catch (error: unknown) {
        next = { kind: "failed", reason: reasonOf(error) };
      }
      if (live) setTurns(next);
    };
    if (asking) void load();
    return () => {
      live = false;
    };
  }, [runtime, id, asking]);
  const retry = () => {
    setTurns(LOADING);
  };
  // What shows stays until the new turns are here.
  const reads = useRef(0);
  const reread = useCallback(() => {
    const mine = ++reads.current;
    const load = async () => {
      try {
        const messages = await runtime.open(id);
        // A read resolving after a newer one started drops its older turns.
        if (mine !== reads.current) return;
        setTurns({ kind: "open", messages });
        setRevision((n) => n + 1);
      } catch {
        // The turns on screen stay; the next open of the thread asks again.
      }
    };
    void load();
  }, [runtime, id]);
  useRewritten(thread.turnCount, reread);
  return { turns, retry, reread, revision };
}

/**
 * An agent that notes each reply this pane starts, so the pane can tell its own replies from
 * work done on its thread elsewhere.
 */
export function noting(agent: Agent, note: () => void): Agent {
  return {
    respond: (event, signal) => {
      note();
      return agent.respond(event, signal);
    },
  };
}

/**
 * A thread written to elsewhere while this pane shows it (a parent's work on its child,
 * ADR-141) is read again once that work settles, since a panel reads its turns once. The
 * pane's own replies never count: their turns are already here, and a new panel would drop the
 * reader's scroll and draft. Returns what notes a reply of the pane's own.
 */
export function useOutsideWork(thread: ThreadSummary, reread: () => void): () => void {
  const working = isWorking(useRuntimeState(), thread.id);
  const was = useRef(working);
  const own = useRef(false);
  useEffect(() => {
    const ended = was.current && !working;
    was.current = working;
    if (!ended) return;
    if (!own.current) reread();
    own.current = false;
  }, [working, reread]);
  return useCallback(() => {
    own.current = true;
  }, []);
}

/**
 * What registers a thread panel's handle by its thread's id while it is mounted, under a panel
 * registry (the scripted demo's); nothing where no host drives the panels.
 */
export function usePanelRef(id: string): ((handle: ThreadHandle | null) => void) | undefined {
  const registry = usePanelRegistry();
  return useCallback(
    (handle: ThreadHandle | null) => {
      if (handle === null) registry?.delete(id);
      else registry?.set(id, handle);
    },
    [registry, id],
  );
}
