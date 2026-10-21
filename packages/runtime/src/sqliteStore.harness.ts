import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { onTestFinished } from "vitest";
import { openSqliteStore } from "./sqliteStore";
import type { NewThread, Store } from "./store";
import { netProfitChoice, profitThread } from "./testing";
import { laneIdSchema, projectIdSchema, threadIdSchema, type Lane, type Place } from "./workspace";

// What the store's tests share: a clock, ids, a store with two mains, and ways to add to it.

/** 10:mm UTC on the 26th, the minute the fixture's writes are stamped with. */
export const at = (minute: number) => `2026-09-26T10:${String(minute).padStart(2, "0")}:00.000Z`;
/** A thread id. */
export const t = (id: string) => threadIdSchema.parse(id);
/** The fixture's one project. */
export const store1 = projectIdSchema.parse("store");
/** The two mains, and the child a test may add under `main`. */
export const [main, child, other] = [t("main"), t("child"), t("other")];

// The profit thread plus the user's next turn, which carries a card choice and a file.
/** The profit turns and the user's next one. */
export const turns: ThreadMessage[] = [
  ...profitThread.messages,
  {
    id: "u2",
    role: "user",
    text: "Why is Saturday so high?",
    time: "10:03",
    attachments: [netProfitChoice],
    files: [{ id: "u2-f1", label: "till-roll.png" }],
  },
];
// The service desk's opening turn.
const trendTurns: ThreadMessage[] = [
  { id: "u1", role: "user", text: "How did the café's service desk do?", time: "9:02" },
];
/** A card lane opened large. */
export const card: Lane = {
  id: laneIdSchema.parse("c-1"),
  width: 420,
  collapsed: false,
  kind: "card",
  card: { v: 1, kind: "interactive", payload: { title: "Profit" } },
  title: "Last week's profit",
};

/** A thread as it is first written, stamped at `minute`. */
export function thread(id: string, place: Place, minute: number, messages: ThreadMessage[] = []) {
  const stamp = at(minute);
  const fresh: NewThread = {
    id: t(id),
    title: id,
    place,
    createdAt: stamp,
    updatedAt: stamp,
    draft: "",
    messages,
  };
  return fresh;
}

/** A fresh, empty in-memory store, closed when the test ends. */
export async function openEmpty(): Promise<Store> {
  const store = await openSqliteStore({ kind: "memory" });
  onTestFinished(() => {
    store.close();
  });
  return store;
}

/**
 * A fresh store holding one project with two mains, "main" (the profit turns) and "other"
 * (the service desk's).
 */
export async function openStore(): Promise<Store> {
  const store = await openEmpty();
  store.addProject({ id: store1, name: "Demo store", createdAt: at(0) });
  store.addThread(thread("main", { kind: "main", projectId: store1 }, 1, turns));
  store.addThread(thread("other", { kind: "main", projectId: store1 }, 2, trendTurns));
  return store;
}

/** Adds a child of `main`, its lane at `laneAt` when given. */
export const addChild = (store: Store, id: string, laneAt?: number) => {
  store.addThread(thread(id, { kind: "child", parentId: main }, 3), laneAt);
};
/** The ids of the threads a search finds, newest first. */
export const found = (store: Store, query: string) => store.search(query).map((each) => each.id);
