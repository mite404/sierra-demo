import {
  lanesOf,
  childrenOf,
  openChildLane,
  type Lane,
  type Notification,
  type RenameTarget,
  type ThreadId,
  type ThreadShare,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import type { ChildOf } from "./spec";

/** A change to the overlay's workspace: the workspace before, the workspace after. */
export type Edit = (ws: Workspace) => Workspace;

/** What a delete took away, so a restore can put it back. */
export type Tomb = {
  threads: ThreadSummary[];
  notifications: Notification[];
  shares: ThreadShare[];
};

// Oldest first, as the workspace lists threads; the id breaks ties.
const oldestFirst = (a: ThreadSummary, b: ThreadSummary) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

// Newest first, as the workspace lists notifications.
const newestFirst = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at);

// A thread's one-line preview: its last turn's first line.
function previewOf(turns: ThreadMessage[]): string {
  return turns.at(-1)?.text.split("\n")[0] ?? "";
}

/** The thread `id` changed by `change`. */
export function withThread(id: string, change: (thread: ThreadSummary) => ThreadSummary): Edit {
  return (ws) => ({
    ...ws,
    threads: ws.threads.map((thread) => (thread.id === id ? change(thread) : thread)),
  });
}

/** A main thread's canvas set to `lanes`. */
export function withLanes(main: ThreadId, lanes: Lane[]): Edit {
  return (ws) => ({ ...ws, lanes: { ...ws.lanes, [main]: lanes } });
}

/** A thread's summary as its turns now stand, at `at`. */
export function touched(
  turns: ThreadMessage[],
  at: string,
): (thread: ThreadSummary) => ThreadSummary {
  return (thread) => ({
    ...thread,
    turnCount: turns.length,
    preview: previewOf(turns),
    updatedAt: at,
  });
}

/** A new thread's summary, made at `at`, with no turns and no marks. */
export function summary(
  fields: Pick<ThreadSummary, "id" | "title" | "place" | "draft"> & { at: string },
): ThreadSummary {
  const { at, ...named } = fields;
  return {
    ...named,
    createdAt: at,
    updatedAt: at,
    preview: "",
    turnCount: 0,
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
  };
}

/** A thread added, oldest first as the workspace keeps them. */
export function withNewThread(thread: ThreadSummary): Edit {
  return (ws) => ({ ...ws, threads: [...ws.threads, thread].toSorted(oldestFirst) });
}

/**
 * The child a step first names, under the main, holding `turns`, its lane where the sidebar lists
 * it among the open children: the newest, so first.
 */
export function addChild(child: ChildOf, main: ThreadId, turns: ThreadMessage[], at: string): Edit {
  const place = { kind: "child", parentId: main } as const;
  const thread = touched(
    turns,
    at,
  )(summary({ id: child.id, title: child.title, place, draft: "", at }));
  return (ws) => {
    const added = withNewThread(thread)(ws);
    const order = childrenOf(added, main).map((each) => each.id); // → as the sidebar lists them
    return withLanes(main, openChildLane(lanesOf(added, main), child.id, order))(added);
  };
}

/** A note for the bell, newest first. */
export function notified(note: Notification): Edit {
  return (ws) => ({ ...ws, notifications: [note, ...ws.notifications] });
}

/** The workspace without a thread and its children, and what the delete took. */
export function removal(ws: Workspace, id: string): { ws: Workspace; tomb: Tomb } {
  const gone = new Set<string>(
    ws.threads
      .filter(
        (each) => each.id === id || (each.place.kind === "child" && each.place.parentId === id),
      )
      .map((each) => each.id),
  );
  const kept = <T extends { threadId: string }>(list: T[]) =>
    list.filter((each) => !gone.has(each.threadId));
  const taken = <T extends { threadId: string }>(list: T[]) =>
    list.filter((each) => gone.has(each.threadId));
  return {
    tomb: {
      threads: ws.threads.filter((each) => gone.has(each.id)),
      notifications: taken(ws.notifications),
      shares: taken(ws.shares),
    },
    ws: {
      ...ws,
      threads: ws.threads.filter((each) => !gone.has(each.id)),
      notifications: kept(ws.notifications),
      shares: kept(ws.shares),
    },
  };
}

/** A tomb's threads, notes and shares back in the workspace, in their lists' own orders. */
export function restored(tomb: Tomb): Edit {
  return (ws) => ({
    ...ws,
    threads: [...ws.threads, ...tomb.threads].toSorted(oldestFirst),
    notifications: [...ws.notifications, ...tomb.notifications].toSorted(newestFirst),
    shares: [...tomb.shares, ...ws.shares],
  });
}

/** The project or thread under its new name. */
export function renamed(target: RenameTarget, name: string): Edit {
  return target.kind === "project"
    ? (ws) => ({
        ...ws,
        projects: ws.projects.map((each) => (each.id === target.id ? { ...each, name } : each)),
      })
    : withThread(target.id, (thread) => ({ ...thread, title: name }));
}

/** A share recorded, newest first, over any earlier record of the same share. */
export function shared(share: ThreadShare): Edit {
  return (ws) => ({
    ...ws,
    shares: [share, ...ws.shares.filter((each) => each.id !== share.id)],
  });
}

/**
 * A main thread's part of the workspace as it opens: the main, with its seeded times, then its
 * children, their turns, and the main's lanes.
 */
export type Slice = {
  main: ThreadId;
  threads: ThreadSummary[];
  transcripts: ReadonlyMap<ThreadId, ThreadMessage[]>;
  lanes: Lane[];
};

/** The workspace with a main and its children, their notes and shares, swapped for `slice`'s. */
export function recast(slice: Slice): Edit {
  return (ws) => {
    const cleared = removal(ws, slice.main).ws; // → without the main, its children, their notes
    const added = slice.threads.reduce((each, thread) => withNewThread(thread)(each), cleared);
    return withLanes(slice.main, slice.lanes)(added);
  };
}

// Whether `thread` is `main` or one of its children.
const isUnder = (main: string, thread: ThreadSummary): boolean =>
  thread.id === main || (thread.place.kind === "child" && thread.place.parentId === main);

/**
 * The thread ids a reset of `slice` covers: its main, every thread under it now, every thread
 * a tomb of any of them holds, and the slice's own.
 */
export function coveredBy(
  ws: Workspace,
  tombs: ReadonlyMap<string, Tomb>,
  slice: Slice,
): Set<string> {
  const buried = [...tombs.values()].flatMap((tomb) => tomb.threads);
  return new Set([
    slice.main,
    ...[...ws.threads, ...buried]
      .filter((each) => isUnder(slice.main, each))
      .map((each) => each.id),
    ...slice.threads.map((each) => each.id),
  ]);
}
