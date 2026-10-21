import type { Agent } from "@yaklabs/catalog/agent";
import {
  threadIdSchema,
  type Place,
  type ProjectId,
  type Runtime,
  type RuntimeState,
  type ThreadId,
  type ThreadShare,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { composeRuntime, type Overlay } from "./compose";

// A fake side: a fixed state, every call logged by its side's name, and `owns` for the ids its
// workspace lists.
type Fake = { runtime: Overlay; calls: string[]; tell: () => void; set: (s: RuntimeState) => void };

const id = (raw: string): ThreadId => threadIdSchema.parse(raw);
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const project = (raw: string) => raw as ProjectId;

const [HOME, DEMO] = [project("home"), project("demo")];
const [LIVE, BRIEF, CHILD] = [id("playground"), id("demo-brief"), id("demo-brief-orders")];

function thread(threadId: ThreadId, place: Place, at: string): ThreadSummary {
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

const WORKER: Workspace = {
  projects: [{ id: HOME, name: "Live Playground", createdAt: "2026-09-30T10:00:00.000Z" }],
  threads: [thread(LIVE, { kind: "main", projectId: HOME }, "2026-09-30T10:00:00.000Z")],
  lanes: { [LIVE]: [] },
  shell: { version: 1, tabs: [LIVE], views: {}, read: [] },
  notifications: [{ id: "n-1", threadId: LIVE, text: "Later", at: "2026-09-30T11:00:00.000Z" }],
  shares: [],
};

const OVERLAY: Workspace = {
  projects: [{ id: DEMO, name: "Demo", createdAt: "2026-09-29T09:00:00.000Z" }],
  threads: [
    thread(BRIEF, { kind: "main", projectId: DEMO }, "2026-09-29T09:00:03.000Z"),
    thread(CHILD, { kind: "child", parentId: BRIEF }, "2026-09-29T09:00:04.000Z"),
  ],
  lanes: { [BRIEF]: [] },
  shell: null,
  notifications: [
    { id: "demo-note-1", threadId: CHILD, text: "Earlier", at: "2026-09-29T09:00:05.000Z" },
  ],
  shares: [],
};

const SHARE: ThreadShare = {
  id: "s-1",
  threadId: BRIEF,
  link: "https://kay.example/s#k",
  revokeToken: "r-1",
  createdAt: "2026-09-29T09:10:00.000Z",
  expiresAt: "2026-09-30T09:10:00.000Z",
};

const ready = (workspace: Workspace, replying: ThreadId[]): RuntimeState => ({
  kind: "ready",
  source: { kind: "device", storage: "memory" },
  workspace,
  replying,
});

const silent: Agent = {
  // oxlint-disable-next-line require-yield -- an agent that answers nothing
  async *respond() {},
};

// The verbs that only log what they were asked, as `<side>.<verb> <first argument>`.
function loggingVerbs(
  name: string,
  calls: string[],
): Omit<Overlay, "state" | "subscribe" | "owns"> {
  const note = (verb: string, arg: unknown) => {
    calls.push(`${name}.${verb} ${JSON.stringify(arg)}`);
    return Promise.resolve();
  };
  return {
    open: async (threadId) => {
      await note("open", threadId);
      return [];
    },
    create: async (item) => {
      await note("create", item);
      return "made";
    },
    rename: (target) => note("rename", target),
    arrange: (mainId) => note("arrange", mainId),
    saveShell: (shell) => note("saveShell", shell),
    mark: (threadId) => note("mark", threadId),
    delete: (threadId) => note("delete", threadId),
    restore: (threadId) => note("restore", threadId),
    share: (share) => note("share", share),
    unshare: (shareId) => note("unshare", shareId),
    agent: (threadId) => {
      calls.push(`${name}.agent "${threadId}"`);
      return silent;
    },
    dispose: () => {
      calls.push(`${name}.dispose`);
    },
  };
}

function fake(name: string, first: RuntimeState): Fake {
  const calls: string[] = [];
  const listeners = new Set<() => void>();
  let state = first;
  const runtime: Overlay = {
    ...loggingVerbs(name, calls),
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    owns: (raw) =>
      state.kind === "ready" &&
      [...state.workspace.projects, ...state.workspace.threads].some((each) => each.id === raw),
  };
  return {
    runtime,
    calls,
    tell: () => {
      for (const listener of listeners) listener();
    },
    set: (next) => {
      state = next;
    },
  };
}

// The workspace a ready state shows.
function workspaceOf(state: RuntimeState): Workspace {
  if (state.kind !== "ready") throw new Error(`The runtime is ${state.kind}`);
  return state.workspace;
}

function composed(worker = ready(WORKER, [LIVE]), overlay = ready(OVERLAY, [CHILD])) {
  const sides = { worker: fake("worker", worker), overlay: fake("overlay", overlay) };
  const runtime: Runtime = composeRuntime(sides.worker.runtime, sides.overlay.runtime);
  const calls = () => [...sides.worker.calls, ...sides.overlay.calls];
  return { runtime, sides, calls };
}

describe("composeRuntime's state", () => {
  it("shows both workspaces as one once the worker is ready, with its shell alone", () => {
    const { runtime } = composed();
    const state = runtime.state();
    const workspace = workspaceOf(state);
    expect(workspace.projects.map((each) => each.id)).toEqual([HOME, DEMO]);
    expect(workspace.threads.map((each) => each.id)).toEqual([LIVE, BRIEF, CHILD]);
    expect(Object.keys(workspace.lanes)).toEqual([LIVE, BRIEF]);
    expect(workspace.shell).toEqual(WORKER.shell);
    expect(workspace.notifications.map((each) => each.id)).toEqual(["n-1", "demo-note-1"]);
    expect(state).toMatchObject({ replying: [LIVE, CHILD] });
    expect(state.source).toEqual({ kind: "device", storage: "memory" });
  });

  it("is the same object until either side changes", () => {
    const { runtime, sides } = composed();
    const first = runtime.state();
    expect(runtime.state()).toBe(first);
    sides.overlay.set(ready(OVERLAY, []));
    expect(runtime.state()).not.toBe(first);
  });

  it("breaks, rather than list a record twice, when both sides hold an id", () => {
    const place = { kind: "main", projectId: DEMO } as const;
    const ws = { ...OVERLAY, threads: [thread(LIVE, place, "2026-09-29T09:00:03.000Z")] };
    expect(() => composed(ready(WORKER, []), ready(ws, [])).runtime.state()).toThrow(
      'The worker and the overlay both hold "playground"',
    );
  });

  it("is the worker's own while it starts or once it breaks", () => {
    const starting: RuntimeState = { kind: "starting", source: null };
    expect(composed(starting).runtime.state()).toBe(starting);
    const broken: RuntimeState = { kind: "broken", source: null, reason: "gone" };
    expect(composed(broken).runtime.state()).toBe(broken);
  });

  it("hears both sides", () => {
    const { runtime, sides } = composed();
    const heard: string[] = [];
    const stop = runtime.subscribe(() => {
      heard.push("heard");
    });
    sides.worker.tell();
    sides.overlay.tell();
    stop();
    sides.worker.tell();
    expect(heard).toEqual(["heard", "heard"]);
  });
});

// Asks every verb that names an id once, of either side, sharing a Demo thread.
async function askEveryVerb(runtime: Runtime): Promise<void> {
  await runtime.open(BRIEF);
  await runtime.open(LIVE);
  await runtime.rename({ kind: "project", id: DEMO }, "Show");
  await runtime.rename({ kind: "thread", id: LIVE }, "Mine");
  await runtime.arrange(BRIEF, []);
  await runtime.mark(CHILD, { pinned: true });
  await runtime.delete(LIVE);
  await runtime.restore(BRIEF);
  await runtime.share(SHARE);
  await runtime.unshare("s-9");
  runtime.agent(CHILD);
  runtime.agent(LIVE);
}

describe("composeRuntime's verbs", () => {
  it("send each verb to the side that owns the id it names", async () => {
    const { runtime, calls } = composed();
    await askEveryVerb(runtime);
    expect(calls()).toEqual([
      'worker.open "playground"',
      'worker.rename {"kind":"thread","id":"playground"}',
      'worker.delete "playground"',
      'worker.unshare "s-9"',
      'worker.agent "playground"',
      'overlay.open "demo-brief"',
      'overlay.rename {"kind":"project","id":"demo"}',
      'overlay.arrange "demo-brief"',
      'overlay.mark "demo-brief-orders"',
      'overlay.restore "demo-brief"',
      `overlay.share ${JSON.stringify(SHARE)}`,
      'overlay.agent "demo-brief-orders"',
    ]);
  });

  it("creates in an overlay project or under an overlay main there, and the rest in the worker", async () => {
    const { runtime, calls } = composed();
    await runtime.create({ kind: "main", projectId: DEMO });
    await runtime.create({ kind: "child", parentId: BRIEF, at: 0, title: "t", draft: "" });
    await runtime.create({ kind: "main", projectId: HOME });
    await runtime.create({ kind: "child", parentId: LIVE, at: 0, title: "t", draft: "" });
    await runtime.create({ kind: "project", name: "New project" });
    expect(calls().map((call) => call.split(" ")[0])).toEqual([
      "worker.create",
      "worker.create",
      "worker.create",
      "overlay.create",
      "overlay.create",
    ]);
  });

  it("keeps the shell document through the worker alone, and disposes both", async () => {
    const { runtime, calls } = composed();
    await runtime.saveShell({ version: 1, tabs: [BRIEF], views: {}, read: [] });
    runtime.dispose();
    expect(calls()).toEqual([
      'worker.saveShell {"version":1,"tabs":["demo-brief"],"views":{},"read":[]}',
      "worker.dispose",
      "overlay.dispose",
    ]);
  });
});
