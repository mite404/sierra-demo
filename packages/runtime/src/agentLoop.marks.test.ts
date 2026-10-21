import { describe, expect, it } from "vitest";
import { beats, init, lastWorkspace, movableMint, profit, startLoop } from "./agentLoop.harness";
import type { Command } from "./protocol";
import { PURGE_AFTER_MS } from "./settle";
import { threadIdSchema } from "./workspace";

const HOUR = 60 * 60 * 1000;
const mark = (requestId: string, change: Extract<Command, { kind: "mark" }>["change"]) =>
  ({ kind: "mark", requestId, threadId: profit, change }) as const;
const profitIn = (notices: Parameters<typeof lastWorkspace>[0]) =>
  lastWorkspace(notices).threads.find((thread) => thread.id === profit);

describe("the agent loop runs the thread menu's writes (ADR-126)", () => {
  it("pins, pushing the state before it answers done", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run(mark("r1", { pinned: true }));
    expect(beats(notices).slice(-2)).toEqual(["state", "done"]);
    expect(profitIn(notices)?.pinnedAt).toBe("2026-09-26T10:03:00.000Z");
  });

  it("fails a mark on a thread it lacks, alone", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    const missing = threadIdSchema.parse("missing");
    await run({ kind: "mark", requestId: "r1", threadId: missing, change: { pinned: true } });
    expect(notices.at(-1)).toEqual({
      kind: "failed",
      requestId: "r1",
      reason: "No thread missing",
    });
  });

  it("hides a deleted thread at once and brings it back on restore", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    await run({ kind: "delete", requestId: "r1", threadId: profit });
    expect(profitIn(notices)).toBeUndefined();
    await run({ kind: "restore", requestId: "r2", threadId: profit });
    expect(profitIn(notices)?.title).toBe("Last week's sales");
    expect(beats(notices).slice(-4)).toEqual(["state", "done", "state", "done"]);
  });

  it("keeps a share and forgets it", async () => {
    const { notices, run } = await startLoop();
    await run(init);
    const share = {
      id: "s1",
      threadId: profit,
      link: "https://kay.example/share.html#t=s1.key",
      revokeToken: "r",
      createdAt: "2026-09-26T10:03:00.000Z",
      expiresAt: "2026-09-26T11:03:00.000Z",
    };
    await run({ kind: "share", requestId: "r1", share });
    expect(lastWorkspace(notices).shares).toEqual([share]);
    await run({ kind: "unshare", requestId: "r2", shareId: "s1" });
    expect(lastWorkspace(notices).shares).toEqual([]);
  });
});

describe("the agent loop settles on its own (ADR-128 to ADR-130)", () => {
  it("wakes a snooze when its timer fires, with the bell's note in the pushed state", async () => {
    const { mint, clock } = movableMint();
    const { notices, run, timer } = await startLoop(undefined, mint);
    await run(init);
    const until = new Date(clock.at.getTime() + HOUR).toISOString();
    await run(mark("r1", { snoozedUntil: until }));
    expect(timer.delay).toBe(HOUR);
    clock.at = new Date(until);
    timer.fire();
    expect(profitIn(notices)?.snoozedUntil).toBeNull();
    expect(lastWorkspace(notices).notifications.map((each) => each.text)).toEqual([
      "Back from snooze: Last week's sales",
    ]);
  });

  it("purges a delete no one took back once its window passes", async () => {
    const { mint, clock } = movableMint();
    const { store, run, timer } = await startLoop(undefined, mint);
    await run(init);
    await run({ kind: "delete", requestId: "r1", threadId: profit });
    expect(timer.delay).toBe(PURGE_AFTER_MS);
    clock.at = new Date(clock.at.getTime() + PURGE_AFTER_MS);
    timer.fire();
    expect(store.transcript(profit)).toBeUndefined();
  });

  it("purges every tombstone when it starts", async () => {
    const { store, run } = await startLoop();
    store.remove(profit, "2026-09-26T10:02:00.000Z");
    await run(init);
    expect(store.transcript(profit)).toBeUndefined();
  });

  it("caps the wait at a day, so a sleeping machine's clock is read again", async () => {
    const { notices, run, timer } = await startLoop();
    await run(init);
    await run(mark("r1", { snoozedUntil: "2026-10-20T09:00:00.000Z" }));
    expect(timer.delay).toBe(24 * HOUR);
    expect(beats(notices).at(-1)).toBe("done");
  });
});
