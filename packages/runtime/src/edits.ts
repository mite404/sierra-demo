import { applyMark, type MarkNote, type ThreadMark } from "./marks";
import type { RenameTarget } from "./protocol";
import {
  lanesOf,
  mergeLanes,
  type Lane,
  type LaneId,
  type ShellState,
  type ThreadId,
  type Workspace,
} from "./workspace";

// A page edit `state()` shows before the worker confirms it.
export type Edit = (workspace: Workspace) => Workspace;

/** The project or thread under its new name. */
export function renamed(target: RenameTarget, name: string): Edit {
  return target.kind === "project"
    ? (ws) => ({
        ...ws,
        projects: ws.projects.map((each) => (each.id === target.id ? { ...each, name } : each)),
      })
    : (ws) => ({
        ...ws,
        threads: ws.threads.map((each) =>
          each.id === target.id ? { ...each, title: name } : each,
        ),
      });
}

/** The page's lanes over whatever the canvas holds by then, merged as the worker merges them. */
export function arranged(mainId: ThreadId, lanes: Lane[], base: LaneId[]): Edit {
  return (ws) => ({
    ...ws,
    lanes: { ...ws.lanes, [mainId]: mergeLanes(lanesOf(ws, mainId), base, lanes) },
  });
}

/** The page's shell, whole, over any earlier one. */
export function withShell(shell: ShellState): Edit {
  return (ws) => ({ ...ws, shell });
}

/**
 * The thread with a pin, a snooze or an archive on it, and its `note` first in the bell, both
 * stamped `now` by the page's clock until the worker's own stamp arrives. A mark the worker will
 * refuse shows nothing.
 */
export function marked(id: ThreadId, change: ThreadMark, now: string, note?: MarkNote): Edit {
  const notes = note === undefined ? [] : [{ ...note, threadId: id, at: now }]; // → Notification[]
  return (ws) => {
    try {
      return {
        ...ws,
        threads: ws.threads.map((each) => (each.id === id ? applyMark(each, change, now) : each)),
        notifications: [...notes, ...ws.notifications],
      };
    } catch {
      return ws;
    }
  };
}

/** The workspace without a deleted thread, its sub-threads, and the notes and shares naming them. */
export function removed(id: ThreadId): Edit {
  return (ws) => {
    const gone = new Set<string>(
      ws.threads
        .filter(
          (each) => each.id === id || (each.place.kind === "child" && each.place.parentId === id),
        )
        .map((each) => each.id),
    );
    return {
      ...ws,
      threads: ws.threads.filter((each) => !gone.has(each.id)),
      notifications: ws.notifications.filter((each) => !gone.has(each.threadId)),
      shares: ws.shares.filter((each) => !gone.has(each.threadId)),
    };
  };
}
