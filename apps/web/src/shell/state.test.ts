import {
  threadIdSchema,
  type Place,
  type ProjectId,
  type ThreadId,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { pageAddressSchema, START_PAGE } from "./browser";
import {
  badgeText,
  browse,
  closeTab,
  entryOf,
  firstRun,
  leavesChild,
  markRead,
  parseShell,
  prune,
  resume,
  setPane,
  setSplit,
  stepBrowser,
  unreadCount,
  unsaved,
  viewOf,
  visit,
  type BrowserState,
  type ShellState,
} from "./state";

// The runtime keeps its project id schema to itself; a test id is one cast.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const STORE = "p-1" as ProjectId;
const id = (raw: string): ThreadId => threadIdSchema.parse(raw);
const [PROFIT, REFUNDS, TREND, SATURDAY] = ["profit", "refunds", "trend", "saturday"].map((raw) =>
  id(raw),
);
const RADAR = pageAddressSchema.parse("https://weather.example/radar");
const DOCS = pageAddressSchema.parse("https://docs.example/kay");

function thread(threadId: ThreadId, place: Place, updatedAt: string): ThreadSummary {
  const createdAt = "2026-09-20T09:00:00.000Z";
  const marks = { pinnedAt: null, snoozedUntil: null, archivedAt: null };
  return {
    id: threadId,
    title: threadId,
    place,
    createdAt,
    updatedAt,
    preview: "",
    turnCount: 0,
    draft: "",
    ...marks,
  };
}

// Three mains, the profit one with a child whose reply is the newest thing in the workspace.
const WS: Workspace = {
  projects: [{ id: STORE, name: "Demo store", createdAt: "2026-09-20T09:00:00.000Z" }],
  threads: [
    thread(PROFIT, { kind: "main", projectId: STORE }, "2026-09-21T10:00:00.000Z"),
    thread(REFUNDS, { kind: "main", projectId: STORE }, "2026-09-21T12:00:00.000Z"),
    thread(TREND, { kind: "main", projectId: STORE }, "2026-09-21T11:00:00.000Z"),
    thread(SATURDAY, { kind: "child", parentId: PROFIT }, "2026-09-21T13:00:00.000Z"),
  ],
  lanes: {},
  shell: null,
  notifications: [
    { id: "n-1", threadId: REFUNDS, text: "Needs you", at: "2026-09-21T12:00:00.000Z" },
    { id: "n-2", threadId: TREND, text: "Ready", at: "2026-09-21T11:00:00.000Z" },
  ],
  shares: [],
};

const OPEN: ShellState = { version: 1, tabs: [PROFIT, REFUNDS, TREND], views: {}, read: [] };

describe("firstRun", () => {
  it("opens the main with the newest activity, children counted, on the thread pane", () => {
    const state = firstRun(WS);
    expect(state.tabs).toEqual([PROFIT]);
    expect(viewOf(state, PROFIT).pane).toBe("thread");
    expect(state.views).toHaveProperty(PROFIT);
  });
  it("opens nothing in an empty workspace", () => {
    expect(firstRun({ ...WS, threads: [] }).tabs).toEqual([]);
  });
});

describe("parseShell", () => {
  it("falls back to firstRun when nothing was saved or the document is malformed", () => {
    expect(parseShell(null, WS)).toEqual(firstRun(WS));
    expect(parseShell({ version: 2, tabs: [] }, WS)).toEqual(firstRun(WS));
    const badPage = { ...OPEN, views: { profit: { pane: "browser", split: 52, browser: {} } } };
    expect(parseShell(badPage, WS)).toEqual(firstRun(WS));
    expect(parseShell({ ...OPEN, views: { profit: { pane: "canvas", split: 5 } } }, WS)).toEqual(
      firstRun(WS),
    );
  });
  it("reads the demo's saved shell, both browser addresses included", () => {
    const saved = {
      version: 1,
      tabs: ["profit", "trend"],
      views: {
        trend: {
          pane: "browser",
          split: 52,
          browser: { back: ["https://start.example/"], current: RADAR, forward: [] },
        },
      },
      read: [],
    };
    const state = parseShell(saved, WS);
    expect(state.tabs).toEqual([PROFIT, TREND]);
    expect(viewOf(state, TREND).browser).toEqual({
      back: [START_PAGE],
      current: RADAR,
      forward: [],
    });
  });
});

describe("prune", () => {
  it("drops gone, repeated and child tabs, views of gone threads, and stale read marks", () => {
    const stale = {
      ...OPEN,
      tabs: [PROFIT, id("gone"), PROFIT, SATURDAY, TREND],
      views: { [id("gone")]: viewOf(OPEN, PROFIT), [TREND]: viewOf(OPEN, TREND) },
      read: ["n-1", "n-9"],
    };
    expect(prune(stale, WS)).toEqual({
      version: 1,
      tabs: [PROFIT, TREND],
      views: { [TREND]: viewOf(OPEN, TREND) },
      read: ["n-1"],
    });
  });
  it("returns the same document when nothing is gone", () => {
    expect(prune(OPEN, WS)).toBe(OPEN);
  });
});

describe("visit", () => {
  it("appends a main's tab once and changes nothing the second time", () => {
    const empty: ShellState = { ...OPEN, tabs: [] };
    const once = visit(empty, { main: REFUNDS, focus: null });
    expect(once.tabs).toEqual([REFUNDS]);
    expect(visit(once, { main: REFUNDS, focus: null })).toBe(once);
  });
  it("opens a child on its main's canvas, even when the main was on the browser", () => {
    const onBrowser = setPane(OPEN, PROFIT, "browser");
    const shown = visit(onBrowser, { main: PROFIT, focus: SATURDAY });
    expect(viewOf(shown, PROFIT).pane).toBe("canvas");
    expect(visit(shown, { main: PROFIT, focus: SATURDAY })).toBe(shown);
  });
  it("leaves a main's own pane alone", () => {
    const onBrowser = setPane(OPEN, PROFIT, "browser");
    expect(visit(onBrowser, { main: PROFIT, focus: null })).toBe(onBrowser);
  });
});

describe("closeTab", () => {
  it("gives way to the right neighbour, else the left, else home", () => {
    expect(closeTab(OPEN, REFUNDS).next).toBe(TREND);
    expect(closeTab(OPEN, TREND).next).toBe(REFUNDS);
    expect(closeTab(OPEN, PROFIT).next).toBe(REFUNDS);
    expect(closeTab({ ...OPEN, tabs: [PROFIT] }, PROFIT).next).toBeNull();
  });
  it("keeps the closed tab's view for when it opens again", () => {
    const onBrowser = setPane(OPEN, TREND, "browser");
    const { state } = closeTab(onBrowser, TREND);
    expect(state.tabs).toEqual([PROFIT, REFUNDS]);
    expect(viewOf(visit(state, { main: TREND, focus: null }), TREND).pane).toBe("browser");
  });
  it("changes nothing for a tab that is not open", () => {
    expect(closeTab(OPEN, id("gone"))).toEqual({ state: OPEN, next: null });
  });
});

describe("setPane and setSplit", () => {
  it("keeps the pane, and the same document when it is already shown", () => {
    const canvas = setPane(OPEN, TREND, "canvas");
    expect(viewOf(canvas, TREND).pane).toBe("canvas");
    expect(setPane(canvas, TREND, "canvas")).toBe(canvas);
  });
  it("keeps the split within the thread pane's floor and ceiling", () => {
    expect(viewOf(setSplit(OPEN, PROFIT, 10), PROFIT).split).toBe(28);
    expect(viewOf(setSplit(OPEN, PROFIT, 95), PROFIT).split).toBe(80);
    expect(viewOf(setSplit(OPEN, PROFIT, 61.5), PROFIT).split).toBe(61.5);
  });
  it("leaves a child's address only when its own main turns off the canvas", () => {
    const onChild = { main: PROFIT, focus: SATURDAY };
    expect(leavesChild(onChild, PROFIT, "thread")).toBe(true);
    expect(leavesChild(onChild, PROFIT, "browser")).toBe(true);
    expect(leavesChild(onChild, PROFIT, "canvas")).toBe(false);
    expect(leavesChild(onChild, TREND, "thread")).toBe(false);
    expect(leavesChild({ main: PROFIT, focus: null }, PROFIT, "thread")).toBe(false);
    expect(leavesChild(null, PROFIT, "thread")).toBe(false);
  });
});

describe("unsaved", () => {
  it("asks for a save only when the workspace holds a different document", () => {
    expect(unsaved(OPEN, WS)).toBe(OPEN);
    expect(unsaved(OPEN, { ...WS, shell: structuredClone(OPEN) })).toBeNull();
    expect(unsaved(null, WS)).toBeNull();
    expect(unsaved(OPEN, null)).toBeNull();
  });
});

describe("stepBrowser", () => {
  const fresh: BrowserState = { back: [], current: START_PAGE, forward: [] };
  it("goes forward in history and back again", () => {
    const radar = stepBrowser(fresh, { kind: "go", to: RADAR });
    expect(radar).toEqual({ back: [START_PAGE], current: RADAR, forward: [] });
    const backAgain = stepBrowser(radar, { kind: "back" });
    expect(backAgain).toEqual({ back: [], current: START_PAGE, forward: [RADAR] });
    expect(stepBrowser(backAgain, { kind: "forward" })).toEqual(radar);
  });
  it("clears forward on a new page, and ignores going where it already is", () => {
    const back = { back: [], current: START_PAGE, forward: [RADAR] };
    expect(stepBrowser(back, { kind: "go", to: DOCS }).forward).toEqual([]);
    expect(stepBrowser(back, { kind: "go", to: START_PAGE })).toBe(back);
  });
  it("stays put at either end", () => {
    expect(stepBrowser(fresh, { kind: "back" })).toBe(fresh);
    expect(stepBrowser(fresh, { kind: "forward" })).toBe(fresh);
  });
  it("keeps at most fifty pages behind", () => {
    let state = fresh;
    for (let i = 0; i < 60; i++) {
      const to = pageAddressSchema.parse(`https://p${i}.example/`);
      state = stepBrowser(state, { kind: "go", to });
    }
    expect(state.back).toHaveLength(50);
    expect(state.back[0]).toBe("https://p9.example/");
  });
  it("steps one main thread's browser in the document", () => {
    const went = browse(OPEN, TREND, { kind: "go", to: RADAR });
    expect(viewOf(went, TREND).browser.current).toBe(RADAR);
    expect(viewOf(went, PROFIT).browser.current).toBe(START_PAGE);
    expect(browse(OPEN, TREND, { kind: "back" })).toBe(OPEN);
  });
});

describe("the bell", () => {
  it("counts what has not been read, and marks each id once", () => {
    expect(unreadCount(OPEN, WS)).toBe(2);
    const read = markRead(OPEN, ["n-1"]);
    expect(unreadCount(read, WS)).toBe(1);
    expect(markRead(read, ["n-1"])).toBe(read);
  });
  it("caps the badge at 9+ and shows none at zero", () => {
    expect([0, 1, 9, 10, 12].map((n) => badgeText(n))).toEqual([null, "1", "9", "9+", "9+"]);
  });
});

describe("entryOf", () => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
  const [LIVE, EMPTY] = ["p-2", "p-3"] as ProjectId[];
  const PLAYGROUND = id("playground");
  const two: Workspace = {
    ...WS,
    projects: [
      ...WS.projects,
      { id: LIVE, name: "Live Playground", createdAt: "2026-09-22T09:00:00.000Z" },
      { id: EMPTY, name: "Empty", createdAt: "2026-09-22T09:00:00.000Z" },
    ],
    threads: [
      ...WS.threads,
      thread(PLAYGROUND, { kind: "main", projectId: LIVE }, "2026-09-22T09:00:00.000Z"),
    ],
  };
  it("opens a project on its main with the newest activity, a child's reply included", () => {
    expect(entryOf(two, STORE)).toBe(PROFIT);
    expect(entryOf(two, LIVE)).toBe(PLAYGROUND);
  });
  it("finds nothing for a project with no main", () => {
    expect(entryOf(two, EMPTY)).toBeUndefined();
  });
});

describe("resume", () => {
  it("goes back to the tab last on screen while it is open", () => {
    expect(resume(OPEN, WS, TREND)).toBe(TREND);
  });
  it("otherwise picks the open tab with the newest activity, a child's reply included", () => {
    expect(resume(OPEN, WS, null)).toBe(PROFIT);
    expect(resume({ ...OPEN, tabs: [REFUNDS, TREND] }, WS, PROFIT)).toBe(REFUNDS);
  });
  it("finds nothing with no tabs open", () => {
    expect(resume({ ...OPEN, tabs: [] }, WS, null)).toBeNull();
  });
});
