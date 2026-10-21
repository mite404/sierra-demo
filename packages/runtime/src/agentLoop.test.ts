import { describe, expect, it } from "vitest";
import { createAgentLoop } from "./agentLoop";
import { beats, child, init, lastWorkspace, profit, startLoop, states } from "./agentLoop.harness";
import type { Command, Notice } from "./protocol";
import { lanesOf, projectIdSchema, threadIdSchema, threadLane } from "./workspace";

const openProfit: Command = { kind: "open", requestId: "r1", threadId: profit };

describe("the agent loop starts", () => {
  it("says where its data lives, then pushes the workspace", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    expect(beats(notices)).toEqual(["opening", "state"]);
    expect(notices[0]).toEqual({ kind: "opening", source: { kind: "device", storage: "memory" } });
    expect(lastWorkspace(notices).threads.map((thread) => thread.id)).toEqual(["profit"]);
  });

  it("starts once, however often it is asked", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run(init);
    expect(beats(notices)).toEqual(["opening", "state"]);
  });

  it("breaks when its data cannot open, and fails every request after", async () => {
    const notices: Notice[] = [];
    const run = createAgentLoop({
      post: (notice) => {
        notices.push(notice);
      },
      open: () => Promise.reject(new Error("The disk is full")),
    });
    await run(init);
    await run(openProfit);
    expect(notices).toEqual([
      { kind: "broken", reason: "The disk is full" },
      { kind: "failed", requestId: "r1", reason: "The disk is full" },
    ]);
  });

  it("fails a request sent before init", async () => {
    const { notices, run } = await startLoop();
    await run(openProfit);
    const reason = "The runtime has not been started";
    expect(notices).toEqual([{ kind: "failed", requestId: "r1", reason }]);
  });

  it("fails a malformed command that names its request, and breaks on one that does not", async () => {
    const { notices, run } = await startLoop();
    await run({ kind: "shout", requestId: "r7" });
    await run({ kind: "shout" });
    expect(notices).toEqual([
      expect.objectContaining({ kind: "failed", requestId: "r7" }),
      { kind: "broken", reason: expect.stringContaining("Unknown command") as unknown },
    ]);
  });
});

describe("the agent loop answers each request on its own", () => {
  it("opens a thread's turns", async () => {
    const { notices, store, run } = await startLoop();
    await run(init);
    await run(openProfit);
    const messages = store.transcript(profit)?.messages;
    expect(notices.at(-1)).toEqual({ kind: "opened", requestId: "r1", messages });
  });

  it("fails one open without failing another", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    const missing = threadIdSchema.parse("missing");
    await Promise.all([
      run({ kind: "open", requestId: "bad", threadId: missing }),
      run({ kind: "open", requestId: "good", threadId: profit }),
    ]);
    const answers = notices.slice(2);
    expect(answers).toHaveLength(2);
    expect(answers).toContainEqual({
      kind: "failed",
      requestId: "bad",
      reason: "No thread missing",
    });
    expect(answers).toContainEqual(expect.objectContaining({ kind: "opened", requestId: "good" }));
  });
});

describe("the agent loop pushes the state before it answers a write", () => {
  it("lists a new child, its lane and its draft before naming its id", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run(child("r2", "> Saturday\n\n"));
    expect(beats(notices).slice(-2)).toEqual(["state", "created"]);
    const created = notices.at(-1);
    const workspace = lastWorkspace(notices);
    expect(created).toEqual({ kind: "created", requestId: "r2", id: "t-001" });
    expect(workspace.threads.find((thread) => thread.id === "t-001")).toMatchObject({
      place: { kind: "child", parentId: "profit" },
      draft: "> Saturday\n\n",
    });
    expect(lanesOf(workspace, profit).map((lane) => lane.id)).toEqual(["l-t-001"]);
  });

  it("names an untitled main thread, and answers rename, arrange and shell with done", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run({
      kind: "create",
      requestId: "r1",
      item: { kind: "main", projectId: projectIdSchema.parse("demo-store") },
    });
    await run({
      kind: "rename",
      requestId: "r2",
      target: { kind: "thread", id: profit },
      name: "Margins",
    });
    await run({ kind: "arrange", requestId: "r3", mainId: profit, lanes: [], base: [] });
    await run({ kind: "saveShell", requestId: "r4", shell: { version: 1 } });
    expect(beats(notices)).toEqual([
      "opening",
      "state",
      "created",
      "state",
      "done",
      "state",
      "done",
    ]);
    const workspace = lastWorkspace(notices);
    expect(workspace.threads.map((thread) => thread.title)).toEqual(["Margins", "New thread"]);
    expect(workspace.shell).toEqual({ version: 1 });
  });
});

describe("the agent loop pushes a state only when the workspace changes", () => {
  it("pushes no second state for a write that changes nothing", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run(child("r1"));
    const lanes = [threadLane(threadIdSchema.parse("t-001"))];
    await run({ kind: "arrange", requestId: "r2", mainId: profit, lanes, base: [] });
    expect(beats(notices).slice(-2)).toEqual(["created", "done"]);
    expect(states(notices)).toHaveLength(2);
  });

  it("answers a refused write with failed and pushes nothing", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    const lanes = [threadLane(threadIdSchema.parse("stranger"))];
    await run({ kind: "arrange", requestId: "r1", mainId: profit, lanes, base: [] });
    expect(beats(notices)).toEqual(["opening", "state", "failed"]);
  });
});

describe("the agent loop keeps the lanes an arrange had not seen", () => {
  it("keeps a child created while an arrange was on its way, beside its neighbour", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run(child("r1"));
    await run(child("r2"));
    const seen = lanesOf(lastWorkspace(notices), profit); // → [l-t-002, l-t-001]
    const sunday = { kind: "child", parentId: profit, at: 1, title: "Sunday", draft: "" };
    await Promise.all([
      run({ kind: "create", requestId: "r3", item: sunday }),
      run({
        kind: "arrange",
        requestId: "r4",
        mainId: profit,
        lanes: [seen[1], seen[0]],
        base: seen.map((lane) => lane.id),
      }),
    ]);
    expect(lanesOf(lastWorkspace(notices), profit).map((lane) => lane.id)).toEqual([
      "l-t-001",
      "l-t-002",
      "l-t-003",
    ]);
  });
});
