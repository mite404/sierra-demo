import { describe, expect, it } from "vitest";
import { addChild, at, child, found, main, openStore, other, t } from "./sqliteStore.harness";
import type { Store } from "./store";
import { lanesOf, threadLane } from "./workspace";

// What the sidebar reads of each thread's marks.
const marks = (store: Store) =>
  store.workspace().threads.map(({ id, pinnedAt, snoozedUntil, archivedAt }) => ({
    id,
    pinnedAt,
    snoozedUntil,
    archivedAt,
  }));
const ids = (store: Store) => store.workspace().threads.map((each) => each.id);
const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T10:00:00.000Z`;
const share = (id: string, threadId: string, expiresAt: string) => ({
  id,
  threadId: t(threadId),
  link: `https://kay.example/share.html#t=${id}.key`,
  revokeToken: `revoke-${id}`,
  createdAt: at(30),
  expiresAt,
});

describe("the store keeps marks (ADR-127 to ADR-129)", () => {
  it("pins, snoozes and archives, each by the rules applyMark keeps", async () => {
    const store = await openStore();
    store.mark(main, { pinned: true }, at(10));
    store.mark(other, { snoozedUntil: at(40) }, at(11));
    expect(marks(store)).toEqual([
      { id: "main", pinnedAt: at(10), snoozedUntil: null, archivedAt: null },
      { id: "other", pinnedAt: null, snoozedUntil: at(40), archivedAt: null },
    ]);
    store.mark(main, { archived: true }, at(12));
    expect(marks(store).at(0)).toEqual({
      id: "main",
      pinnedAt: null,
      snoozedUntil: null,
      archivedAt: at(12),
    });
  });

  it("refuses a mark on a thread it does not hold, and a snooze that is not ahead", async () => {
    const store = await openStore();
    expect(() => {
      store.mark(t("missing"), { pinned: true }, at(10));
    }).toThrow("No thread missing");
    expect(() => {
      store.mark(main, { snoozedUntil: at(10) }, at(10));
    }).toThrow("A snooze wakes after now");
  });

  it("keeps a snooze's note in the bell, written with the snooze", async () => {
    const store = await openStore();
    store.mark(other, { snoozedUntil: at(40) }, at(11), { id: "n1", text: "Snoozed “other”" });
    expect(store.workspace().notifications).toEqual([
      { id: "n1", threadId: other, text: "Snoozed “other”", at: at(11) },
    ]);
  });

  it("writes neither the mark nor its note when either is refused", async () => {
    const store = await openStore();
    store.addNotification({ id: "n1", threadId: main, text: "Taken", at: at(5) });
    expect(() => {
      store.mark(other, { snoozedUntil: at(40) }, at(11), { id: "n1", text: "Snoozed" });
    }).toThrow("UNIQUE constraint failed");
    expect(store.workspace().threads.find((each) => each.id === other)?.snoozedUntil).toBeNull();
    expect(() => {
      store.mark(other, { snoozedUntil: at(10) }, at(11), { id: "n2", text: "Snoozed" });
    }).toThrow("A snooze wakes after now");
    expect(store.workspace().notifications.map((each) => each.id)).toEqual(["n1"]);
  });

  it("brings an archived thread and its main back when a message arrives", async () => {
    const store = await openStore();
    addChild(store, "child");
    store.mark(main, { archived: true }, at(10));
    store.changeTranscript(child, (now) => ({ ...now, updatedAt: at(11) }));
    expect(marks(store).find((each) => each.id === "main")?.archivedAt).toBeNull();
  });
});

describe("the store deletes with a tombstone (ADR-130)", () => {
  it("hides a deleted main with its children, lanes, bell and shares at once", async () => {
    const store = await openStore();
    addChild(store, "child", 0);
    store.addNotification({ id: "n1", threadId: child, text: "Done", at: at(5) });
    store.addShare(share("s1", "main", day(2)));
    store.remove(main, at(10));
    const ws = store.workspace();
    expect(ids(store)).toEqual(["other"]);
    expect(ws.lanes).toEqual({ [other]: [] });
    expect(ws.notifications).toEqual([]);
    expect(ws.shares).toEqual([]);
  });

  it("restores a deleted thread exactly as it was, lane included", async () => {
    const store = await openStore();
    addChild(store, "child", 0);
    const before = store.workspace();
    store.remove(child, at(10));
    expect(lanesOf(store.workspace(), main)).toEqual([threadLane(child)]);
    expect(ids(store)).toEqual(["main", "other"]);
    store.restore(child, at(11));
    expect(store.workspace()).toEqual(before);
  });

  it("refuses to delete what is gone, and to restore what was never deleted", async () => {
    const store = await openStore();
    store.remove(other, at(10));
    expect(() => {
      store.remove(other, at(11));
    }).toThrow("No thread other");
    expect(() => {
      store.restore(main, at(11));
    }).toThrow("main is not deleted");
  });
});

describe("the store purges a tombstone (ADR-130)", () => {
  it("purges a tombstone for good once its window has passed, sub-threads and all", async () => {
    const store = await openStore();
    addChild(store, "child", 0);
    store.addNotification({ id: "n1", threadId: child, text: "Done", at: at(5) });
    store.addShare(share("s1", "child", day(2)));
    store.remove(main, at(10));
    // The page offers Undo for ten seconds; the tombstone keeps five more for one in flight.
    store.settle("2026-09-26T10:10:14.999Z", false);
    expect(store.transcript(main)).toBeDefined();
    store.settle("2026-09-26T10:10:15.000Z", false);
    expect(store.transcript(main)).toBeUndefined();
    expect(store.transcript(child)).toBeUndefined();
    expect(found(store, "Saturday")).toEqual([]);
    expect(() => {
      store.restore(main, at(13));
    }).toThrow("main is not deleted");
  });
});

describe("the store settles (ADR-128, ADR-129, ADR-131)", () => {
  it("wakes a due snooze with a note for the bell, and restarts its idle clock", async () => {
    const store = await openStore();
    store.mark(other, { snoozedUntil: day(2) }, at(10));
    expect(store.settle(day(1), false)).toEqual({ changed: false, next: day(2) });
    expect(store.settle(day(2), false).changed).toBe(true);
    expect(marks(store).find((each) => each.id === "other")?.snoozedUntil).toBeNull();
    expect(store.workspace().notifications).toEqual([
      { id: `wake-other-${day(2)}`, threadId: other, text: "Back from snooze: other", at: day(2) },
    ]);
    expect(store.settle(day(15), false).changed).toBe(true);
    expect(marks(store).find((each) => each.id === "other")?.archivedAt).toBeNull();
  });

  it("archives a main left alone for fourteen days, and not a pinned one", async () => {
    const store = await openStore();
    store.mark(main, { pinned: true }, at(10));
    // `other` was last touched at 10:02 on the 26th: fourteen days on, it settles.
    expect(store.settle("2026-10-10T10:01:59.000Z", false).changed).toBe(false);
    expect(store.settle("2026-10-10T10:02:00.000Z", false).changed).toBe(true);
    expect(marks(store).map((each) => [each.id, each.archivedAt])).toEqual([
      ["main", null],
      ["other", "2026-10-10T10:02:00.000Z"],
    ]);
  });

  it("keeps a thread unarchived by hand out of the archive for another fourteen days", async () => {
    const store = await openStore();
    store.settle(day(20), false);
    store.mark(other, { archived: false }, day(21));
    store.settle(day(22), false);
    expect(marks(store).find((each) => each.id === "other")?.archivedAt).toBeNull();
  });

  it("drops a share once it expires, and changes nothing on a pass with nothing due", async () => {
    const store = await openStore();
    store.addShare(share("s1", "main", at(40)));
    expect(store.workspace().shares.map((each) => each.id)).toEqual(["s1"]);
    expect(store.settle(at(39), false)).toEqual({ changed: false, next: at(40) });
    store.settle(at(40), false);
    expect(store.workspace().shares).toEqual([]);
  });
});

describe("the store keeps shares (ADR-131)", () => {
  it("lists shares newest first, forgets one, and refuses one for a thread it lacks", async () => {
    const store = await openStore();
    store.addShare(share("s1", "main", day(2)));
    store.addShare({ ...share("s2", "other", day(3)), createdAt: at(31) });
    expect(store.workspace().shares.map((each) => each.id)).toEqual(["s2", "s1"]);
    store.removeShare("s2");
    expect(store.workspace().shares.map((each) => each.id)).toEqual(["s1"]);
    expect(() => {
      store.addShare(share("s3", "missing", day(2)));
    }).toThrow(/FOREIGN KEY/);
  });
});
