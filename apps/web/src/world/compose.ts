import type { NewItem, Runtime, RuntimeState, Workspace } from "@yaklabs/runtime";

/** A runtime held in the page beside the worker, and the ids it answers for. */
export type Overlay = Runtime & {
  /** Whether `id` names a project, thread or share this side holds, or a delete it can undo. */
  owns(id: string): boolean;
};

// Two states and what the page sees of them, kept so an unchanged pair gives the same object.
type Merged = { worker: RuntimeState; overlay: RuntimeState; shown: RuntimeState };

// Newest first, as the workspace lists notifications.
const newestFirst = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at);

// The id whose owner a create belongs with: the project a main goes in, the main a child hangs
// from; a new project names none, so it goes to the worker.
function ownerOf(item: NewItem): string | null {
  switch (item.kind) {
    case "main":
      return item.projectId;
    case "child":
      return item.parentId;
    case "project":
      return null;
    default: {
      const unhandled: never = item;
      return unhandled;
    }
  }
}

// The contract the merge stands on: each id lives on exactly one side (see `composeRuntime`).
function assertDisjoint(worker: Workspace, overlay: Workspace): void {
  const held = new Set(
    [...worker.projects, ...worker.threads, ...worker.shares].map((each) => each.id),
  );
  const twice = [...overlay.projects, ...overlay.threads, ...overlay.shares].find((each) =>
    held.has(each.id),
  );
  if (twice !== undefined) throw new Error(`The worker and the overlay both hold "${twice.id}"`);
}

// The worker's workspace with the overlay's records after its own. The shell document is the
// worker's alone; the overlay keeps none.
function mergedWorkspace(worker: Workspace, overlay: Workspace): Workspace {
  assertDisjoint(worker, overlay);
  return {
    ...worker,
    projects: [...worker.projects, ...overlay.projects],
    threads: [...worker.threads, ...overlay.threads],
    lanes: { ...worker.lanes, ...overlay.lanes },
    notifications: [...worker.notifications, ...overlay.notifications].toSorted(newestFirst),
    shares: [...worker.shares, ...overlay.shares],
  };
}

// What the page sees: once the worker is ready, both workspaces as one; before that, or once the
// overlay has stopped, the worker's state as it is.
function mergedState(worker: RuntimeState, overlay: RuntimeState): RuntimeState {
  if (worker.kind !== "ready" || overlay.kind !== "ready") return worker;
  return {
    ...worker,
    workspace: mergedWorkspace(worker.workspace, overlay.workspace),
    replying: [...worker.replying, ...overlay.replying],
  };
}

/**
 * One `Runtime` over the worker and a page-side overlay (the scripted Demo). Its state is the
 * worker's, with the overlay's projects, threads, lanes, notifications and shares added once the
 * worker is ready; every verb goes to the side that owns the id it names, a new project and the
 * shell document to the worker, and a thread's agent comes from the overlay when it owns the
 * thread. No record has two writers: each id lives on exactly one side, and the shell document
 * is written only through the worker.
 */
export function composeRuntime(worker: Runtime, overlay: Overlay): Runtime {
  let merged: Merged | null = null;
  // The side that answers for `id`: the overlay for what it owns, the worker for the rest.
  const sideOf = (id: string | null): Runtime =>
    id !== null && overlay.owns(id) ? overlay : worker;
  const state = (): RuntimeState => {
    const now = { worker: worker.state(), overlay: overlay.state() };
    if (merged === null || merged.worker !== now.worker || merged.overlay !== now.overlay)
      merged = { ...now, shown: mergedState(now.worker, now.overlay) };
    return merged.shown;
  };
  return {
    state,
    subscribe: (listener) => {
      const stops = [worker.subscribe(listener), overlay.subscribe(listener)];
      return () => {
        for (const stop of stops) stop();
      };
    },
    open: (id) => sideOf(id).open(id),
    create: (item) => sideOf(ownerOf(item)).create(item),
    rename: (target, name) => sideOf(target.id).rename(target, name),
    arrange: (mainId, lanes) => sideOf(mainId).arrange(mainId, lanes),
    saveShell: (shell) => worker.saveShell(shell),
    mark: (id, change, note) => sideOf(id).mark(id, change, note),
    delete: (id) => sideOf(id).delete(id),
    restore: (id) => sideOf(id).restore(id),
    share: (share) => sideOf(share.threadId).share(share),
    unshare: (shareId) => sideOf(shareId).unshare(shareId),
    agent: (id, session) => sideOf(id).agent(id, session),
    dispose: () => {
      overlay.dispose();
      worker.dispose();
    },
  };
}
