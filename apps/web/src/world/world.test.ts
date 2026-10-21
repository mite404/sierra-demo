import { childrenOf, latestMain, sidebarTree } from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { brief } from "../demo/scenarios/brief";
import { at, type Script } from "../demo/script";
import { ids } from "./ids";
import {
  ask,
  BRIEF,
  drain,
  firstReply,
  idOf,
  INTERRUPTED,
  lastTurn,
  onStart,
  playing,
  recordReplying,
  replyingOf,
  RETURNED,
  wordsOf,
  workspaceOf,
} from "./testing";

describe("the Demo world's workspace", () => {
  it("opens on the Demo project, its three shows in order, the brief its entry", async () => {
    const world = playing();
    const ws = workspaceOf(world.state());
    const [demo] = sidebarTree(ws);
    expect(demo.project).toMatchObject({
      id: "demo",
      name: "Demo",
      createdAt: "2026-09-29T09:00:00.000Z",
    });
    expect(demo.mains.map((each) => each.main.id)).toEqual([BRIEF, INTERRUPTED, RETURNED]);
    expect(latestMain(ws)).toBe(BRIEF);
    expect(ws.shell).toBeNull();
    expect(await world.open(BRIEF)).toEqual([]);
    await expect(world.open(idOf("nobody"))).rejects.toThrow(/no thread "nobody"/);
  });

  it("opens the returned show on the run its opening records, timed from now", async () => {
    const before = Date.now();
    const world = playing();
    const after = Date.now();
    const ws = workspaceOf(world.state());
    expect(ws.lanes[RETURNED]).toHaveLength(3);
    const main = await world.open(RETURNED);
    expect(main.map((turn) => turn.role)).toEqual(["user", "agent"]);
    const asked = Date.parse(main[0].time); // → when the user last spoke
    expect(asked).toBeGreaterThanOrEqual(before - 25 * 60_000);
    expect(asked).toBeLessThanOrEqual(after - 25 * 60_000);
    const south = await world.open(idOf("demo-returned-south"));
    expect(south[1]).toMatchObject({
      streaming: false,
      text: "67 invoices matched; 2 bill more than was delivered.",
    });
  });
});

describe("the Demo world's verbs", () => {
  it("owns what it declares and makes, and keeps the other verbs in memory", async () => {
    const world = playing();
    expect(world.owns("demo")).toBe(true);
    expect(world.owns("playground")).toBe(false);
    const made = await world.create({ kind: "main", projectId: ids.project });
    expect(made).toBe("demo-new-t1");
    expect(world.owns(made)).toBe(true);
    await world.rename({ kind: "thread", id: BRIEF }, "Monday brief");
    await world.delete(BRIEF);
    expect(world.owns(BRIEF)).toBe(true); // → its tomb, until a restore
    await world.restore(BRIEF);
    expect(workspaceOf(world.state()).threads.find((each) => each.id === BRIEF)?.title).toBe(
      "Monday brief",
    );
    await expect(world.saveShell({})).rejects.toThrow(/keeps no shell/);
  });

  it("keeps a snooze's note in the bell with the snooze, and neither for a past one", async () => {
    const world = playing();
    const notesBefore = workspaceOf(world.state()).notifications.length;
    const ahead = "2099-01-01T09:00:00.000Z";
    await world.mark(BRIEF, { snoozedUntil: ahead }, { id: "n-snooze", text: "Snoozed brief" });
    const ws = workspaceOf(world.state());
    expect(ws.threads.find((each) => each.id === BRIEF)?.snoozedUntil).toBe(ahead);
    expect(ws.notifications[0]).toMatchObject({
      id: "n-snooze",
      threadId: BRIEF,
      text: "Snoozed brief",
    });
    const past = { snoozedUntil: "2000-01-01T09:00:00.000Z" };
    await expect(world.mark(RETURNED, past, { id: "n-past", text: "No" })).rejects.toThrow(
      "A snooze wakes after now",
    );
    expect(workspaceOf(world.state()).notifications).toHaveLength(notesBefore + 1);
  });
});

describe("the Demo world's scripted replies", () => {
  it("answers a request with the script's first reply, chunk by chunk and in order", async () => {
    const world = playing();
    const chunks = await drain(world, BRIEF, ask("Prepare the brief"));
    expect(wordsOf(chunks)).toEqual(wordsOf(firstReply(brief)));
    const turns = await world.open(BRIEF);
    expect(turns.map((turn) => turn.role)).toEqual(["user", "agent"]);
    expect(lastTurn(turns)).toMatchObject({ streaming: false, activity: undefined });
    expect(world.showOf(BRIEF)?.progress()).toEqual({ started: 1, settled: new Set([0]) });
  });

  it("says the show is over once its replies are spent", async () => {
    const short: Script = {
      ...brief,
      beats: [
        { kind: "user", after: 0, text: "Hi" },
        { kind: "reply", events: [at(0, "Hello.")] },
      ],
    };
    const world = playing([short]);
    expect(await drain(world, BRIEF, ask("Hi"))).toEqual(["Hello."]);
    expect(await drain(world, BRIEF, ask("Again?"))).toEqual([
      "That is the end of this scripted scenario. Press Restart to play it again.",
    ]);
  });

  it("keeps a docked question's wording for its own thread's answer only", async () => {
    const asking: Script = {
      ...brief,
      beats: [
        { kind: "user", after: 0, text: "Go" },
        {
          kind: "reply",
          events: [at(0, { kind: "question", question: { question: "Which first?" } })],
        },
      ],
    };
    const world = playing([asking, { ...brief, id: "other" }]);
    await drain(world, BRIEF, ask("Go"));
    await drain(world, idOf("demo-other"), { kind: "answer", text: "North" });
    await drain(world, BRIEF, { kind: "answer", text: "South" });
    expect((await world.open(idOf("demo-other")))[0]).toMatchObject({ question: undefined });
    expect((await world.open(BRIEF)).at(2)).toMatchObject({
      text: "South",
      question: "Which first?",
    });
  });
});

describe("the Demo world's children", () => {
  const [workload, issues, response] = ["workload", "issues", "response"].map((local) =>
    ids.child(BRIEF, local),
  );

  it("makes, runs and settles the children its steps name, replying as they work", async () => {
    const world = playing();
    const seen = recordReplying(world);
    await drain(world, BRIEF, ask("Prepare the brief"));
    expect(seen).toEqual([
      [],
      [BRIEF],
      [BRIEF, workload],
      [BRIEF, workload, issues],
      [BRIEF, workload, issues, response],
      [BRIEF, issues, response],
      [BRIEF, response],
      [BRIEF],
      [],
    ]);
    expect(lastTurn(await world.open(workload))).toMatchObject({
      text: "Backlog fell from 46 cases Monday to 18 by Friday.",
      streaming: false,
    });
  });

  it("cancels the children still running when the reply is stopped", async () => {
    const world = playing();
    const stop = new AbortController();
    await drain(
      world,
      BRIEF,
      ask("Prepare the brief"),
      stop.signal,
      onStart("issues", () => {
        stop.abort();
      }),
    );
    expect(replyingOf(world.state())).toEqual([]);
    expect(lastTurn(await world.open(workload))).toMatchObject({ ended: "cancelled" });
    expect(lastTurn(await world.open(BRIEF))).toMatchObject({ ended: "cancelled" });
    expect(world.showOf(BRIEF)?.progress().settled.has(0)).toBe(true);
  });
});

describe("the Demo world's lanes", () => {
  const [workload, issues, response] = ["workload", "issues", "response"].map((local) =>
    ids.child(BRIEF, local),
  );

  it("opens the children's lanes left to right as the sidebar lists them", async () => {
    const world = playing();
    await drain(world, BRIEF, ask("Prepare the brief"));
    const ws = workspaceOf(world.state());
    // Top to bottom in the sidebar is newest first.
    expect(ws.lanes[BRIEF]?.map((lane) => lane.id)).toEqual([
      `l-${response}`,
      `l-${issues}`,
      `l-${workload}`,
    ]);
    expect(childrenOf(ws, BRIEF).map((child) => `l-${child.id}`)).toEqual(
      ws.lanes[BRIEF]?.map((lane) => lane.id),
    );
  });
});

describe("the Demo world's failed children", () => {
  it("notes a child that could not finish for the bell", async () => {
    const world = playing();
    await drain(world, INTERRUPTED, ask("Check the refunds"));
    expect(workspaceOf(world.state()).notifications.map((each) => each.text)).toEqual([
      "Refund audit: Order lookups could not finish.",
    ]);
    expect(lastTurn(await world.open(ids.child(INTERRUPTED, "orders")))).toMatchObject({
      ended: "failed",
      failure: { title: "Could not finish" },
    });
  });
});
