import { z } from "zod";
import type { ThreadSummary } from "./workspace";

const instantSchema = z.iso.datetime();

/** A pin, a snooze or an archive, as the page asks for it; at least one is named. */
export const threadMarkSchema = z
  .object({
    pinned: z.boolean().optional(),
    snoozedUntil: instantSchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((change) => Object.keys(change).length > 0, "A mark changes something");

/** What a mark changes on one thread; a key left out stays as it is. */
export type ThreadMark = z.infer<typeof threadMarkSchema>;

/**
 * A note for the bell that a mark leaves in the same write: the page words it, as its toast
 * said it, and names it, so it can count the note read at once.
 */
export const markNoteSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });

/** The bell's note a mark leaves; its thread and its time are the mark's. */
export type MarkNote = z.infer<typeof markNoteSchema>;

// The pin after a change: a pin keeps its first stamp, an unpin clears it, no word keeps it.
function pinAfter(pinnedAt: string | null, pinned: boolean | undefined, now: string) {
  if (pinned === undefined) return pinnedAt;
  return pinned ? (pinnedAt ?? now) : null;
}

/**
 * A thread after `change`, at `now`. A pin keeps its first stamp; archiving clears the pin and
 * the snooze, since an archived thread is done; pinning or snoozing brings it back.
 * @throws When a snooze would wake at or before `now`.
 */
export function applyMark<T extends ThreadSummary>(thread: T, change: ThreadMark, now: string): T {
  const { pinned, snoozedUntil, archived } = change;
  const snoozing = snoozedUntil !== undefined && snoozedUntil !== null;
  if (snoozing && snoozedUntil <= now) throw new Error("A snooze wakes after now");
  if (archived === true) return { ...thread, archivedAt: now, pinnedAt: null, snoozedUntil: null };
  const revived = archived === false || pinned === true || snoozing;
  return {
    ...thread,
    pinnedAt: pinAfter(thread.pinnedAt, pinned, now),
    snoozedUntil: snoozedUntil === undefined ? thread.snoozedUntil : snoozedUntil,
    archivedAt: revived ? null : thread.archivedAt,
  };
}

/**
 * A list in its usual order, with the pinned lifted to the top and the archived settled to the
 * bottom; each group keeps that order among itself, and a snoozed thread stays where it is
 * (ADR-127 to ADR-129).
 */
export function markOrder<T extends ThreadSummary>(threads: T[]): T[] {
  const pinned = threads.filter((thread) => thread.pinnedAt !== null);
  const archived = threads.filter((thread) => thread.archivedAt !== null);
  const rest = threads.filter((thread) => thread.pinnedAt === null && thread.archivedAt === null);
  return [...pinned, ...rest, ...archived];
}
