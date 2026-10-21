import { threads, type Thread, type ThreadMessage } from "@yaklabs/catalog/thread";
import type { Transcript } from "./conversation";
import type { MarkNote, ThreadMark } from "./marks";
import type { RenameTarget } from "./protocol";
import {
  STARTER,
  type Lane,
  type Notification,
  type Place,
  type Project,
  type ShellState,
  type ThreadId,
  type ThreadShare,
  type ThreadSummary,
  type Workspace,
} from "./workspace";

/** What a settling pass did: whether the workspace changed, and when the next one is due. */
export type Settled = { changed: boolean; next: string | null };

/** A thread as it is first written. */
export type NewThread = {
  id: ThreadId;
  title: string;
  place: Place;
  createdAt: string;
  updatedAt: string;
  draft: string;
  messages: ThreadMessage[];
};

/**
 * The worker's one store (ADR-081, ADR-086). Its calls are synchronous, as SQLite's are, so a
 * read-modify-write can never interleave with another; each write is one transaction, and the
 * schema refuses what the workspace's rules forbid.
 */
export type Store = {
  /** The whole snapshot the page draws from. */
  workspace(): Workspace;
  /** A thread's turns and draft; undefined for an id it has never held. */
  transcript(id: ThreadId): Transcript | undefined;
  /**
   * Threads with a message holding every word of `query`, newest first. Words match as
   * prefixes, ignoring case and accents; a query with no words finds nothing.
   */
  search(query: string): ThreadSummary[];
  /** @throws When the id is taken. */
  addProject(project: Project): void;
  /**
   * Adds a thread in its place and, for a child given `laneAt`, its lane at that index on its
   * parent's canvas, in one transaction.
   * @throws When the id is taken, the place breaks a rule (say, a child of a child), or a main
   *   is given a lane.
   */
  addThread(thread: NewThread, laneAt?: number): void;
  /**
   * Rewrites a thread's turns, draft and `updatedAt` from what they are now. A thread that
   * hears a message is live again: it and its main leave the archive (ADR-129).
   * @throws For an unknown thread.
   */
  changeTranscript(id: ThreadId, change: (transcript: Transcript) => Transcript): void;
  /**
   * Pins, snoozes or archives a live thread at `now`, by `applyMark`'s rules, and restarts its
   * idle clock; a `note` for the bell lands in the same write, or neither does.
   * @throws For a thread it does not hold or that is deleted, a snooze that is not ahead, and a
   *   note whose id is taken.
   */
  mark(id: ThreadId, change: ThreadMark, now: string, note?: MarkNote): void;
  /**
   * Deletes a thread, its sub-threads with it, behind a tombstone: gone from the workspace at
   * once, and for good once `settle` passes the undo window (ADR-130).
   * @throws For a thread it does not hold or that is deleted already.
   */
  remove(id: ThreadId, now: string): void;
  /** Takes a tombstone back, before `settle` purges it. @throws When the thread is not deleted. */
  restore(id: ThreadId, now: string): void;
  /**
   * One settling pass at `now` (`planSettle`), in one transaction: due snoozes wake with a note
   * for the bell, idle mains archive, tombstones past their window go, expired shares drop.
   * @param starting Whether the page just opened, when every tombstone goes.
   */
  settle(now: string, starting: boolean): Settled;
  /** @throws When the id is taken or the thread is unknown. */
  addShare(share: ThreadShare): void;
  /** Forgets a share; one already gone changes nothing. */
  removeShare(id: string): void;
  /** @throws For an unknown project or thread. */
  rename(target: RenameTarget, name: string): void;
  /**
   * Sets a main thread's canvas to exactly `lanes`, left to right.
   * @throws When `mainId` is not a main, or a thread lane is not one of its own children.
   */
  arrange(mainId: ThreadId, lanes: Lane[]): void;
  /** Keeps the page's shell whole, over any earlier one. */
  saveShell(shell: ShellState): void;
  /** @throws When the id is taken or the thread is unknown. */
  addNotification(notification: Notification): void;
  /** Closes the file; open it again elsewhere only after this. */
  close(): void;
};

/**
 * One of the catalog's seed threads by name.
 * @throws When the catalog has no thread by that name.
 */
export function seedThread(name: string): Thread {
  const thread = new Map(Object.entries(threads)).get(name); // → Thread | undefined
  if (thread === undefined) throw new Error(`The catalog has no seed thread named ${name}`);
  return thread;
}

/**
 * Gives a device store the starter wherever it lacks it: the Live Playground project and its
 * empty thread, beside anything the store already holds, so a device with threads from before
 * the Live Playground existed gets it too. Running it again changes nothing.
 * @throws When the store refuses the project or the thread.
 */
export function ensureStarter(store: Store, at: string): void {
  const { projects, threads: existing } = store.workspace();
  if (existing.some((each) => each.id === STARTER.thread.id)) return;
  const { project, thread } = STARTER;
  if (!projects.some((each) => each.id === project.id))
    store.addProject({ ...project, createdAt: at });
  const place = { kind: "main", projectId: project.id } as const;
  store.addThread({ ...thread, place, createdAt: at, updatedAt: at, draft: "", messages: [] });
}
