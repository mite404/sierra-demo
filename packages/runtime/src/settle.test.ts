import { describe, expect, it } from "vitest";
import { IDLE_MS, PURGE_AFTER_MS, planSettle, type SettleRow } from "./settle";
import { threadIdSchema } from "./workspace";

const DAY = 24 * 60 * 60 * 1000;
const NOW = "2026-10-15T12:00:00.000Z";
const before = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();
const after = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const t = (id: string) => threadIdSchema.parse(id);

// A live main, last touched `touched` ms before now, with nothing on it.
function row(id: string, touched: number, extra: Partial<SettleRow> = {}): SettleRow {
  return {
    id: t(id),
    title: id,
    parentId: null,
    touchedAt: before(touched),
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
    deletedAt: null,
    ...extra,
  };
}

const plan = (
  rows: SettleRow[],
  shares: { id: string; expiresAt: string }[] = [],
  starting = false,
) => planSettle({ rows, shares, now: NOW, starting });

describe("planSettle wakes snoozes", () => {
  it("wakes a snooze that is due, and not one still ahead", () => {
    const due = row("due", DAY, { snoozedUntil: before(1) });
    const ahead = row("ahead", DAY, { snoozedUntil: after(DAY) });
    expect(plan([due, ahead]).wake).toEqual([{ id: "due", title: "due", until: before(1) }]);
  });

  it("leaves a deleted thread's snooze alone", () => {
    const gone = row("gone", DAY, { snoozedUntil: before(1), deletedAt: before(1) });
    expect(plan([gone]).wake).toEqual([]);
  });
});

describe("planSettle archives idle mains (ADR-129)", () => {
  it("archives a main idle for the whole window, and not one touched inside it", () => {
    const idle = row("idle", IDLE_MS);
    const fresh = row("fresh", IDLE_MS - 1);
    expect(plan([idle, fresh]).archive).toEqual(["idle"]);
  });

  it("counts a sub-thread's touch as its main's", () => {
    const main = row("main", 30 * DAY);
    const kid = row("kid", DAY, { parentId: t("main") });
    expect(plan([main, kid]).archive).toEqual([]);
  });

  it.each<[string, Partial<SettleRow>]>([
    ["pinned", { pinnedAt: before(40 * DAY) }],
    ["snoozed", { snoozedUntil: after(DAY) }],
    ["already archived", { archivedAt: before(DAY) }],
    ["deleted", { deletedAt: before(1) }],
  ])("never archives a main that is %s", (_, extra) => {
    expect(plan([row("old", 40 * DAY, extra)]).archive).toEqual([]);
  });

  it("never archives a sub-thread on its own, nor counts a deleted one's touch", () => {
    const main = row("main", 30 * DAY);
    const gone = row("gone", DAY, { parentId: t("main"), deletedAt: before(1) });
    const kid = row("kid", 30 * DAY, { parentId: t("main") });
    expect(plan([main, gone, kid]).archive).toEqual(["main"]);
  });

  it("does not archive a snooze it wakes in the same pass", () => {
    const woken = row("woken", 40 * DAY, { snoozedUntil: before(1) });
    const result = plan([woken]);
    expect(result.wake.map((each) => each.id)).toEqual(["woken"]);
    expect(result.archive).toEqual([]);
  });
});

describe("planSettle purges tombstones (ADR-130)", () => {
  it("purges a tombstone once the undo window and its grace have passed", () => {
    const old = row("old", DAY, { deletedAt: before(PURGE_AFTER_MS) });
    const recent = row("recent", DAY, { deletedAt: before(PURGE_AFTER_MS - 1) });
    expect(plan([old, recent]).purge).toEqual(["old"]);
  });

  it("purges every tombstone at start, since no undo outlives the page that offered it", () => {
    const recent = row("recent", DAY, { deletedAt: before(1) });
    expect(plan([recent], [], true).purge).toEqual(["recent"]);
  });
});

describe("planSettle drops expired shares (ADR-131)", () => {
  it("drops a share at its expiry, and keeps one still live", () => {
    const shares = [
      { id: "s-old", expiresAt: NOW },
      { id: "s-live", expiresAt: after(1) },
    ];
    expect(plan([], shares).expire).toEqual(["s-old"]);
  });
});

describe("planSettle says when to look again", () => {
  it("names the soonest of a snooze, a purge, an expiry and an idle deadline", () => {
    const rows = [
      row("snoozed", DAY, { snoozedUntil: after(3 * DAY) }),
      row("tomb", DAY, { deletedAt: before(1) }),
      row("idle-soon", IDLE_MS - 2 * DAY),
    ];
    const shares = [{ id: "s", expiresAt: after(DAY) }];
    expect(plan(rows, shares).next).toBe(after(PURGE_AFTER_MS - 1));
    expect(plan(rows.slice(2), shares).next).toBe(after(DAY));
    expect(plan(rows.slice(2)).next).toBe(after(2 * DAY));
  });

  it("has nothing to look for in a workspace with nothing pending", () => {
    expect(plan([row("pinned", DAY, { pinnedAt: before(DAY) })]).next).toBeNull();
  });
});
