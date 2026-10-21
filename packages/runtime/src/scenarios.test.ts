import { describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";
import type { Opened } from "./agentLoop";
import { scenarioNames, type ScenarioName } from "./protocol";
import { openScenario, seedDemoStore } from "./scenarios";
import { openSqliteStore } from "./sqliteStore";
import { ensureStarter, seedThread } from "./store";
import { lanesOf, sidebarTree, threadIdSchema, type ThreadId, type Workspace } from "./workspace";

// A scenario, opened fresh and closed when the test ends.
async function open(name: ScenarioName): Promise<Opened> {
  const opened = await openScenario(name);
  onTestFinished(() => {
    opened.store.close();
  });
  return opened;
}

// Everything a load leaves, as text: the workspace, and every thread's transcript.
function serialized({ store }: Opened): string {
  const workspace = store.workspace();
  const transcripts = workspace.threads.map((thread) => store.transcript(thread.id));
  return JSON.stringify({ workspace, transcripts });
}

// The sidebar as titles: each project with its mains, each main with its children.
function outline(ws: Workspace) {
  return sidebarTree(ws).map(({ project, mains }) => ({
    [project.name]: mains.map(({ main, children }) => [
      main.title,
      ...children.map((c) => c.title),
    ]),
  }));
}

const [profitTitle, trendTitle] = [seedThread("profit").title, seedThread("trend").title];
// The first thread each fixture writes: the demo's profit thread, the long scenario's busiest.
const first = threadIdSchema.parse("t-001");
const title = (ws: Workspace, id: ThreadId) => ws.threads.find((thread) => thread.id === id)?.title;

describe("scenarios load the same every time", () => {
  it.each(scenarioNames)("%s is byte-identical on a second load", async (name) => {
    expect(serialized(await open(name))).toBe(serialized(await open(name)));
  });

  it.each(scenarioNames)("%s says it is a scenario", async (name) => {
    expect((await open(name)).source).toEqual({ kind: "scenario", name });
  });
});

describe("the demo scenario", () => {
  it("holds two projects, the profit thread with two children, and the trend thread", async () => {
    const ws = (await open("demo")).store.workspace();
    expect(outline(ws)).toEqual([
      {
        "Demo store": [
          ["Refund audit"],
          [profitTitle, "Why is Tuesday quiet?", "Saturday leads at every level"],
        ],
      },
      { "Service desk": [[trendTitle]] },
    ]);
  });

  it("opens a card and one child beside profit, two tabs, and two notifications", async () => {
    const ws = (await open("demo")).store.workspace();
    const profit = first;
    expect(lanesOf(ws, profit).map((lane) => [lane.kind, lane.id])).toEqual([
      ["card", "c-001"],
      ["thread", "l-t-002"],
    ]);
    expect(ws.shell).toMatchObject({
      tabs: [profit, "t-005"],
      views: { [profit]: { pane: "canvas" }, "t-005": { pane: "browser" } },
    });
    expect(ws.notifications.map((each) => title(ws, each.threadId))).toEqual([
      "Refund audit",
      trendTitle,
    ]);
  });
});

describe("the long and empty scenarios", () => {
  it("holds twelve 80-character projects, one with a 60-character word", async () => {
    const ws = (await open("long")).store.workspace();
    expect(ws.projects.map((project) => project.name.length)).toEqual(
      Array.from({ length: 12 }, () => 80),
    );
    expect(ws.projects.filter((project) => /\S{60}/.test(project.name))).toHaveLength(1);
  });

  it("holds a main with nine children, a 120-turn thread, twelve tabs and notifications", async () => {
    const { store } = await open("long");
    const ws = store.workspace();
    const busiest = sidebarTree(ws)
      .flatMap(({ mains }) => mains)
      .find((node) => node.children.length > 0);
    expect(busiest?.children).toHaveLength(9);
    expect(store.transcript(first)?.messages).toHaveLength(120);
    expect(z.object({ tabs: z.array(z.string()) }).parse(ws.shell).tabs).toHaveLength(12);
    expect(ws.notifications).toHaveLength(12);
  });

  it("holds nothing when empty", async () => {
    const ws = (await open("empty")).store.workspace();
    expect(ws).toEqual({
      projects: [],
      threads: [],
      lanes: {},
      shell: null,
      notifications: [],
      shares: [],
    });
  });
});

describe("seedDemoStore", () => {
  it("adds the Demo store's profit thread beside the starter, once", async () => {
    const store = await openSqliteStore({ kind: "memory" });
    onTestFinished(() => {
      store.close();
    });
    const at = "2026-09-26T10:00:00.000Z";
    ensureStarter(store, at);
    seedDemoStore(store, at);
    const once = store.workspace();
    seedDemoStore(store, "2026-09-26T10:05:00.000Z");
    expect(store.workspace()).toEqual(once);
    expect(outline(once)).toEqual([
      { "Demo store": [["Last week's sales"]] },
      { "Live Playground": [["New thread"]] },
    ]);
    const profit = threadIdSchema.parse("profit");
    expect(lanesOf(once, profit)).toEqual([]);
    expect(store.transcript(profit)?.messages).toEqual(seedThread("profit").messages);
  });
});
