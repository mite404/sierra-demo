import type { AgentEvent } from "@yaklabs/catalog/agent";
import { createLabAgent } from "@yaklabs/catalog/labAgent";
import { describe, expect, it, vi } from "vitest";
import { createAgentLoop, type LoopHost } from "./agentLoop";
import type { AgentSpec, Command, Notice, ScenarioName } from "./protocol";
import { openScenario } from "./scenarios";
import { threadIdSchema } from "./workspace";

// The demo's profit thread, the first thread its fixture writes.
const profit = threadIdSchema.parse("t-001");
const ask: AgentEvent = { kind: "message", text: "Why is Saturday high?", attachments: [] };
const lab: AgentSpec = { kind: "lab" };
const init = (name: ScenarioName, agent?: AgentSpec): Command => ({
  kind: "init",
  agent: agent ?? lab,
  data: { kind: "scenario", name },
});

// A loop on a scenario, as the worker runs one, with every notice it posts collected in order.
function startLoop(createAgent?: LoopHost["createAgent"]) {
  const notices: Notice[] = [];
  const run = createAgentLoop({
    post: (notice) => {
      notices.push(notice);
    },
    open: (data) =>
      data.kind === "scenario"
        ? openScenario(data.name)
        : Promise.reject(new Error("A scenario test never opens the device")),
    createAgent,
  });
  return { notices, run };
}

// Gives a request that would answer the time to do so; nothing but microtasks is left by now.
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

describe("the agent loop meets a scenario's faults before it handles anything", () => {
  it("holds a start after saying where its data is, and never answers a request", async () => {
    const { notices, run } = startLoop();
    void run(init("loading"));
    void run({ kind: "open", requestId: "r1", threadId: profit });
    const opening = { kind: "opening", source: { kind: "scenario", name: "loading" } };
    await vi.waitFor(() => {
      expect(notices).toEqual([opening]);
    });
    await settle();
    expect(notices).toEqual([opening]);
  });

  it("fails a start with its reason, and every request after", async () => {
    const { notices, run } = startLoop();
    await run(init("failure"));
    await run({ kind: "open", requestId: "r1", threadId: profit });
    const reason = "This scenario fails to start, on purpose.";
    expect(notices).toEqual([
      { kind: "opening", source: { kind: "scenario", name: "failure" } },
      { kind: "broken", reason },
      { kind: "failed", requestId: "r1", reason },
    ]);
  });

  it("fails an open and a send with their reasons, and saves no turn", async () => {
    const { notices, run } = startLoop();
    await run(init("thread-fails"));
    await run({ kind: "open", requestId: "r1", threadId: profit });
    await run({ kind: "send", requestId: "r2", threadId: profit, event: ask });
    expect(notices.slice(2)).toEqual([
      {
        kind: "failed",
        requestId: "r1",
        reason: "This thread could not be opened. The scenario fails every open.",
      },
      {
        kind: "failed",
        requestId: "r2",
        reason: "This reply could not be sent. The scenario fails every send.",
      },
    ]);
  });
});

describe("a scenario says where its data is before anything can fail", () => {
  it("names a scenario before it opens, so one that cannot open still says so", async () => {
    const notices: Notice[] = [];
    const run = createAgentLoop({
      post: (notice) => {
        notices.push(notice);
      },
      open: () => Promise.reject(new Error("The scenarios could not load")),
    });
    await run(init("demo"));
    expect(notices).toEqual([
      { kind: "opening", source: { kind: "scenario", name: "demo" } },
      { kind: "broken", reason: "The scenarios could not load" },
    ]);
  });
});

describe("a scenario never reaches a model", () => {
  it("answers with the lab stand-in even when the page asked for the gateway", async () => {
    const createAgent = vi.fn<NonNullable<LoopHost["createAgent"]>>(() =>
      createLabAgent({ replyDelayMs: 0, wordMs: 0 }),
    );
    const { notices, run } = startLoop(createAgent);
    await run(init("demo", { kind: "gateway", baseUrl: "http://gateway.test" }));
    await run({ kind: "send", requestId: "r1", threadId: profit, event: ask });
    expect(createAgent.mock.calls.map(([spec]) => spec)).toEqual([{ kind: "lab" }]);
    expect(notices.at(-1)).toEqual({ kind: "done", requestId: "r1" });
  });
});
