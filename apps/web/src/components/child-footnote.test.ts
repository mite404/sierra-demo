import {
  threadIdSchema,
  type Place,
  type ProjectId,
  type RuntimeState,
  type Source,
  type ThreadSummary,
} from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { belongsTo } from "./child-footnote";

const AT = "2026-09-20T09:00:00.000Z";
const BRIEF = threadIdSchema.parse("demo-brief");
const CHILD = threadIdSchema.parse("demo-brief-workload");
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const DEMO = "demo" as ProjectId;
// `belongsTo` never reads the source, so the fixture is an empty shell cast to shape.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture shell belongsTo never reads
const SOURCE = {} as Source;

function thread(id: ThreadSummary["id"], title: string, place: Place): ThreadSummary {
  return {
    id,
    title,
    place,
    createdAt: AT,
    updatedAt: AT,
    preview: "",
    turnCount: 0,
    draft: "",
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
  };
}

const brief = thread(BRIEF, "Weekly brief", { kind: "main", projectId: DEMO });
const child = thread(CHILD, "Weekly workload", { kind: "child", parentId: BRIEF });

function ready(threads: ThreadSummary[]): RuntimeState {
  return {
    kind: "ready",
    source: SOURCE,
    workspace: { projects: [], threads, lanes: {}, shell: null, notifications: [], shares: [] },
    replying: [],
  };
}

describe("belongsTo", () => {
  it("names the parent a child belongs to", () => {
    expect(belongsTo(ready([brief, child]), child)).toBe("Belongs to Weekly brief");
  });

  it("says parent thread while the parent is not in the workspace", () => {
    expect(belongsTo(ready([child]), child)).toBe("Belongs to parent thread");
    expect(belongsTo({ kind: "starting", source: null }, child)).toBe("Belongs to parent thread");
  });
});
