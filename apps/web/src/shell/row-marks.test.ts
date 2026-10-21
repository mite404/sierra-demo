import { threadIdSchema, type ProjectId, type ThreadSummary } from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { rowLook } from "./row-marks";
import { wakeText } from "./wake-text";

// Friday 2 October 2026 at 9:00 on the machine's clock, as a stored instant.
const WAKE = new Date(2026, 9, 2, 9, 0);
const AT = "2026-09-28T10:00:00.000Z";
// The runtime keeps its project id schema to itself; a test id is one cast.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const PROJECT = "p" as ProjectId;

function thread(marks: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: threadIdSchema.parse("t"),
    title: "Refund audit",
    place: { kind: "main", projectId: PROJECT },
    createdAt: AT,
    updatedAt: AT,
    preview: "",
    turnCount: 0,
    draft: "",
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
    ...marks,
  };
}

describe("rowLook (ADR-127 to ADR-129)", () => {
  it("reads a thread with no marks as it always has", () => {
    expect(rowLook(thread({}))).toEqual({
      ink: "text-soft-ink",
      marks: [],
      spoken: "",
      tooltip: "Refund audit",
      alwaysTip: false,
    });
  });

  it("shows a pin and a clock, says both, and always tells when it wakes", () => {
    const wake = wakeText(WAKE, "row");
    expect(rowLook(thread({ pinnedAt: AT, snoozedUntil: WAKE.toISOString() }))).toEqual({
      ink: "text-soft-ink",
      marks: ["pinned", "snoozed"],
      spoken: `, pinned, snoozed until ${wake}`,
      tooltip: `Refund audit · wakes ${wake}`,
      alwaysTip: true,
    });
  });

  it("dims an archived thread and shows its filebox", () => {
    const look = rowLook(thread({ archivedAt: AT }));
    expect([look.ink, look.marks, look.spoken]).toEqual([
      "text-faint-ink",
      ["archived"],
      ", archived",
    ]);
  });
});
