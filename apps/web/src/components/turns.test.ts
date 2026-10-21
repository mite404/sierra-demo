import { threadIdSchema, type ProjectId, type ThreadSummary } from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { LOADING, turnsBefore } from "./turns";

const AT = "2026-09-20T09:00:00.000Z";
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const STORE = "p-1" as ProjectId;

// A main thread in the snapshot, holding `turnCount` turns.
function thread(turnCount: number): ThreadSummary {
  return {
    id: threadIdSchema.parse("t-1"),
    title: "New thread",
    place: { kind: "main", projectId: STORE },
    createdAt: AT,
    updatedAt: AT,
    preview: "",
    turnCount,
    draft: "",
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
  };
}

describe("what a thread shows before it asks the worker", () => {
  it("opens a thread that holds no turns at once, empty", () => {
    expect(turnsBefore(thread(0))).toEqual({ kind: "open", messages: [] });
  });

  it("waits for the turns of a thread that holds some", () => {
    expect(turnsBefore(thread(1))).toBe(LOADING);
    expect(turnsBefore(thread(12))).toBe(LOADING);
  });
});
