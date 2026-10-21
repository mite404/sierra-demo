import type { BindingSpec, Database, SqlValue } from "@sqlite.org/sqlite-wasm";
import { z } from "zod";
import type { LegacyCanvas } from "./protocol";
import { migrateToV3 } from "./schemaV3";
import { planV2 } from "./v2Plan";
import { threadIdSchema, type Lane, type ThreadId } from "./workspace";

// One migration step. It runs inside the transaction that also bumps `user_version`.
type Step = (db: Database, legacy: LegacyCanvas | undefined) => void;

// Rows hold what every turn has; `extra_json` holds the rest (its id, chips, files and cards).
// The full-text index is an external-content FTS5 table kept in step by triggers, so it can
// never disagree with the rows it indexes.
const V1_DDL = `
  create table if not exists conversations (
    id text primary key,
    title text not null,
    updated_at text not null
  );
  create table if not exists messages (
    conversation_id text not null references conversations (id) on delete cascade,
    seq integer not null,
    role text not null check (role in ('user', 'agent')),
    text text not null,
    time text not null,
    extra_json text not null,
    primary key (conversation_id, seq)
  );
  create virtual table if not exists messages_fts using fts5 (
    text, content = 'messages', content_rowid = 'rowid'
  );
  create trigger if not exists messages_fts_insert after insert on messages begin
    insert into messages_fts (rowid, text) values (new.rowid, new.text);
  end;
  create trigger if not exists messages_fts_delete after delete on messages begin
    insert into messages_fts (messages_fts, rowid, text) values ('delete', old.rowid, old.text);
  end;
  create trigger if not exists messages_fts_update after update on messages begin
    insert into messages_fts (messages_fts, rowid, text) values ('delete', old.rowid, old.text);
    insert into messages_fts (rowid, text) values (new.rowid, new.text);
  end;
`;
// Step 1 → 2 builds the new `conversations` beside the old one, fills it from the plan, then
// swaps it in: a table check is the only way to hold "a main or a child, never both", and a
// check cannot be added to a table that exists. It runs with foreign keys off, so dropping the
// old table leaves `messages` alone, and `messages` points at the new one once it is renamed.
const V2_TABLES = `
  create table projects (
    id text primary key,
    name text not null,
    created_at text not null
  );
  create table conversations_next (
    id text primary key,
    title text not null,
    created_at text not null,
    updated_at text not null,
    project_id text references projects (id),
    parent_id text references conversations (id),
    draft text not null default '',
    check ((project_id is null) <> (parent_id is null))
  );
`;
const V2_SWAP = `
  drop table conversations;
  alter table conversations_next rename to conversations;
`;
// A check cannot read another row, so the rules that span rows are triggers: a child's parent
// is a main (depth one), no thread changes place, and a thread lane sits on its own main. The
// depth rule asks for the parent's project: the trigger runs before the row exists, so a child
// of itself finds no parent, and a missing parent and a sub-thread have no project either.
const V2_RULES = `
  create index conversations_by_project on conversations (project_id);
  create index conversations_by_parent on conversations (parent_id);
  create trigger conversations_depth_one before insert on conversations
  when new.parent_id is not null
    and (select project_id from conversations where id = new.parent_id) is null
  begin
    select raise(abort, 'A sub-thread''s parent is a main thread');
  end;
  create trigger conversations_place_fixed before update of project_id, parent_id on conversations
  when new.project_id is not old.project_id or new.parent_id is not old.parent_id
  begin
    select raise(abort, 'A thread never changes place');
  end;
  create table lanes (
    main_id text not null references conversations (id),
    seq integer not null,
    id text not null,
    thread_id text references conversations (id),
    card_json text,
    title text,
    width real check (width is null or width > 0),
    primary key (main_id, id),
    unique (main_id, seq),
    check ((thread_id is null) <> (card_json is null)),
    check ((card_json is null) = (title is null)),
    check (thread_id is null or id = 'l-' || thread_id)
  );
  create trigger lanes_on_own_main before insert on lanes
  when (select parent_id from conversations where id = new.main_id) is not null
    or (new.thread_id is not null
        and (select parent_id from conversations where id = new.thread_id) is not new.main_id)
  begin
    select raise(abort, 'A lane sits on a main thread, and a thread lane on its own');
  end;
  create trigger lanes_replaced_whole before update on lanes
  begin
    select raise(abort, 'Lanes are replaced, never edited');
  end;
  create table shell (
    id integer primary key check (id = 1),
    json text not null
  );
  create table notifications (
    id text primary key,
    thread_id text not null references conversations (id),
    text text not null,
    at text not null
  );
`;

// Step 3 → 4 gives each lane whether it is collapsed (ADR-133). Every lane a v3 canvas holds
// was open, so each one starts expanded; the check keeps the flag a yes or a no.
const V4_COLLAPSED = `
  alter table lanes add column collapsed integer not null default 0 check (collapsed in (0, 1));
`;

const INSERT_PROJECT = "insert into projects (id, name, created_at) values (?, ?, ?)";
// A v1 row moves over with its title and times; its place comes from the plan.
const MOVE_CONVERSATION = `
  insert into conversations_next (id, title, created_at, updated_at, project_id, parent_id)
  select id, title, ?, updated_at, ?, ? from conversations where id = ?
`;
// The lanes as the 1 → 2 step writes them, before the table had `collapsed`: a finished step
// keeps writing the columns its version had.
const INSERT_V2_LANE = `
  insert into lanes (main_id, seq, id, thread_id, card_json, title, width)
  values (?, ?, ?, ?, ?, ?, ?)
`;
const INSERT_LANE = `
  insert into lanes (main_id, seq, id, thread_id, card_json, title, width, collapsed)
  values (?, ?, ?, ?, ?, ?, ?, ?)
`;

const v1RowSchema = z.object({ id: threadIdSchema, updated_at: z.string() });

// A lane's row in the v2 columns: everything but whether it is collapsed.
function v2LaneRow(mainId: ThreadId, seq: number, lane: Lane): SqlValue[] {
  return lane.kind === "thread"
    ? [mainId, seq, lane.id, lane.threadId, null, null, lane.width]
    : [mainId, seq, lane.id, null, JSON.stringify(lane.card), lane.title, lane.width];
}

function laneRow(mainId: ThreadId, seq: number, lane: Lane): BindingSpec {
  return [...v2LaneRow(mainId, seq, lane), lane.collapsed ? 1 : 0];
}

/**
 * Replaces a main thread's lanes with exactly `lanes`, left to right.
 * @throws When a lane breaks a rule: the main is missing or a sub-thread, a thread lane is not
 *   one of its own children or its id is not `l-<threadId>`, or an id appears twice.
 */
export function writeLanes(db: Database, mainId: ThreadId, lanes: Lane[]): void {
  db.exec({ sql: "delete from lanes where main_id = ?", bind: [mainId] });
  for (const [seq, lane] of lanes.entries()) {
    db.exec({ sql: INSERT_LANE, bind: laneRow(mainId, seq, lane) });
  }
}

function userVersion(db: Database): number {
  return z.number().parse(db.selectValue("pragma user_version"));
}

function migrateToV2(db: Database, legacy: LegacyCanvas | undefined): void {
  const rows = db
    .selectObjects("select id, updated_at from conversations")
    .map((row) => v1RowSchema.parse(row))
    .map(({ id, updated_at }) => ({ id, updatedAt: updated_at })); // → V1Row[]
  const plan = planV2(rows, legacy);
  db.exec(V2_TABLES);
  for (const { id, name, createdAt } of plan.projects) {
    db.exec({ sql: INSERT_PROJECT, bind: [id, name, createdAt] });
  }
  for (const { id, createdAt, place } of plan.threads) {
    const projectId = place.kind === "main" ? place.projectId : null;
    const parentId = place.kind === "child" ? place.parentId : null;
    db.exec({ sql: MOVE_CONVERSATION, bind: [createdAt, projectId, parentId, id] });
  }
  db.exec(V2_SWAP);
  db.exec(V2_RULES);
  for (const { mainId, lanes } of plan.lanes) {
    for (const [seq, lane] of lanes.entries()) {
      db.exec({ sql: INSERT_V2_LANE, bind: v2LaneRow(mainId, seq, lane) });
    }
  }
}

function migrateToV4(db: Database): void {
  db.exec(V4_COLLAPSED);
}

/**
 * The steps from each `user_version` to the next: 0 → 1 is the v1 schema, 1 → 2 the rebuild,
 * 2 → 3 the marks, tombstones and shares, 3 → 4 a lane's collapsed flag.
 */
export const migrationSteps = [
  (db: Database) => {
    db.exec(V1_DDL);
  },
  migrateToV2,
  migrateToV3,
  migrateToV4,
] as const satisfies readonly Step[];

/**
 * Brings the database to the newest schema, one step per `user_version`. Each step runs in one
 * transaction that also bumps the version once `foreign_key_check` finds nothing, so a crash
 * rolls that step back and the next run repeats it; a finished step never reruns. Foreign keys
 * are off during a step (the pragma does nothing inside a transaction) and on again after.
 *
 * @throws When a step fails or leaves a broken reference (the database stays at the last
 *   finished version), or when the database is newer than `steps` knows.
 */
export function migrate(
  db: Database,
  legacy?: LegacyCanvas,
  steps: readonly Step[] = migrationSteps,
): void {
  const start = userVersion(db);
  if (start > steps.length) {
    throw new Error(`The database is at version ${start}, newer than this build`);
  }
  for (const [offset, step] of steps.slice(start).entries()) {
    const version = start + offset;
    db.exec("pragma foreign_keys = off");
    try {
      db.transaction((tx) => {
        step(tx, legacy);
        const broken = tx.selectObjects("pragma foreign_key_check");
        if (broken.length > 0) {
          throw new Error(
            `Step ${version} → ${version + 1} broke references: ${JSON.stringify(broken)}`,
          );
        }
        tx.exec(`pragma user_version = ${version + 1}`);
      });
    } finally {
      db.exec("pragma foreign_keys = on");
    }
  }
}
