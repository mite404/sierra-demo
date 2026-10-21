import type { ThreadId } from "./workspace";

/** How long a main can sit untouched before it settles into the archive (ADR-129). */
export const IDLE_MS = 14 * 24 * 60 * 60 * 1000;
/** How long the page offers Undo after a delete (ADR-130). */
export const UNDO_MS = 10_000;
/** When a tombstone goes for good: the undo window, and a grace for an Undo already in flight. */
export const PURGE_AFTER_MS = UNDO_MS + 5000;

/** One thread as settling reads it, deleted ones included; `touchedAt` is its last activity. */
export type SettleRow = {
  id: ThreadId;
  title: string;
  parentId: ThreadId | null;
  touchedAt: string; // the latest of its last message, a mark, and a wake
  pinnedAt: string | null;
  snoozedUntil: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
};

/** What one pass changes, and when the next pass has something to do (null: nothing pending). */
export type SettlePlan = {
  wake: { id: ThreadId; title: string; until: string }[];
  archive: ThreadId[];
  purge: ThreadId[];
  expire: string[];
  next: string | null;
};

/** What a pass reads: the threads, the shares' expiries, the time, and whether the page just opened. */
export type SettleInput = {
  rows: SettleRow[];
  shares: { id: string; expiresAt: string }[];
  now: string;
  starting: boolean;
};

const shift = (at: string, ms: number) => new Date(Date.parse(at) + ms).toISOString();
const latest = (a: string, b: string) => (a > b ? a : b);

// Each live main's last activity: its own touch or its newest live sub-thread's.
function activity(rows: SettleRow[]): Map<ThreadId, string> {
  const live = rows.filter((row) => row.deletedAt === null);
  const touched = new Map(
    live.filter((row) => row.parentId === null).map((row) => [row.id, row.touchedAt] as const),
  );
  for (const kid of live) {
    const at = kid.parentId === null ? undefined : touched.get(kid.parentId);
    if (kid.parentId !== null && at !== undefined)
      touched.set(kid.parentId, latest(at, kid.touchedAt));
  }
  return touched;
}

// A main the idle clock runs for: live, and neither pinned, snoozed nor archived already.
function idleCandidate(row: SettleRow): boolean {
  return (
    row.parentId === null &&
    row.deletedAt === null &&
    row.pinnedAt === null &&
    row.snoozedUntil === null &&
    row.archivedAt === null
  );
}

/**
 * One settling pass over the workspace (ADR-128 to ADR-131), as data: the snoozes that are due
 * wake, mains idle for `IDLE_MS` archive, tombstones past the undo window go for good (every
 * one at start, since no Undo outlives the page that offered it), and expired shares drop.
 * A snooze woken in this pass is not archived in it; the wake restarts its idle clock.
 */
export function planSettle({ rows, shares, now, starting }: SettleInput): SettlePlan {
  const wake = rows
    .filter((row) => row.deletedAt === null && row.snoozedUntil !== null && row.snoozedUntil <= now)
    .map((row) => ({ id: row.id, title: row.title, until: row.snoozedUntil ?? now }));
  const touched = activity(rows); // → main id → last activity
  const deadlines = rows
    .filter((row) => idleCandidate(row))
    .map((row) => ({ id: row.id, at: shift(touched.get(row.id) ?? row.touchedAt, IDLE_MS) }));
  const archive = deadlines.filter((each) => each.at <= now).map((each) => each.id);
  const tombs = rows.flatMap((row) =>
    row.deletedAt === null ? [] : [{ id: row.id, at: shift(row.deletedAt, PURGE_AFTER_MS) }],
  );
  const purge = tombs.filter((each) => starting || each.at <= now).map((each) => each.id);
  const expire = shares.filter((share) => share.expiresAt <= now).map((share) => share.id);
  const ahead = [
    ...rows.flatMap((row) =>
      row.deletedAt === null && row.snoozedUntil !== null ? [row.snoozedUntil] : [],
    ),
    ...deadlines.map((each) => each.at),
    ...tombs.map((each) => each.at),
    ...shares.map((share) => share.expiresAt),
  ].filter((at) => at > now); // → every future moment something falls due
  const next = ahead.toSorted().at(0) ?? null;
  return { wake, archive, purge, expire, next };
}
