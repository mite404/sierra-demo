import type { ReplyChunk } from "@yaklabs/catalog/reply";
import type { AgentEvent } from "@yaklabs/catalog/agent";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import { startRuntime, type Runtime, type RuntimeState } from "./runtime";
import { netProfitChoice } from "./testing";
import { inFreshWorker } from "./testWorkerClient";
import { lanesOf, locate, threadIdSchema, threadLane, type ThreadId } from "./workspace";

type Ready = Extract<RuntimeState, { kind: "ready" }>;

const starter = threadIdSchema.parse("playground"); // the device starter's thread (store.ts)
// The user stepped a profit card to net profit, then asked about it.
const question = "Why is Saturday high?";
const ask: AgentEvent = { kind: "message", text: question, attachments: [netProfitChoice] };
// Turn times read like the seeds': "9:02", "10:02".
const clockTime: unknown = expect.stringMatching(/^\d{1,2}:\d{2}$/);

// The device's database, which the runtime's worker opens.
const DEVICE_DATABASE = "yaklabs";
const versionSchema = z.object({ ok: z.literal(true), result: z.int() });

// Sets the device database's schema version from a worker of its own; answers the one it had.
async function setDeviceVersion(version: number): Promise<number> {
  const reply = await inFreshWorker({ kind: "set-version", name: DEVICE_DATABASE, version });
  return versionSchema.parse(reply).result;
}

// A runtime on the device with the lab stand-in at its real pace, stopped when the test ends.
function startLab(): Runtime {
  const runtime = startRuntime({ agent: { kind: "lab" }, data: { kind: "device" } });
  onTestFinished(() => {
    runtime.dispose();
  });
  return runtime;
}

// The runtime's state once the worker's first `state` has arrived.
function ready(runtime: Runtime): Promise<Ready> {
  return vi.waitFor(
    () => {
      const state = runtime.state();
      if (state.kind !== "ready") throw new Error(`The runtime is still ${state.kind}`);
      return state;
    },
    { timeout: 10_000 },
  );
}

// The lab stand-in streams words alone; a structured chunk would show up here as its JSON.
const wordsOf = (piece: ReplyChunk): string =>
  typeof piece === "string" ? piece : JSON.stringify(piece);

async function collect(pieces: AsyncIterable<ReplyChunk>): Promise<string[]> {
  const collected: string[] = [];
  for await (const piece of pieces) collected.push(wordsOf(piece));
  return collected;
}

// A thread's title as `state()` shows it; nothing before the workspace arrives.
function titleOf(state: RuntimeState, id: ThreadId): string | undefined {
  if (state.kind !== "ready") return undefined;
  return state.workspace.threads.find((thread) => thread.id === id)?.title;
}

// A thread's pin as `state()` shows it; nothing before the workspace arrives.
function pinnedAtOf(state: RuntimeState, id: ThreadId): string | null | undefined {
  if (state.kind !== "ready") return undefined;
  return state.workspace.threads.find((thread) => thread.id === id)?.pinnedAt;
}

// A fresh child of the starter's thread, so a rerun in the same browser profile never collides.
async function newChild(runtime: Runtime): Promise<ThreadId> {
  const draft = "> Saturday leads\n\n";
  const id = await runtime.create({
    kind: "child",
    parentId: starter,
    at: 0,
    title: "Saturday",
    draft,
  });
  return threadIdSchema.parse(id);
}

describe("the runtime in a Web Worker runs the thread menu (ADR-126)", () => {
  it("shows a pin and a delete in the same frame as the call, and an undo once confirmed", async () => {
    const runtime = startLab();
    await ready(runtime);
    const id = await newChild(runtime);
    const pinning = runtime.mark(id, { pinned: true });
    expect(pinnedAtOf(runtime.state(), id)).toEqual(expect.any(String));
    await pinning;
    const deleting = runtime.delete(id);
    expect(titleOf(runtime.state(), id)).toBeUndefined();
    await deleting;
    expect(titleOf(await ready(runtime), id)).toBeUndefined();
    await runtime.restore(id);
    expect(titleOf(runtime.state(), id)).toBe("Saturday");
    await expect(runtime.mark(id, { snoozedUntil: "2020-01-01T00:00:00.000Z" })).rejects.toThrow(
      "A snooze wakes after now",
    );
  }, 20_000);
});

describe("the runtime in a Web Worker keeps threads on the device", () => {
  it("starts from OPFS with the starter's thread, and lists a new child before create settles", async () => {
    const runtime = startLab();
    const state = await ready(runtime);
    expect(state.source).toEqual({ kind: "device", storage: "opfs" });
    expect(locate(state.workspace, starter)).toEqual({ main: starter, focus: null });
    const id = await newChild(runtime);
    const { workspace } = await ready(runtime);
    expect(locate(workspace, id)).toEqual({ main: starter, focus: id });
    expect(lanesOf(workspace, starter).at(0)).toEqual(threadLane(id));
  }, 20_000);

  it("streams a reply about the card view and keeps the thread across workers", async () => {
    const first = startLab();
    await ready(first);
    const id = await newChild(first);
    const reply = (await collect(first.agent(id).respond(ask, new AbortController().signal))).join(
      "",
    );
    expect(reply).toContain("Net profit");
    const kept = await first.open(id);
    expect(kept).toEqual([
      { id: "u1", role: "user", text: question, time: clockTime, attachments: [netProfitChoice] },
      { id: "a1", role: "agent", text: reply, time: clockTime, streaming: false },
    ]);
    first.dispose();

    const second = startLab();
    const { workspace } = await ready(second);
    expect(await second.open(id)).toEqual(kept);
    expect(workspace.threads.find((thread) => thread.id === id)?.draft).toBe("");
  }, 20_000);

  it("stops a reply when the page aborts it", async () => {
    const runtime = startLab();
    await ready(runtime);
    const id = await newChild(runtime);
    const controller = new AbortController();
    const pieces: string[] = [];
    for await (const piece of runtime.agent(id).respond(ask, controller.signal)) {
      pieces.push(wordsOf(piece));
      controller.abort();
    }
    expect(pieces).toHaveLength(1);
  }, 20_000);
});

describe("the runtime shows the page's edits at once", () => {
  it("shows a rename before the worker answers, and keeps it across workers", async () => {
    const first = startLab();
    await ready(first);
    const id = await newChild(first);
    const renaming = first.rename({ kind: "thread", id }, "Weekend margins");
    expect(titleOf(first.state(), id)).toBe("Weekend margins");
    await renaming;
    first.dispose();

    const second = startLab();
    expect(titleOf(await ready(second), id)).toBe("Weekend margins");
  }, 20_000);

  it("rolls a refused arrange back and says why", async () => {
    const runtime = startLab();
    const before = lanesOf((await ready(runtime)).workspace, starter);
    const stranger = threadLane(threadIdSchema.parse("stranger"));
    const arranging = runtime.arrange(starter, [stranger]);
    expect(lanesOf((await ready(runtime)).workspace, starter)).toEqual([stranger]);
    await expect(arranging).rejects.toThrow("a thread lane on its own");
    expect(lanesOf((await ready(runtime)).workspace, starter)).toEqual(before);
  }, 20_000);

  it("keeps a child created while an arrange was on its way", async () => {
    const runtime = startLab();
    const reversed = lanesOf((await ready(runtime)).workspace, starter).toReversed();
    const creating = newChild(runtime); // its lane lands first, left of the rest
    const arranging = runtime.arrange(starter, reversed);
    const id = await creating;
    await arranging;
    expect(lanesOf((await ready(runtime)).workspace, starter)).toEqual([
      ...reversed.slice(0, -1),
      threadLane(id),
      ...reversed.slice(-1),
    ]);
  }, 20_000);

  it("keeps the page's shell across workers", async () => {
    const first = startLab();
    await ready(first);
    const shell = { version: 1, tabs: ["playground"], nonce: crypto.randomUUID() };
    await first.saveShell(shell);
    first.dispose();
    const second = startLab();
    expect((await ready(second)).workspace.shell).toEqual(shell);
  }, 20_000);
});

describe("the runtime runs a scenario in the worker", () => {
  it("loads the demo in memory and says it is a scenario, whatever the device holds", async () => {
    const runtime = startRuntime({
      agent: { kind: "lab" },
      data: { kind: "scenario", name: "demo" },
    });
    onTestFinished(() => {
      runtime.dispose();
    });
    const { source, workspace } = await ready(runtime);
    expect(source).toEqual({ kind: "scenario", name: "demo" });
    expect(workspace.projects.map((project) => project.name)).toEqual([
      "Demo store",
      "Service desk",
    ]);
  }, 20_000);

  it("holds a loading start with its source, and never gets ready", async () => {
    const runtime = startRuntime({
      agent: { kind: "lab" },
      data: { kind: "scenario", name: "loading" },
    });
    onTestFinished(() => {
      runtime.dispose();
    });
    await vi.waitFor(() => {
      expect(runtime.state()).toEqual({
        kind: "starting",
        source: { kind: "scenario", name: "loading" },
      });
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(runtime.state().kind).toBe("starting");
  }, 20_000);
});

describe("the runtime waits its turn and breaks down plainly", () => {
  it("holds a second worker while the first has the device, then opens the same threads", async () => {
    const first = startLab();
    await ready(first);
    const id = await newChild(first);
    const second = startLab(); // a second tab, say
    await vi.waitFor(() => {
      expect(second.state()).toEqual({ kind: "held", source: null });
    });
    first.dispose(); // the first tab closes
    const { source, workspace } = await ready(second);
    expect(source).toEqual({ kind: "device", storage: "opfs" });
    expect(locate(workspace, id)).toEqual({ main: starter, focus: id });
  }, 20_000);

  it("breaks, rather than hide the saved threads, on a database newer than this build", async () => {
    const had = await setDeviceVersion(99);
    const runtime = startLab();
    try {
      await vi.waitFor(
        () => {
          expect(runtime.state().kind).not.toBe("starting");
        },
        { timeout: 10_000 },
      );
      expect(runtime.state()).toMatchObject({
        kind: "broken",
        reason: expect.stringContaining("newer than this build") as unknown,
      });
    } finally {
      runtime.dispose();
      await setDeviceVersion(had);
    }
  }, 20_000);
});

describe("the runtime fails what waits when it stops", () => {
  it("fails what is waiting when it is stopped, and every call after", async () => {
    const runtime = startLab();
    await ready(runtime);
    const opening = runtime.open(starter);
    runtime.dispose();
    await expect(opening).rejects.toThrow("The runtime was stopped");
    await expect(runtime.open(starter)).rejects.toThrow("The runtime was stopped");
    expect(runtime.state()).toEqual({
      kind: "broken",
      source: { kind: "device", storage: "opfs" },
      reason: "The runtime was stopped",
    });
  }, 20_000);

  it("fails a reply whose token was still on its way when the runtime stopped", async () => {
    const runtime = startLab();
    await ready(runtime);
    const token = Promise.withResolvers<string>();
    const session = { getAccessToken: () => token.promise };
    const replying = collect(
      runtime.agent(starter, session).respond(ask, new AbortController().signal),
    );
    runtime.dispose();
    token.resolve("a-token");
    const waited = new Promise((resolve) => {
      setTimeout(resolve, 2000, "still waiting");
    });
    await expect(Promise.race([replying, waited])).rejects.toThrow("The runtime was stopped");
  }, 20_000);
});
