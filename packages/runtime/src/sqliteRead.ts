import type { Database, SqlValue } from "@sqlite.org/sqlite-wasm";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { z } from "zod";
import type { Transcript } from "./conversation";
import { threadMessageSchema } from "./protocol";
import type { SettleInput } from "./settle";
import { threadIdSchema, workspaceSchema, type ThreadId, type Workspace } from "./workspace";

// The sidebar shows one line of the latest message, cut at a word-ish length.
const PREVIEW_LENGTH = 80;

const PROJECTS = "select id, name, created_at as createdAt from projects order by created_at, id";
// The threads the page sees: not deleted, and not the sub-thread of a deleted main (ADR-130).
const LIVE = `
  c.deleted_at is null
  and (c.parent_id is null
       or (select p.deleted_at from conversations p where p.id = c.parent_id) is null)
`;
// Every live thread, oldest first, with the text of its latest message for the preview and how
// many messages it holds.
const THREADS = `
  select c.id, c.title, c.project_id, c.parent_id, c.created_at, c.updated_at, c.draft,
    c.pinned_at, c.snoozed_until, c.archived_at,
    coalesce((select m.text from messages m where m.conversation_id = c.id
              order by m.seq desc limit 1), '') as last_text,
    (select count(*) from messages m where m.conversation_id = c.id) as turn_count
  from conversations c where ${LIVE} order by c.created_at, c.id
`;
const LANES = `
  select main_id, id, thread_id, card_json, title, width, collapsed from lanes
  order by main_id, seq
`;
const NOTIFICATIONS = `
  select id, thread_id as threadId, text, at from notifications order by at desc, id
`;
const SHARES = `
  select id, thread_id as threadId, link, revoke_token as revokeToken, created_at as createdAt,
    expires_at as expiresAt
  from shares order by created_at desc, id
`;
// Every thread settling reads, deleted ones included, with its last activity.
const SETTLE_ROWS = `
  select id, title, parent_id as parentId, pinned_at as pinnedAt,
    snoozed_until as snoozedUntil, archived_at as archivedAt, deleted_at as deletedAt,
    max(updated_at, coalesce(touched_at, '')) as touchedAt
  from conversations order by created_at, id
`;

// What SQLite hands back, checked before it becomes a domain type.
const threadRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  project_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  draft: z.string(),
  pinned_at: z.string().nullable(),
  snoozed_until: z.string().nullable(),
  archived_at: z.string().nullable(),
  last_text: z.string(),
  turn_count: z.number(),
});
const settleRowSchema = z.object({
  id: threadIdSchema,
  title: z.string(),
  parentId: threadIdSchema.nullable(),
  touchedAt: z.string(),
  pinnedAt: z.string().nullable(),
  snoozedUntil: z.string().nullable(),
  archivedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
const expirySchema = z.object({ id: z.string(), expiresAt: z.string() });
const laneRowSchema = z.object({
  main_id: z.string(),
  id: z.string(),
  thread_id: z.string().nullable(),
  card_json: z.string().nullable(),
  title: z.string().nullable(),
  width: z.number().nullable(),
  collapsed: z.union([z.literal(0), z.literal(1)]),
});
const transcriptRowSchema = z.object({ updated_at: z.string(), draft: z.string() });
const messageRowSchema = z.object({
  role: z.string(),
  text: z.string(),
  time: z.string(),
  extra_json: z.string(),
});
const extraSchema = z.record(z.string(), z.unknown());

// The latest message's text on one line, shortened with an ellipsis when it runs long.
function toPreview(text: string): string {
  const line = text.replaceAll(/\s+/g, " ").trim();
  return line.length <= PREVIEW_LENGTH ? line : `${line.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…`;
}

function fromMessageRow(row: Record<string, SqlValue>): ThreadMessage {
  const { role, text, time, extra_json } = messageRowSchema.parse(row);
  const extra = extraSchema.parse(JSON.parse(extra_json)); // → Record<string, unknown>
  return threadMessageSchema.parse({ ...extra, role, text, time });
}

// A thread row in the workspace's shape; the workspace schema checks it.
function fromThreadRow(row: Record<string, SqlValue>) {
  const {
    project_id,
    parent_id,
    created_at,
    updated_at,
    last_text,
    turn_count,
    pinned_at,
    snoozed_until,
    archived_at,
    ...rest
  } = threadRowSchema.parse(row);
  const place =
    project_id === null
      ? { kind: "child", parentId: parent_id }
      : { kind: "main", projectId: project_id };
  return {
    ...rest,
    place,
    createdAt: created_at,
    updatedAt: updated_at,
    preview: toPreview(last_text),
    turnCount: turn_count,
    pinnedAt: pinned_at,
    snoozedUntil: snoozed_until,
    archivedAt: archived_at,
  };
}

// A lane row in the workspace's shape; the workspace schema checks it and its card.
function fromLaneRow(row: z.infer<typeof laneRowSchema>) {
  const { id, width, thread_id, card_json, title } = row;
  const collapsed = row.collapsed === 1;
  if (thread_id !== null) return { id, width, collapsed, kind: "thread", threadId: thread_id };
  const card: unknown = JSON.parse(card_json ?? "null");
  return { id, width, collapsed, kind: "card", card, title };
}

/**
 * The whole workspace the database holds, checked by the workspace schema on the way out.
 * @throws When a row breaks the workspace's shape (the schema's checks should make that
 *   impossible).
 */
export function readWorkspace(db: Database): Workspace {
  const threadRows = db.selectObjects(THREADS).map((row) => fromThreadRow(row));
  const lanes = new Map<string, unknown[]>(
    threadRows.filter((row) => row.place.kind === "main").map((row) => [row.id, []]),
  );
  for (const row of db.selectObjects(LANES).map((each) => laneRowSchema.parse(each))) {
    lanes.get(row.main_id)?.push(fromLaneRow(row));
  }
  const saved = db.selectValue("select json from shell where id = 1"); // → JSON text, or undefined
  const shell: unknown = typeof saved === "string" ? JSON.parse(saved) : null;
  // The bell and the shares name only threads the page can see.
  const live = new Set(threadRows.map((row) => row.id));
  const visible = (row: Record<string, SqlValue>) =>
    typeof row.threadId === "string" && live.has(row.threadId);
  return workspaceSchema.parse({
    projects: db.selectObjects(PROJECTS),
    threads: threadRows,
    lanes: Object.fromEntries(lanes),
    shell,
    notifications: db.selectObjects(NOTIFICATIONS).filter((row) => visible(row)),
    shares: db.selectObjects(SHARES).filter((row) => visible(row)),
  });
}

/** Every thread as settling reads it, deleted ones included, and each share's expiry. */
export function readSettleInput(db: Database): Pick<SettleInput, "rows" | "shares"> {
  return {
    rows: db.selectObjects(SETTLE_ROWS).map((row) => settleRowSchema.parse(row)),
    shares: db
      .selectObjects("select id, expires_at as expiresAt from shares")
      .map((row) => expirySchema.parse(row)),
  };
}

/**
 * A thread's turns, draft and `updatedAt`; undefined for an id the database has never held.
 * @throws When a stored turn fails the message schema.
 */
export function readTranscript(db: Database, id: ThreadId): Transcript | undefined {
  const row = db.selectObject("select updated_at, draft from conversations where id = ?", [id]);
  if (row === undefined) return undefined;
  const { updated_at, draft } = transcriptRowSchema.parse(row);
  const messages = db
    .selectObjects(
      "select role, text, time, extra_json from messages where conversation_id = ? order by seq",
      [id],
    )
    .map((message) => fromMessageRow(message)); // → ThreadMessage[]
  return { messages, draft, updatedAt: updated_at };
}
