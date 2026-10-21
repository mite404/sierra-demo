/// <reference lib="webworker" />
import type { Database } from "@sqlite.org/sqlite-wasm";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { z } from "zod";
import { threadMessageSchema } from "./protocol";
import { migrate, migrationSteps } from "./schema";
import { openDatabase, openSqliteStore } from "./sqliteStore";
import { ensureStarter } from "./store";
import { STARTER } from "./workspace";
import { dumpDatabase, v1Legacy, writeV1 } from "./testing";

// Started only by sqliteStore.browser.test.ts: OPFS's fast mode exists only inside a Worker.
declare const self: DedicatedWorkerGlobalScope;

// What the test asks for: add a turn to the starter's thread then reopen in this worker, read
// what an earlier one saved, migrate Ethan's v1 database on a clean run and through a crash,
// set a file's schema version and answer the one it had, or open a file while another holder
// has its pool.
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("save-then-reopen"), name: z.string(), turn: threadMessageSchema }),
  z.object({ kind: z.literal("read"), name: z.string() }),
  z.object({ kind: z.literal("migrate-v1"), name: z.string() }),
  z.object({ kind: z.literal("set-version"), name: z.string(), version: z.int().nonnegative() }),
  z.object({ kind: z.literal("open-while-held"), name: z.string() }),
]);
type Request = z.infer<typeof requestSchema>;

// The 1 → 2 step with a crash after the rebuild, before its transaction commits; the 2 → 3
// step after it is never reached.
const crashingSteps: typeof migrationSteps = [
  migrationSteps[0],
  (db, legacy) => {
    migrationSteps[1](db, legacy);
    throw new Error("crashed before commit");
  },
  migrationSteps[2],
  migrationSteps[3],
];

async function saveThenReopen(name: string, turn: ThreadMessage) {
  const first = await openSqliteStore({ kind: "opfs", name });
  ensureStarter(first, "2026-09-26T10:02:00.000Z");
  first.changeTranscript(STARTER.thread.id, (now) => ({
    ...now,
    messages: [...now.messages, turn],
  }));
  first.close();
  return read(name); // a new instance, same file
}

async function read(name: string) {
  const store = await openSqliteStore({ kind: "opfs", name });
  try {
    return store.transcript(STARTER.thread.id);
  } finally {
    store.close();
  }
}

// Opens the file, does one thing to it, and closes it, the way a worker's run would.
async function withFile<T>(name: string, work: (db: Database) => T): Promise<T> {
  const db = await openDatabase({ kind: "opfs", name });
  try {
    db.exec("pragma foreign_keys = on");
    return work(db);
  } finally {
    db.close();
  }
}

function crashOnce(db: Database): string {
  try {
    migrate(db, v1Legacy, crashingSteps);
    return "no crash";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function migrateV1(name: string) {
  const [clean, crashed] = [`${name}-clean`, `${name}-crash`];
  const v1 = await withFile(clean, (db) => (writeV1(db), dumpDatabase(db)));
  const once = await withFile(clean, (db) => (migrate(db, v1Legacy), dumpDatabase(db)));
  const twice = await withFile(clean, (db) => (migrate(db, v1Legacy), dumpDatabase(db)));
  await withFile(crashed, writeV1);
  const crash = await withFile(crashed, crashOnce);
  const afterCrash = await withFile(crashed, dumpDatabase);
  const recovered = await withFile(crashed, (db) => (migrate(db, v1Legacy), dumpDatabase(db)));
  const brokenKeys = await withFile(crashed, (db) => db.selectObjects("pragma foreign_key_check"));
  const found = await withFile(crashed, (db) =>
    db.selectValues(
      `select distinct m.conversation_id from messages_fts f join messages m on m.rowid = f.rowid
       where messages_fts match 'saturday' order by 1`,
    ),
  );
  return { v1, once, twice, crash, afterCrash, recovered, brokenKeys, found };
}

function setVersion(name: string, version: number): Promise<unknown> {
  return withFile(name, (db) => {
    const had = db.selectValue("pragma user_version");
    db.exec(`pragma user_version = ${version}`);
    return had;
  });
}

// Every file sqlite-wasm keeps the pool's databases in, held as the tab that has them open holds
// them.
async function holdPool(name: string): Promise<FileSystemSyncAccessHandle[]> {
  const root = await navigator.storage.getDirectory();
  const vfs = await root.getDirectoryHandle(`.opfs-sahpool-${name}`);
  const opaque = await vfs.getDirectoryHandle(".opaque");
  const held: FileSystemSyncAccessHandle[] = [];
  for await (const entry of opaque.values()) {
    if (entry instanceof FileSystemFileHandle) held.push(await entry.createSyncAccessHandle());
  }
  return held;
}

// Opens the file while its pool is held, as a second tab meets the first, and lets the pool go
// the moment sqlite-wasm starts its recursive delete after the failed open, as the first tab
// closing just then would. Answers why the open failed.
async function openWhileHeld(name: string): Promise<string> {
  const held = await holdPool(name);
  const letGo = () => {
    for (const handle of held) handle.close();
  };
  // oxlint-disable-next-line typescript/unbound-method -- called below with each handle as `this`
  const { removeEntry } = FileSystemDirectoryHandle.prototype;
  FileSystemDirectoryHandle.prototype.removeEntry = function (entry, options) {
    if (options?.recursive === true) letGo();
    return removeEntry.call(this, entry, options);
  };
  try {
    (await openDatabase({ kind: "opfs", name })).close();
    return "opened";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    FileSystemDirectoryHandle.prototype.removeEntry = removeEntry;
    letGo();
  }
}

function run(request: Request): Promise<unknown> {
  switch (request.kind) {
    case "read":
      return read(request.name);
    case "save-then-reopen":
      return saveThenReopen(request.name, request.turn);
    case "migrate-v1":
      return migrateV1(request.name);
    case "set-version":
      return setVersion(request.name, request.version);
    case "open-while-held":
      return openWhileHeld(request.name);
    default: {
      const unhandled: never = request;
      return unhandled;
    }
  }
}

async function answer(data: unknown): Promise<void> {
  try {
    const result = await run(requestSchema.parse(data));
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- workers have none
    self.postMessage({ ok: true, result: result ?? null });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- workers have none
    self.postMessage({ ok: false, reason });
  }
}

self.addEventListener("message", (event) => {
  void answer(event.data);
});
