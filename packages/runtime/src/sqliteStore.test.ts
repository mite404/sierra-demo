import type { Database } from "@sqlite.org/sqlite-wasm";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { openDatabase, openSqliteStore } from "./sqliteStore";
import {
  addChild,
  at,
  card,
  child,
  found,
  main,
  openEmpty,
  openStore,
  other,
  store1,
  t,
  thread,
  turns,
} from "./sqliteStore.harness";
import { ensureStarter } from "./store";
import { lanesOf, threadLane } from "./workspace";

// A reply that showed its work and broke off on a question, and the answer to it.
const structured: ThreadMessage[] = [
  {
    id: "a2",
    role: "agent",
    text: "Saturday leads the week. See the orders",
    time: "10:03",
    streaming: false,
    blocks: [
      { kind: "heading", content: [{ kind: "run", text: "Saturday", mark: "strong" }] },
      {
        kind: "paragraph",
        content: [
          { kind: "run", text: " leads the week. " },
          { kind: "link", text: "See the orders", href: "https://kay.example/orders" },
        ],
      },
      { kind: "list", items: [[{ kind: "run", text: "Gross", mark: "em" }], []] },
      { kind: "card", payload: { component: "BarChart", props: { title: "Profit" } } },
    ],
    work: {
      steps: [
        {
          id: "orders",
          label: "Pull the orders",
          status: "done",
          outcome: "412 orders",
          evidence: { rows: 412 },
          threadId: "t-001",
        },
        { id: "costs", label: "Subtract costs", status: "cancelled" },
      ],
      logs: ["GET /orders 200"],
      narration: ["Pulling the orders."],
      summary: "Checked the orders",
    },
    ended: "interrupted",
    failure: { title: "Reply interrupted", detail: "The sales system stopped answering." },
    asks: { question: "Which week?", options: [{ label: "The week before" }] },
  },
  { id: "u3", role: "user", text: "The week before", time: "10:04", question: "Which week?" },
];

describe("the store keeps threads", () => {
  it("starts empty", async () => {
    const store = await openEmpty();
    expect(store.workspace()).toEqual({
      projects: [],
      threads: [],
      lanes: {},
      shell: null,
      notifications: [],
      shares: [],
    });
  });

  it("reads back a thread's turns, cards, chips and files, and lists it with its preview", async () => {
    const store = await openStore();
    expect(store.transcript(main)).toEqual({ messages: turns, draft: "", updatedAt: at(1) });
    expect(store.workspace().threads.at(0)).toMatchObject({
      id: "main",
      place: { kind: "main", projectId: "store" },
      preview: "Why is Saturday so high?",
    });
    expect(store.transcript(t("missing"))).toBeUndefined();
  });

  it("rewrites a transcript from what it is now, and refuses an unknown thread", async () => {
    const store = await openStore();
    store.changeTranscript(main, (now) => ({
      ...now,
      messages: now.messages.slice(0, 1),
      draft: "Hi",
      updatedAt: at(9),
    }));
    expect(store.transcript(main)).toEqual({
      messages: turns.slice(0, 1),
      draft: "Hi",
      updatedAt: at(9),
    });
    expect(() => {
      store.changeTranscript(t("missing"), (now) => now);
    }).toThrow("No thread missing");
  });
});

describe("the store keeps a structured turn (ADR-147)", () => {
  it("reads back a reply's structure, work, ending and question, and the answer to it", async () => {
    const store = await openStore();
    store.changeTranscript(main, (now) => ({ ...now, messages: [...now.messages, ...structured] }));
    expect(store.transcript(main)?.messages).toEqual([...turns, ...structured]);
  });
});

describe("the store counts turns", () => {
  it("lists how many turns each thread holds, 0 for one that has none", async () => {
    const store = await openStore();
    addChild(store, "child");
    const counts = () =>
      Object.fromEntries(store.workspace().threads.map((each) => [each.id, each.turnCount]));
    expect(counts()).toEqual({ main: turns.length, other: 1, child: 0 });
    store.changeTranscript(child, (now) => ({ ...now, messages: turns.slice(0, 1) }));
    expect(counts()).toEqual({ main: turns.length, other: 1, child: 1 });
  });
});

describe("the store renames", () => {
  it("renames a project and a thread, and refuses one it does not hold", async () => {
    const store = await openStore();
    store.rename({ kind: "project", id: store1 }, "Corner shop");
    store.rename({ kind: "thread", id: main }, "Weekend margins");
    const { projects, threads } = store.workspace();
    expect(projects.map((project) => project.name)).toEqual(["Corner shop"]);
    expect(threads.map((each) => each.title)).toEqual(["Weekend margins", "other"]);
    expect(() => {
      store.rename({ kind: "thread", id: t("missing") }, "x");
    }).toThrow("No thread missing");
  });
});

describe("the store keeps lanes", () => {
  it("puts a new child's lane where it was dropped, in the same write", async () => {
    const store = await openStore();
    addChild(store, "child", 0);
    addChild(store, "second", 0);
    addChild(store, "closed");
    expect(lanesOf(store.workspace(), main).map((lane) => lane.id)).toEqual([
      "l-second",
      "l-child",
    ]);
  });

  it("sets a canvas to exactly the lanes it is given, the same on a second run", async () => {
    const store = await openStore();
    addChild(store, "child");
    store.arrange(main, [card, threadLane(child)]);
    const once = store.workspace();
    store.arrange(main, [card, threadLane(child)]);
    expect(store.workspace()).toEqual(once);
    expect(once.lanes).toEqual({ [main]: [card, threadLane(child)], [other]: [] });
  });

  it("refuses a canvas for a sub-thread, an unknown thread, or another main's child", async () => {
    const store = await openStore();
    addChild(store, "child");
    expect(() => {
      store.arrange(child, []);
    }).toThrow("child is a sub-thread, so it has no canvas");
    expect(() => {
      store.arrange(t("missing"), []);
    }).toThrow("No thread missing");
    expect(() => {
      store.arrange(other, [threadLane(child)]);
    }).toThrow("a thread lane on its own");
    expect(store.workspace().lanes[other]).toEqual([]);
  });

  it("gives a main thread no lane of its own", async () => {
    const store = await openStore();
    expect(() => {
      store.addThread(thread("third", { kind: "main", projectId: store1 }, 4), 0);
    }).toThrow("third is a main thread, so it has no lane");
    expect(store.workspace().threads.map((each) => each.id)).toEqual(["main", "other"]);
  });
});

describe("the store keeps a collapsed lane (ADR-133)", () => {
  it("keeps a collapsed lane collapsed, at its width, in a store opened on the same file", async () => {
    const store = await openStore();
    addChild(store, "child");
    const lanes = [
      { ...card, collapsed: true },
      { ...threadLane(child), collapsed: true },
    ];
    store.arrange(main, lanes);
    expect(lanesOf(store.workspace(), main)).toEqual(lanes);
    store.arrange(main, [card, threadLane(child)]);
    expect(lanesOf(store.workspace(), main).map((lane) => lane.collapsed)).toEqual([false, false]);
  });
});

describe("the store keeps the shell and the bell", () => {
  it("keeps the latest shell whole", async () => {
    const store = await openStore();
    store.saveShell({ version: 1, tabs: ["main"] });
    store.saveShell({ version: 1, tabs: ["other", "main"], read: [] });
    expect(store.workspace().shell).toEqual({ version: 1, tabs: ["other", "main"], read: [] });
  });

  it("lists notifications newest first", async () => {
    const store = await openStore();
    store.addNotification({ id: "n1", threadId: main, text: "Older", at: at(5) });
    store.addNotification({ id: "n2", threadId: other, text: "Newer", at: at(6) });
    expect(store.workspace().notifications.map((each) => each.id)).toEqual(["n2", "n1"]);
  });
});

describe("the store searches", () => {
  it("finds a word in a message, and not a word that is in none", async () => {
    const store = await openStore();
    expect(found(store, "Saturday")).toEqual(["main"]);
    expect(found(store, "forecast")).toEqual([]);
    expect(found(store, "")).toEqual([]);
  });

  it("matches words as prefixes, ignoring case and accents", async () => {
    const store = await openStore();
    expect(found(store, "SATUR")).toEqual(["main"]);
    expect(found(store, "cafe desk")).toEqual(["other"]);
    expect(found(store, "cafe saturday")).toEqual([]);
  });

  it("lists hits newest first, and stops finding a message once it is gone", async () => {
    const store = await openStore();
    store.changeTranscript(other, (now) => ({ ...now, messages: turns, updatedAt: at(8) }));
    expect(found(store, "saturday")).toEqual(["other", "main"]);
    store.changeTranscript(main, (now) => ({ ...now, messages: now.messages.slice(0, 2) }));
    expect(found(store, "saturday")).toEqual(["other"]);
  });
});

describe("ensureStarter", () => {
  it("gives an empty device the Live Playground and its one empty thread, once", async () => {
    const store = await openEmpty();
    ensureStarter(store, at(0));
    const once = store.workspace();
    ensureStarter(store, at(5));
    expect(store.workspace()).toEqual(once);
    expect(once.projects).toEqual([
      { id: "live-playground", name: "Live Playground", createdAt: at(0) },
    ]);
    expect(once.threads).toEqual([
      expect.objectContaining({
        id: "playground",
        title: "New thread",
        place: { kind: "main", projectId: "live-playground" },
        turnCount: 0,
      }),
    ]);
    expect(store.transcript(t("playground"))?.messages).toEqual([]);
  });

  it("adds the Live Playground to a store from before it, keeping what the store holds", async () => {
    const store = await openStore();
    const before = store.workspace();
    ensureStarter(store, at(5));
    const after = store.workspace();
    expect(after.projects).toEqual([
      ...before.projects,
      { id: "live-playground", name: "Live Playground", createdAt: at(5) },
    ]);
    expect(after.threads.map((each) => each.id)).toEqual(
      expect.arrayContaining([...before.threads.map((each) => each.id), "playground"]),
    );
    expect(after.threads).toHaveLength(before.threads.length + 1);
    ensureStarter(store, at(9));
    expect(store.workspace()).toEqual(after);
  });
});

describe("the store opens", () => {
  it("closes the database when it cannot bring it up to date", async () => {
    const probe = await openDatabase({ kind: "memory" });
    probe.close();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every database shares it
    const prototype = Object.getPrototypeOf(probe) as Database;
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    vi.spyOn(prototype, "selectValue").mockReturnValueOnce(99); // migrate reads user_version first
    const close = vi.spyOn(prototype, "close");
    await expect(openSqliteStore({ kind: "memory" })).rejects.toThrow("newer than this build");
    expect(close).toHaveBeenCalledOnce();
  });
});
