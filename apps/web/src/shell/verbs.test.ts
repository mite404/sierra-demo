import {
  threadIdSchema,
  type Located,
  type Place,
  type ProjectId,
  type Runtime,
  type RuntimeState,
  type ThreadId,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { parseShell, setPane, viewOf, visit, type ShellState } from "./state";
import { edit } from "./verbs";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const STORE = "p-1" as ProjectId;
const id = (raw: string): ThreadId => threadIdSchema.parse(raw);
const [PROFIT, REFUNDS, SATURDAY] = ["profit", "refunds", "saturday"].map((raw) => id(raw));

function thread(threadId: ThreadId, place: Place): ThreadSummary {
  const at = "2026-09-20T09:00:00.000Z";
  return {
    id: threadId,
    title: threadId,
    place,
    createdAt: at,
    updatedAt: at,
    preview: "",
    turnCount: 0,
    draft: "",
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
  };
}

const WS: Workspace = {
  projects: [{ id: STORE, name: "Demo store", createdAt: "2026-09-20T09:00:00.000Z" }],
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

const PROFIT_ONLY: ShellState = { version: 1, tabs: [PROFIT], views: {}, read: [] };

const unused = () => {
  throw new Error("Not part of the shell's saves");
};

// A runtime that holds `shell` and records every document the page saves.
function holding(shell: ShellState): { runtime: Runtime; saves: ShellState[] } {
  const saves: ShellState[] = [];
  const state: RuntimeState = {
    kind: "ready",
    source: { kind: "scenario", name: "demo" },
    workspace: { ...WS, shell },
    replying: [],
  };
  const runtime: Runtime = {
    subscribe: () => () => {},
    state: () => state,
    open: unused,
    create: unused,
    rename: unused,
    arrange: unused,
    saveShell: (next) => {
      saves.push(parseShell(next, WS));
      return Promise.resolve();
    },
    mark: unused,
    delete: unused,
    restore: unused,
    share: unused,
    unshare: unused,
    agent: unused,
    dispose: () => {},
  };
  return { runtime, saves };
}

const visiting = (at: Located) => (doc: ShellState) => visit(doc, at);

describe("edit", () => {
  it("saves the visit to a thread that has no tab yet", () => {
    const at = { main: REFUNDS, focus: null };
    const { runtime, saves } = holding(PROFIT_ONLY);
    edit(runtime, at, visiting(at));
    expect(saves.map((doc) => doc.tabs)).toEqual([[PROFIT, REFUNDS]]);
  });
  it("saves the canvas a child's address forces on its main", () => {
    const at = { main: PROFIT, focus: SATURDAY };
    const { runtime, saves } = holding(setPane(PROFIT_ONLY, PROFIT, "thread"));
    edit(runtime, at, visiting(at));
    expect(saves.map((doc) => viewOf(doc, PROFIT).pane)).toEqual(["canvas"]);
  });
  it("saves nothing when the document already holds the visit and the change", () => {
    const at = { main: PROFIT, focus: null };
    const { runtime, saves } = holding(PROFIT_ONLY);
    edit(runtime, at, visiting(at));
    edit(runtime, null, (doc) => doc);
    expect(saves).toEqual([]);
  });
});
