import { describe, expect, it } from "vitest";
import { applyMark, type ThreadMark } from "./marks";
import { projectIdSchema, threadIdSchema, type ThreadSummary } from "./workspace";

const at = (time: string) => `2026-09-21T${time}:00.000Z`;
const now = at("12:00");
const base: ThreadSummary = {
  id: threadIdSchema.parse("m2"),
  title: "m2",
  place: { kind: "main", projectId: projectIdSchema.parse("store") },
  createdAt: at("09:02"),
  updatedAt: at("09:02"),
  preview: "",
  turnCount: 0,
  draft: "",
  pinnedAt: null,
  snoozedUntil: null,
  archivedAt: null,
};
const pinned = { ...base, pinnedAt: at("10:00") };
const snoozed = { ...base, snoozedUntil: at("13:00") };
const archived = { ...base, archivedAt: at("10:00") };

// Each case: what it shows, the thread before, the change, and the fields that change.
const CASES: [string, ThreadSummary, ThreadMark, Partial<ThreadSummary>][] = [
  ["pins, stamped now", base, { pinned: true }, { pinnedAt: now }],
  ["keeps the first pin's stamp when pinned again", pinned, { pinned: true }, {}],
  ["unpins", pinned, { pinned: false }, { pinnedAt: null }],
  ["snoozes until a later instant", base, { snoozedUntil: at("13:00") }, snoozed],
  ["wakes early", snoozed, { snoozedUntil: null }, { snoozedUntil: null }],
  ["archives, stamped now", base, { archived: true }, { archivedAt: now }],
  ["unarchives", archived, { archived: false }, { archivedAt: null }],
  [
    "clears the pin and the snooze when archiving: an archived thread is done",
    { ...pinned, snoozedUntil: at("13:00") },
    { archived: true },
    { archivedAt: now, pinnedAt: null, snoozedUntil: null },
  ],
  [
    "brings an archived thread back when it is pinned",
    archived,
    { pinned: true },
    { archivedAt: null, pinnedAt: now },
  ],
  [
    "brings an archived thread back when it is snoozed",
    archived,
    { snoozedUntil: at("13:00") },
    { archivedAt: null, snoozedUntil: at("13:00") },
  ],
];

describe("applyMark (ADR-127 to ADR-129)", () => {
  it.each(CASES)("%s", (_, before, change, expected) => {
    expect(applyMark(before, change, now)).toEqual({ ...before, ...expected });
  });

  it("refuses a snooze that wakes at or before now", () => {
    expect(() => applyMark(base, { snoozedUntil: now }, now)).toThrow("A snooze wakes after now");
  });
});
