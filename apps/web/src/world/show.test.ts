import { describe, expect, it } from "vitest";
import { ids } from "./ids";
import {
  ask,
  BRIEF,
  drain,
  INTERRUPTED,
  onStart,
  playing,
  replyingOf,
  workspaceOf,
} from "./testing";

describe("a show's Restart", () => {
  it("puts its thread back as it opens and leaves the other shows alone", async () => {
    const world = playing();
    const fresh = workspaceOf(world.state());
    await drain(world, BRIEF, ask("Prepare the brief"));
    await drain(world, INTERRUPTED, ask("Check the refunds"));
    const interrupted = await world.open(INTERRUPTED);
    world.showOf(BRIEF)?.restart();
    expect(await world.open(BRIEF)).toEqual([]);
    expect(await world.open(INTERRUPTED)).toEqual(interrupted);
    const ws = workspaceOf(world.state());
    expect(ws.threads.filter((each) => each.id.startsWith("demo-brief"))).toEqual(
      fresh.threads.filter((each) => each.id.startsWith("demo-brief")),
    );
    expect(ws.lanes[BRIEF]).toEqual([]);
    expect(world.showOf(BRIEF)?.state()).toMatchObject({ status: "idle", take: 2 });
    expect(world.showOf(BRIEF)?.progress()).toEqual({ started: 0, settled: new Set() });
  });

  it("leaves the same workspace when pressed twice as when pressed once", async () => {
    const world = playing();
    await drain(world, BRIEF, ask("Prepare the brief"));
    world.showOf(BRIEF)?.restart();
    const once = workspaceOf(world.state());
    world.showOf(BRIEF)?.restart();
    expect(workspaceOf(world.state())).toEqual(once);
  });
});

describe("a Restart during a reply", () => {
  it("lets a reply still unwinding write nothing into the next take", async () => {
    const world = playing();
    const restart = onStart("issues", () => {
      world.showOf(BRIEF)?.restart();
    });
    await drain(world, BRIEF, ask("Prepare the brief"), undefined, restart);
    expect(await world.open(BRIEF)).toEqual([]);
    expect(replyingOf(world.state())).toEqual([]);
    expect(workspaceOf(world.state()).threads.map((each) => each.id)).not.toContain(
      ids.child(BRIEF, "workload"),
    );
    expect(world.showOf(BRIEF)?.progress()).toEqual({ started: 0, settled: new Set() });
  });
});
