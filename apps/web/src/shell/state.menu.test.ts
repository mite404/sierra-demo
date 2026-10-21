import {
  threadIdSchema,
  type Located,
  type Place,
  type ProjectId,
  type ThreadId,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { awayFrom, onScreen, type ShellState } from "./state";

// What the thread menu reads of the shell's state (ADR-126, ADR-130): the thread on screen,
// and where the page goes when one is deleted.

// The runtime keeps its project id schema to itself; a test id is one cast.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const STORE = "p-1" as ProjectId;
const id = (raw: string): ThreadId => threadIdSchema.parse(raw);
const [PROFIT, REFUNDS, SATURDAY] = ["profit", "refunds", "saturday"].map((raw) => id(raw));
const AT = "2026-09-20T09:00:00.000Z";

function thread(threadId: ThreadId, place: Place): ThreadSummary {
  const marks = { pinnedAt: null, snoozedUntil: null, archivedAt: null };
  return {
    id: threadId,
    title: threadId,
    place,
    createdAt: AT,
    updatedAt: AT,
    preview: "",
    turnCount: 0,
    draft: "",
    ...marks,
  };
}

// Two mains in one project, profit with a child.
const WS: Workspace = {
  projects: [{ id: STORE, name: "Demo store", createdAt: AT }],
  threads: [
    thread(PROFIT, { kind: "main", projectId: STORE }),
    thread(REFUNDS, { kind: "main", projectId: STORE }),
    thread(SATURDAY, { kind: "child", parentId: PROFIT }),
  ],
  lanes: {},
  shell: null,
  notifications: [],
  shares: [],
};

// The title of the thread the phone's menu acts on, or null.
const titleOf = (at: Located | null) => onScreen(WS, at).thread?.title ?? null;

describe("onScreen (ADR-116, ADR-126)", () => {
  it("names the main on screen and its project", () => {
    expect(onScreen(WS, { main: PROFIT, focus: null }).name).toBe("Demo store");
    expect(titleOf({ main: PROFIT, focus: null })).toBe(PROFIT);
  });
  it("acts on the child in focus, under its main's project", () => {
    expect(onScreen(WS, { main: PROFIT, focus: SATURDAY }).name).toBe("Demo store");
    expect(titleOf({ main: PROFIT, focus: SATURDAY })).toBe(SATURDAY);
  });
  it("acts on nothing with nothing on screen, or a thread the workspace lacks", () => {
    expect(onScreen(WS, null)).toEqual({ name: null, thread: null });
    expect(onScreen(WS, { main: id("gone"), focus: null })).toEqual({ name: null, thread: null });
  });
});

describe("awayFrom (ADR-130)", () => {
  const doc: ShellState = { version: 1, tabs: [PROFIT, REFUNDS], views: {}, read: [] };

  it("closes a deleted main's tab and goes to its neighbour, as Close does", () => {
    expect(awayFrom(doc, { main: PROFIT, focus: null }, PROFIT)).toEqual({
      state: { ...doc, tabs: [REFUNDS] },
      next: REFUNDS,
    });
  });
  it("goes from a deleted child to its main, keeping the tabs", () => {
    expect(awayFrom(doc, { main: PROFIT, focus: SATURDAY }, SATURDAY)).toEqual({
      state: doc,
      next: PROFIT,
    });
  });
  it("closes the tab of a deleted main off screen, and stays where it is", () => {
    expect(awayFrom(doc, { main: PROFIT, focus: null }, REFUNDS)).toEqual({
      state: { ...doc, tabs: [PROFIT] },
      next: undefined,
    });
  });
  it("stays put for a deleted thread with no tab and not on screen", () => {
    expect(awayFrom(doc, null, SATURDAY)).toEqual({ state: doc, next: undefined });
  });
});
