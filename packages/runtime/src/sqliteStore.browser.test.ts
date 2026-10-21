import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { threadMessageSchema } from "./protocol";
import { openSqliteStore, StorageUnavailableError } from "./sqliteStore";
import { netProfitChoice } from "./testing";
import { inFreshWorker } from "./testWorkerClient";

// The user's first turn on the starter's empty thread, with a card choice riding along.
const turn: ThreadMessage = {
  id: "u2",
  role: "user",
  text: "Why is Saturday high?",
  time: "10:03",
  attachments: [netProfitChoice],
};
const kept = [turn];

const readSchema = z.object({
  ok: z.literal(true),
  result: z.object({ messages: z.array(threadMessageSchema) }),
});
const failedSchema = z.object({ ok: z.literal(true), result: z.string() });
const dumpSchema = z.record(z.string(), z.unknown());
const migrationSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    v1: dumpSchema,
    once: dumpSchema,
    twice: dumpSchema,
    crash: z.string(),
    afterCrash: dumpSchema,
    recovered: dumpSchema,
    brokenKeys: z.array(z.unknown()),
    found: z.array(z.string()),
  }),
});

const freshName = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

describe("SQLite store in the browser's private file system", () => {
  it("reads a thread back from a new store on the same file", async () => {
    const name = freshName("store");
    const reply = await inFreshWorker({ kind: "save-then-reopen", name, turn });
    expect(readSchema.parse(reply).result.messages).toEqual(kept);
  });

  it("still has it in the next worker, after the first one is gone", async () => {
    const name = freshName("store");
    await inFreshWorker({ kind: "save-then-reopen", name, turn });
    const reply = await inFreshWorker({ kind: "read", name });
    expect(readSchema.parse(reply).result.messages).toEqual(kept);
  });

  it("keeps the file when an open fails and the pool comes free as sqlite-wasm cleans up", async () => {
    const name = freshName("store");
    await inFreshWorker({ kind: "save-then-reopen", name, turn });
    const failed = await inFreshWorker({ kind: "open-while-held", name });
    expect(failedSchema.parse(failed).result).toContain("private file system is unavailable");
    const reply = await inFreshWorker({ kind: "read", name });
    expect(readSchema.parse(reply).result.messages).toEqual(kept);
  });

  it("refuses the private file system outside a Worker, so the runtime can fall back", async () => {
    const opening = openSqliteStore({ kind: "opfs", name: "main-thread" });
    await expect(opening).rejects.toThrow(StorageUnavailableError);
    await expect(opening).rejects.toThrow("Missing required OPFS APIs");
  });
});

describe("Ethan's v1 database in the private file system", () => {
  it("migrates once, reruns as a no-op, and recovers from a crash inside the step", async () => {
    const reply = await inFreshWorker({ kind: "migrate-v1", name: freshName("v1") });
    const run = migrationSchema.parse(reply).result;
    expect(run.v1.user_version).toBe(1);
    expect(run.once.user_version).toBe(4);
    expect(run.twice).toEqual(run.once);
    expect(run.crash).toBe("crashed before commit");
    expect(run.afterCrash).toEqual(run.v1);
    expect(run.recovered).toEqual(run.once);
    expect(run.brokenKeys).toEqual([]);
    expect(run.found).toEqual(["thread-mfx1a2b-q7k2"]);
  });

  it("makes profit the Demo store's main, keeps every turn, and reopens only the kept lane", async () => {
    const reply = await inFreshWorker({ kind: "migrate-v1", name: freshName("v1") });
    const { v1, once } = migrationSchema.parse(reply).result;
    expect(once["table projects"]).toEqual([
      { id: "demo-store", name: "Demo store", created_at: "2026-09-26T10:03:00.000Z" },
    ]);
    expect(once["table conversations"]).toMatchObject([
      { id: "profit", project_id: "demo-store", parent_id: null, draft: "", deleted_at: null },
      { id: "thread-mfx1a2b-q7k2", project_id: null, parent_id: "profit", draft: "" },
      { id: "thread-mfx1b9c-z3p8", project_id: null, parent_id: "profit", draft: "" },
    ]);
    expect(once["table lanes"]).toEqual([
      {
        main_id: "profit",
        seq: 0,
        id: "l-thread-mfx1b9c-z3p8",
        thread_id: "thread-mfx1b9c-z3p8",
        card_json: null,
        title: null,
        width: null,
        collapsed: 0,
      },
    ]);
    expect(once["table messages"]).toEqual(v1["table messages"]);
  });
});
