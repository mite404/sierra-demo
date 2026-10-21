import {
  UNDO_MS,
  type Located,
  type Runtime,
  type ThreadId,
  type ThreadSummary,
} from "@yaklabs/runtime";
import { toast } from "sonner";
import { inBackground } from "../runtime";
import { copyText } from "./share-verbs";
import { wakeText } from "./wake-text";
import { awayFrom, markRead, type ShellState } from "./state";

/** What the thread's menu does (ADR-126), besides Share (see share-verbs.ts). */
export type ThreadVerbs = {
  /** Copies the thread's address, its scenario kept, and says so. */
  copyUrl(id: ThreadId): void;
  /** Pins or unpins; the view stays where it is (ADR-127). */
  pin(id: ThreadId, pinned: boolean): void;
  /** Opens the snooze card in the thread (ADR-128); null closes it. */
  askSnooze(id: ThreadId | null): void;
  /** Snoozes until an instant, or wakes with null, and says when (ADR-128). */
  snooze(id: ThreadId, until: string | null): void;
  /** Archives or unarchives, with Undo; the view stays where it is (ADR-129). */
  archive(id: ThreadId, archived: boolean): void;
  /** Deletes a thread and its sub-threads, with Undo while the worker keeps its tombstone (ADR-130). */
  remove(id: ThreadId): void;
};

/** What the thread verbs need: the runtime, where the page is, and how to move it. */
export type ThreadDeps = {
  runtime: Runtime;
  threads: ThreadSummary[];
  active: Located | null;
  doc: ShellState;
  go: (to: ThreadId | null) => void;
  /** The thread's address as a whole URL, its scenario kept. */
  href: (id: ThreadId) => string;
  /** Saves a change to the shell's document, as the shell's own verbs do. */
  change: (update: (doc: ShellState) => ShellState) => void;
  setSnoozing: (id: ThreadId | null) => void;
  /** Takes down a thread's public pages, and its sub-threads', when it is deleted (ADR-131). */
  takeDown: (id: ThreadId) => void;
};

// A thread's title in quotes, for a toast; the id when the snapshot lacks it.
function named(threads: ThreadSummary[], id: ThreadId): string {
  return `“${threads.find((each) => each.id === id)?.title ?? id}”`;
}

// Deletes, moves the page off the thread if it showed it, and offers Undo for as long as the
// worker keeps the tombstone. Undo puts the thread back and returns to it if it was on screen.
// Its public pages come down at once: privacy first, and Undo brings back the thread, not them.
function removeWithUndo(deps: ThreadDeps, id: ThreadId): void {
  const { runtime, threads, active, doc, go, change, takeDown } = deps;
  const title = named(threads, id);
  const { next } = awayFrom(doc, active, id);
  takeDown(id);
  inBackground(runtime.delete(id), "Deleting");
  change((current) => awayFrom(current, active, id).state);
  if (next !== undefined) go(next);
  const undo = async () => {
    await runtime.restore(id);
    if (next !== undefined) go(id);
  };
  toast(`Deleted ${title}`, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        inBackground(undo(), "Undoing the delete");
      },
    },
  });
}

// Snoozes, and keeps the toast's words in the bell as a note of it (Ethan). The note is read
// already, since the person reading it is the one who just snoozed.
function snoozeWithNote(deps: ThreadDeps, id: ThreadId, until: string): void {
  const { runtime, threads, change } = deps;
  const text = `Snoozed ${named(threads, id)} until ${wakeText(new Date(until), "long")}`;
  const note = { id: crypto.randomUUID(), text }; // → MarkNote
  inBackground(runtime.mark(id, { snoozedUntil: until }, note), "Snoozing");
  change((doc) => markRead(doc, [note.id]));
  toast(text);
}

/** The thread menu's verbs over the runtime (ADR-126 to ADR-130). */
export function threadVerbs(deps: ThreadDeps): ThreadVerbs {
  const { runtime, threads, href, setSnoozing } = deps;
  return {
    copyUrl: (id) => {
      void copyText(href(id), "Thread URL copied");
    },
    pin: (id, pinned) => {
      inBackground(runtime.mark(id, { pinned }), pinned ? "Pinning" : "Unpinning");
    },
    askSnooze: setSnoozing,
    snooze: (id, until) => {
      setSnoozing(null);
      if (until === null) {
        inBackground(runtime.mark(id, { snoozedUntil: null }), "Snoozing");
        toast(`${named(threads, id)} is awake`);
      } else snoozeWithNote(deps, id, until);
    },
    archive: (id, archived) => {
      inBackground(runtime.mark(id, { archived }), archived ? "Archiving" : "Unarchiving");
      if (!archived) return;
      toast(`Archived ${named(threads, id)}`, {
        action: {
          label: "Undo",
          onClick: () => {
            inBackground(runtime.mark(id, { archived: false }), "Unarchiving");
          },
        },
      });
    },
    remove: (id) => {
      removeWithUndo(deps, id);
    },
  };
}
