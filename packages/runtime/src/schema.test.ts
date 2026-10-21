import type { Database } from "@sqlite.org/sqlite-wasm";
import { describe, expect, it, onTestFinished } from "vitest";
import type { LegacyCanvas } from "./protocol";
import { migrate, migrationSteps } from "./schema";
import { planV2, type V1Row } from "./v2Plan";
import { openDatabase } from "./sqliteStore";
import { threadIdSchema, threadLane } from "./workspace";

const row = (id: string, minute: number): V1Row => ({
  id: threadIdSchema.parse(id),
  updatedAt: `2026-09-26T10:${String(minute).padStart(2, "0")}:00.000Z`,
});

// Ethan's v1 rows: profit, then three lanes dropped on its canvas, oldest first.
const profit = row("profit", 3);
const [a, b, c] = [row("thread-a", 5), row("thread-b", 9), row("thread-c", 12)];
const demoStore = { id: "demo-store", name: "Demo store", createdAt: profit.updatedAt };
const lanesOnProfit = (rows: V1Row[]) => [
  { mainId: "profit", lanes: rows.map((each) => threadLane(each.id)) },
];
const asMain = (each: V1Row) => ({
  id: each.id,
  createdAt: each.updatedAt,
  place: { kind: "main", projectId: "demo-store" },
});
const asChild = (each: V1Row) => ({
  id: each.id,
  createdAt: each.updatedAt,
  place: { kind: "child", parentId: "profit" },
});

// A fresh in-memory database at the newest schema, with a project and one main, "main".
async function freshDatabase(): Promise<Database> {
  const db = await openDatabase({ kind: "memory" });
  onTestFinished(() => {
    db.close();
  });
  db.exec("pragma foreign_keys = on");
  migrate(db);
  db.exec("insert into projects values ('p', 'P', '2026-09-26T10:00:00.000Z')");
  insertThread(db, "main", "p", null);
  return db;
}

function insertThread(db: Database, id: string, project: string | null, parent: string | null) {
  db.exec({
    sql: `insert into conversations (id, title, created_at, updated_at, project_id, parent_id)
          values (?, ?, '2026-09-26T10:00:00.000Z', '2026-09-26T10:00:00.000Z', ?, ?)`,
    bind: [id, id, project, parent],
  });
}

// Puts a lane on `main`: a thread lane when `thread` is given, else a card lane.
function insertLane(db: Database, main: string, seq: number, id: string, thread?: string) {
  const card = thread === undefined ? ['{"v":1}', "Card"] : [null, null];
  db.exec({
    sql: `insert into lanes (main_id, seq, id, thread_id, card_json, title)
          values (?, ?, ?, ?, ?, ?)`,
    bind: [main, seq, id, thread ?? null, ...card],
  });
}

describe("planV2", () => {
  it.each<[string, V1Row[], LegacyCanvas | undefined, unknown]>([
    [
      "plans nothing for an empty database",
      [],
      undefined,
      { projects: [], threads: [], lanes: [] },
    ],
    [
      "makes profit the main and keeps the lanes the v1 canvas showed, in its order",
      [c, a, profit, b],
      { hidden: ["thread-b"], order: ["thread-c"] },
      {
        projects: [demoStore],
        threads: [asMain(profit), asChild(a), asChild(b), asChild(c)],
        lanes: lanesOnProfit([c, a]),
      },
    ],
    [
      "opens every child oldest first when the page had no canvas keys",
      [profit, c, a],
      undefined,
      {
        projects: [demoStore],
        threads: [asMain(profit), asChild(a), asChild(c)],
        lanes: lanesOnProfit([a, c]),
      },
    ],
    [
      "ignores keys that name no conversation",
      [profit, a],
      { hidden: ["gone"], order: ["gone", "thread-a"] },
      { projects: [demoStore], threads: [asMain(profit), asChild(a)], lanes: lanesOnProfit([a]) },
    ],
    [
      "makes every conversation a main, with no lanes, when there is no profit",
      [b, a],
      { hidden: [], order: ["thread-b"] },
      {
        projects: [{ ...demoStore, createdAt: a.updatedAt }],
        threads: [asMain(a), asMain(b)],
        lanes: [],
      },
    ],
  ])("%s", (_, rows, legacy, expected) => {
    expect(planV2(rows, legacy)).toEqual(expected);
  });
});

describe("migrate", () => {
  it("brings a new database to version 4, and leaves it there on a second run", async () => {
    const db = await freshDatabase();
    migrate(db);
    expect(db.selectValue("pragma user_version")).toBe(4);
  });

  it("refuses a database newer than this build", async () => {
    const db = await freshDatabase();
    db.exec("pragma user_version = 5");
    expect(() => {
      migrate(db);
    }).toThrow("The database is at version 5, newer than this build");
  });
});

// A database stopped at version 2, holding a project, a main with a child, a lane and a turn.
async function atVersion2(): Promise<Database> {
  const db = await openDatabase({ kind: "memory" });
  onTestFinished(() => {
    db.close();
  });
  db.exec("pragma foreign_keys = on");
  migrate(db, undefined, migrationSteps.slice(0, 2));
  db.exec("insert into projects values ('p', 'P', '2026-09-26T10:00:00.000Z')");
  insertThread(db, "main", "p", null);
  insertThread(db, "kid", null, "main");
  insertLane(db, "main", 0, "l-kid", "kid");
  db.exec(`insert into messages values ('kid', 0, 'user', 'Why?', '10:00', '{"id":"u1"}')`);
  return db;
}

// Every row of the tables v2 already had, so a step can be shown to leave them alone.
const v2Rows = (db: Database) =>
  ["projects", "lanes", "messages", "notifications"].map((table) =>
    db.selectObjects(`select * from ${table} order by 1, 2`),
  );
const threadRows = (db: Database) =>
  db.selectObjects(
    "select id, title, created_at, updated_at, project_id, parent_id, draft from conversations order by id",
  );

describe("the 2 → 3 step (ADR-132)", () => {
  it("adds the marks and the shares and leaves every v2 row as it was", async () => {
    const db = await atVersion2();
    const [before, threads] = [v2Rows(db), threadRows(db)];
    migrate(db, undefined, migrationSteps.slice(0, 3));
    expect(db.selectValue("pragma user_version")).toBe(3);
    expect(v2Rows(db)).toEqual(before);
    expect(threadRows(db)).toEqual(threads);
    expect(
      db.selectObjects(
        "select pinned_at, snoozed_until, archived_at, deleted_at, touched_at from conversations",
      ),
    ).toEqual([
      {
        pinned_at: null,
        snoozed_until: null,
        archived_at: null,
        deleted_at: null,
        touched_at: null,
      },
      {
        pinned_at: null,
        snoozed_until: null,
        archived_at: null,
        deleted_at: null,
        touched_at: null,
      },
    ]);
    expect(db.selectValue("select count(*) from shares")).toBe(0);
  });
});

describe("the 2 → 3 step survives a crash", () => {
  it("rolls back a crash inside the step, then finishes on the next run", async () => {
    const db = await atVersion2();
    const before = [v2Rows(db), threadRows(db)];
    const crashing = [
      ...migrationSteps.slice(0, 2),
      (tx: Database) => {
        migrationSteps[2](tx);
        throw new Error("The tab closed");
      },
    ];
    expect(() => {
      migrate(db, undefined, crashing);
    }).toThrow("The tab closed");
    expect(db.selectValue("pragma user_version")).toBe(2);
    expect(db.selectValues("select name from pragma_table_info('conversations')")).not.toContain(
      "pinned_at",
    );
    migrate(db, undefined, migrationSteps.slice(0, 3));
    migrate(db, undefined, migrationSteps.slice(0, 3));
    expect(db.selectValue("pragma user_version")).toBe(3);
    expect([v2Rows(db), threadRows(db)]).toEqual(before);
    expect(db.selectObjects("pragma foreign_key_check")).toEqual([]);
  });
});

describe("the v3 schema keeps shares on their thread", () => {
  it("keeps a share only for a thread that exists", async () => {
    const db = await freshDatabase();
    const share = (thread: string) => {
      db.exec({
        sql: `insert into shares (id, thread_id, link, revoke_token, created_at, expires_at)
              values ('s-' || ?, ?, 'https://kay.example/share.html#t=x', 'r', ?, ?)`,
        bind: [thread, thread, "2026-09-26T10:00:00.000Z", "2026-09-26T11:00:00.000Z"],
      });
    };
    share("main");
    expect(() => {
      share("nowhere");
    }).toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe("the 3 → 4 step (ADR-133)", () => {
  it("keeps a v3 canvas's lanes, each expanded", async () => {
    const db = await openDatabase({ kind: "memory" });
    onTestFinished(() => {
      db.close();
    });
    migrate(db, undefined, migrationSteps.slice(0, 3));
    db.exec("insert into projects values ('p', 'P', '2026-09-26T10:00:00.000Z')");
    insertThread(db, "main", "p", null);
    insertThread(db, "kid", null, "main");
    insertLane(db, "main", 0, "l-kid", "kid");
    insertLane(db, "main", 1, "c-1");
    migrate(db);
    expect(db.selectValue("pragma user_version")).toBe(4);
    expect(db.selectObjects("select id, width, collapsed from lanes order by seq")).toEqual([
      { id: "l-kid", width: null, collapsed: 0 },
      { id: "c-1", width: null, collapsed: 0 },
    ]);
  });
});

describe("the v2 schema keeps every thread in one place", () => {
  it.each<[string, string | null, string | null]>([
    ["both a main and a child", "p", "main"],
    ["neither a main nor a child", null, null],
  ])("refuses a thread that is %s", async (_, project, parent) => {
    const db = await freshDatabase();
    expect(() => {
      insertThread(db, "odd", project, parent);
    }).toThrow(/CHECK constraint failed/);
  });

  it("refuses a sub-thread of a sub-thread, and a thread that moves", async () => {
    const db = await freshDatabase();
    insertThread(db, "child", null, "main");
    expect(() => {
      insertThread(db, "grandchild", null, "child");
    }).toThrow("A sub-thread's parent is a main thread");
    expect(() => {
      db.exec("update conversations set parent_id = null, project_id = 'p' where id = 'child'");
    }).toThrow("A thread never changes place");
  });

  it.each([
    ["itself", "selfie"],
    ["a thread that does not exist", "nowhere"],
  ])("refuses a sub-thread whose parent is %s", async (_, parent) => {
    const db = await freshDatabase();
    expect(() => {
      insertThread(db, "selfie", null, parent);
    }).toThrow("A sub-thread's parent is a main thread");
  });
});

describe("the v2 schema keeps lanes on their own main", () => {
  it("takes a sub-thread's lane on its main, once, and nowhere else", async () => {
    const db = await freshDatabase();
    insertThread(db, "other", "p", null);
    insertThread(db, "kid", null, "main");
    insertLane(db, "main", 0, "l-kid", "kid");
    expect(() => {
      insertLane(db, "other", 0, "l-kid", "kid");
    }).toThrow("A lane sits on a main thread, and a thread lane on its own");
    expect(() => {
      insertLane(db, "main", 1, "l-kid", "kid");
    }).toThrow(/UNIQUE constraint failed/);
    expect(() => {
      insertLane(db, "main", 1, "l-main", "kid");
    }).toThrow(/CHECK constraint failed/);
  });

  it("puts no lane on a sub-thread's canvas, and edits no lane in place", async () => {
    const db = await freshDatabase();
    insertThread(db, "kid", null, "main");
    insertLane(db, "main", 0, "c-1");
    expect(() => {
      insertLane(db, "kid", 0, "c-2");
    }).toThrow("A lane sits on a main thread, and a thread lane on its own");
    expect(() => {
      db.exec("update lanes set seq = 5");
    }).toThrow("Lanes are replaced, never edited");
  });

  it("keeps whether a lane is collapsed as a yes or a no", async () => {
    const db = await freshDatabase();
    insertLane(db, "main", 0, "c-1");
    expect(db.selectValue("select collapsed from lanes")).toBe(0);
    expect(() => {
      db.exec(`insert into lanes (main_id, seq, id, card_json, title, collapsed)
               values ('main', 1, 'c-2', '{}', 'Card', 2)`);
    }).toThrow(/CHECK constraint failed/);
  });
});
