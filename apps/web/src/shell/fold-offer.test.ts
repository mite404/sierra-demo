import { newCardLaneId, threadIdSchema, type ProjectId, type Workspace } from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { firstRun, foldOffer, setPane, type ShellState } from "./state";

// The runtime keeps its project id schema to itself; a test id is one cast.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const STORE = "p-1" as ProjectId;
const PROFIT = threadIdSchema.parse("profit");
const AT = "2026-09-20T09:00:00.000Z";

// One main thread, its canvas holding card lanes collapsed as `collapsed` says.
function withLanes(collapsed: boolean[]): Workspace {
  return {
    projects: [{ id: STORE, name: "Demo store", createdAt: AT }],
    threads: [
      {
        id: PROFIT,
        title: "Profit",
        place: { kind: "main", projectId: STORE },
        createdAt: AT,
        updatedAt: AT,
        preview: "",
        turnCount: 0,
        draft: "",
        pinnedAt: null,
        snoozedUntil: null,
        archivedAt: null,
      },
    ],
    lanes: {
      [PROFIT]: collapsed.map((each) => ({
        id: newCardLaneId(),
        width: null,
        collapsed: each,
        kind: "card",
        card: { v: 1, kind: "catalog", payload: {} },
        title: "Card",
      })),
    },
    shell: null,
    notifications: [],
    shares: [],
  };
}

describe("foldOffer", () => {
  const onProfit = { main: PROFIT, focus: null };
  const beside = (pane: "thread" | "canvas"): ShellState =>
    setPane(firstRun(withLanes([])), PROFIT, pane);

  it.each([
    ["collapse while any lane is open", [false, true], true],
    ["expand once every lane is collapsed", [true, true], false],
  ])("offers to %s", (_, collapsed, collapse) => {
    expect(foldOffer(withLanes(collapsed), beside("canvas"), onProfit)).toEqual({
      main: PROFIT,
      collapse,
    });
  });

  it("offers nothing with the canvas off screen, no lanes on it, or no thread on screen", () => {
    expect(foldOffer(withLanes([false]), beside("thread"), onProfit)).toBeNull();
    expect(foldOffer(withLanes([]), beside("canvas"), onProfit)).toBeNull();
    expect(foldOffer(withLanes([false]), beside("canvas"), null)).toBeNull();
  });
});
