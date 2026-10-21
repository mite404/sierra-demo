import type { Database } from "@sqlite.org/sqlite-wasm";
import { planSettle } from "./settle";
import { readSettleInput, readWorkspace } from "./sqliteRead";
import type { Settled } from "./store";
import { applyMark, type MarkNote, type ThreadMark } from "./marks";
import type { ThreadId, ThreadShare, ThreadSummary } from "./workspace";

// The store's writes for the thread menu (ADR-126 to ADR-131): marks, tombstones, the settling
// pass and the device's record of public shares. Each runs inside the caller's transaction.

const SET_MARKS = `
  update conversations set pinned_at = ?, snoozed_until = ?, archived_at = ?, touched_at = ?
  where id = ?
`;
const INSERT_NOTE = "insert into notifications (id, thread_id, text, at) values (?, ?, ?, ?)";
const INSERT_SHARE = `
  insert into shares (id, thread_id, link, revoke_token, created_at, expires_at)
  values (?, ?, ?, ?, ?, ?)
`;
// A tombstoned thread and its sub-threads, for good. Nothing else may name them first: lanes
// (on their canvas or holding them), the bell's notes and their shares; messages cascade.
const PURGE = [
  "create temp table if not exists purging (id text primary key)",
  "delete from purging",
  "insert into purging select id from conversations where id = ?1 or parent_id = ?1",
  "delete from lanes where main_id in purging or thread_id in purging",
  "delete from notifications where thread_id in purging",
  "delete from shares where thread_id in purging",
  "delete from messages where conversation_id in purging",
  "delete from conversations where parent_id = ?1",
  "delete from conversations where id = ?1",
];
// A live thread as the workspace shows it; deleted and unknown threads are not there.
function liveThread(db: Database, id: ThreadId): ThreadSummary {
  const thread = readWorkspace(db).threads.find((each) => each.id === id);
  if (thread === undefined) throw new Error(`No thread ${id}`);
  return thread;
}

/**
 * Pins, snoozes or archives a live thread by `applyMark`'s rules, restarting its idle clock,
 * and leaves its `note` for the bell, stamped `now`.
 * @throws For a thread that is unknown or deleted, a snooze that is not ahead, and a note whose
 *   id is taken.
 */
export function markThread(
  db: Database,
  id: ThreadId,
  change: ThreadMark,
  now: string,
  note?: MarkNote,
): void {
  const { pinnedAt, snoozedUntil, archivedAt } = applyMark(liveThread(db, id), change, now);
  db.exec({ sql: SET_MARKS, bind: [pinnedAt, snoozedUntil, archivedAt, now, id] });
  if (note !== undefined) db.exec({ sql: INSERT_NOTE, bind: [note.id, id, note.text, now] });
}

/**
 * Puts a tombstone on a live thread (ADR-130).
 * @throws For a thread that is unknown or deleted already.
 */
export function removeThread(db: Database, id: ThreadId, now: string): void {
  liveThread(db, id);
  db.exec({ sql: "update conversations set deleted_at = ? where id = ?", bind: [now, id] });
}

/** Takes a tombstone back. @throws When the thread is not deleted. */
export function restoreThread(db: Database, id: ThreadId, now: string): void {
  db.exec({
    sql: "update conversations set deleted_at = null, touched_at = ? where id = ? and deleted_at is not null",
    bind: [now, id],
  });
  if (db.changes() === 0) throw new Error(`${id} is not deleted`);
}

function purge(db: Database, id: ThreadId): void {
  for (const sql of PURGE) db.exec({ sql, bind: sql.includes("?1") ? [id] : [] });
}

// Wakes each due snooze with a note for the bell; the wake restarts its idle clock.
function wake(db: Database, woken: { id: ThreadId; title: string; until: string }, now: string) {
  db.exec({
    sql: "update conversations set snoozed_until = null, touched_at = ? where id = ?",
    bind: [now, woken.id],
  });
  db.exec({
    sql: "insert or ignore into notifications (id, thread_id, text, at) values (?, ?, ?, ?)",
    bind: [`wake-${woken.id}-${woken.until}`, woken.id, `Back from snooze: ${woken.title}`, now],
  });
}

/**
 * One settling pass at `now` (`planSettle`); call it inside a transaction.
 * @throws When a row breaks the workspace's shape, or a purge breaks a reference.
 */
export function settleThreads(db: Database, now: string, starting: boolean): Settled {
  const plan = planSettle({ ...readSettleInput(db), now, starting });
  for (const woken of plan.wake) wake(db, woken, now);
  for (const id of plan.archive) {
    db.exec({ sql: "update conversations set archived_at = ? where id = ?", bind: [now, id] });
  }
  for (const id of plan.purge) purge(db, id);
  for (const id of plan.expire) db.exec({ sql: "delete from shares where id = ?", bind: [id] });
  const changed =
    plan.wake.length + plan.archive.length + plan.purge.length + plan.expire.length > 0;
  return { changed, next: plan.next };
}

/** Records a share. @throws When its id is taken or its thread is unknown. */
export function addShare(db: Database, share: ThreadShare): void {
  const { id, threadId, link, revokeToken, createdAt, expiresAt } = share;
  db.exec({ sql: INSERT_SHARE, bind: [id, threadId, link, revokeToken, createdAt, expiresAt] });
}
