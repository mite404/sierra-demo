import type { Database } from "@sqlite.org/sqlite-wasm";

// Step 2 → 3 (ADR-132): a thread's marks, its tombstone and its idle clock, and the shares the
// device made public. Each column is null until something sets it; `touched_at` null reads as
// the thread's `updated_at`. Adding columns keeps every row, and the step's one transaction
// takes them back on a crash, so a rerun starts from the same v2 file.
const V3_MARKS = `
  alter table conversations add column pinned_at text;
  alter table conversations add column snoozed_until text;
  alter table conversations add column archived_at text;
  alter table conversations add column deleted_at text;
  alter table conversations add column touched_at text;
  create table shares (
    id text primary key,
    thread_id text not null references conversations (id),
    link text not null,
    revoke_token text not null,
    created_at text not null,
    expires_at text not null,
    check (expires_at > created_at)
  );
  create index shares_by_thread on shares (thread_id);
`;

/** Step 2 → 3: adds the marks, the tombstone, the idle clock and the shares table. */
export function migrateToV3(db: Database): void {
  db.exec(V3_MARKS);
}
