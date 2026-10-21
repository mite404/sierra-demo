import type { Database, SqlValue } from "@sqlite.org/sqlite-wasm";
import type { CardAttachment } from "@yaklabs/catalog/interactive";
import { z } from "zod";
import type { LegacyCanvas } from "./protocol";
import { seedThread } from "./store";

/** The seeded profit thread: the user's ask (u1), then the interactive profit card (a1). */
export const profitThread = seedThread("profit");

/** The chip the user sends after stepping the profit card to net profit (ADR-030). */
export const netProfitChoice: CardAttachment = {
  turnId: "a1",
  label: "Net profit · Sep 14–20",
  state: { measure: "Net profit" },
};

// The schema every v1 database was made with, copied verbatim from `main` at db7f8fc, so the
// migration tests start from what is on Ethan's device rather than from the code under test.
const V1_SCHEMA = `
  pragma foreign_keys = on;
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
  pragma user_version = 1;
`;

// Ethan's v1 rows: the page's `profit` conversation and two lanes dropped on its canvas, ids as
// the web app's `laneId()` made them.
const V1_CONVERSATIONS = [
  ["profit", "Last week's sales", "2026-09-26T10:03:00.000Z"],
  ["thread-mfx1a2b-q7k2", "Saturday leads at every level", "2026-09-26T10:05:00.000Z"],
  ["thread-mfx1b9c-z3p8", "Weekend margins", "2026-09-26T10:09:00.000Z"],
];
const V1_MESSAGES = [
  ...profitThread.messages.map(({ role, text, time, ...extra }, seq) => [
    "profit",
    seq,
    role,
    text,
    time,
    JSON.stringify(extra),
  ]),
  [
    "thread-mfx1a2b-q7k2",
    0,
    "user",
    "> Saturday leads at every level\n\nWhy?",
    "10:05",
    '{"id":"u1"}',
  ],
  ["thread-mfx1b9c-z3p8", 0, "user", "Which day has the best margin?", "10:09", '{"id":"u1"}'],
];

/** The v1 canvas keys on Ethan's device: the first lane closed, the second one kept. */
export const v1Legacy: LegacyCanvas = {
  hidden: ["thread-mfx1a2b-q7k2"],
  order: ["thread-mfx1b9c-z3p8"],
};

/** Writes Ethan's v1 database: the exact v1 schema, then his rows through its FTS triggers. */
export function writeV1(db: Database): void {
  db.exec(V1_SCHEMA);
  for (const bind of V1_CONVERSATIONS) {
    db.exec({ sql: "insert into conversations (id, title, updated_at) values (?, ?, ?)", bind });
  }
  for (const bind of V1_MESSAGES) {
    db.exec({
      sql: `insert into messages (conversation_id, seq, role, text, time, extra_json)
            values (?, ?, ?, ?, ?, ?)`,
      bind,
    });
  }
}

/**
 * Everything a database holds, comparable with `toEqual`: its version, its schema, and every
 * row of every table but the full-text index's own shadow tables, in a fixed order.
 */
export function dumpDatabase(db: Database): Record<string, SqlValue | Record<string, SqlValue>[]> {
  const tables = z.array(z.string()).parse(
    db.selectValues(
      `select name from sqlite_schema where type = 'table'
       and name not like 'sqlite_%' and name not like 'messages_fts%' order by name`,
    ),
  );
  const dump: Record<string, SqlValue | Record<string, SqlValue>[]> = {
    user_version: db.selectValue("pragma user_version") ?? null,
    schema: db.selectObjects("select type, name, sql from sqlite_schema order by name"),
  };
  for (const name of tables) {
    dump[`table ${name}`] = db.selectObjects(`select * from "${name}" order by 1, 2`);
  }
  return dump;
}
