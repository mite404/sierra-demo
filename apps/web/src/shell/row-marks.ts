import type { ThreadSummary } from "@yaklabs/runtime";
import { wakeText } from "./wake-text";

/** A mark a thread row shows before its title (ADR-127 to ADR-129). */
export type Mark = "pinned" | "snoozed" | "archived";

/** How a thread row reads, given its marks. */
export type RowLook = {
  /** The row's ink at rest: an archived thread is dimmed (ADR-129). */
  ink: "text-soft-ink" | "text-faint-ink";
  /** The marks before the title, left to right. */
  marks: Mark[];
  /** What follows the title for a screen reader: ", pinned, snoozed until Fri 2 Oct, 9:00". */
  spoken: string;
  /** The row's tooltip: its title, and when it wakes if it is snoozed. */
  tooltip: string;
  /** Whether the tooltip has something to say even when the title is not cut. */
  alwaysTip: boolean;
};

// Each mark, in the order a row shows it, and whether a thread carries it.
const MARKS: { mark: Mark; on: (thread: ThreadSummary) => boolean }[] = [
  { mark: "pinned", on: (thread) => thread.pinnedAt !== null },
  { mark: "snoozed", on: (thread) => thread.snoozedUntil !== null },
  { mark: "archived", on: (thread) => thread.archivedAt !== null },
];

// "Fri 2 Oct, 9:00" for a snoozed thread; null for one awake.
function wakeOf(thread: ThreadSummary): string | null {
  return thread.snoozedUntil === null ? null : wakeText(new Date(thread.snoozedUntil), "row");
}

// A mark as a screen reader hears it.
function spokenMark(mark: Mark, wake: string | null): string {
  return mark === "snoozed" ? `snoozed until ${wake ?? ""}` : mark;
}

/** How a thread's row reads: its ink, its marks, what it says aloud and in its tooltip. */
export function rowLook(thread: ThreadSummary): RowLook {
  const marks = MARKS.filter(({ on }) => on(thread)).map(({ mark }) => mark);
  const wake = wakeOf(thread);
  return {
    ink: marks.includes("archived") ? "text-faint-ink" : "text-soft-ink",
    marks,
    spoken: marks.map((mark) => `, ${spokenMark(mark, wake)}`).join(""),
    tooltip: wake === null ? thread.title : `${thread.title} · wakes ${wake}`,
    alwaysTip: wake !== null,
  };
}
