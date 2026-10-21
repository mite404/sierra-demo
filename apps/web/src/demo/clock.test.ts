import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClock } from "./clock";

// A wait's promise with a flag that says whether it has resolved yet.
function watch(promise: Promise<void>): { done: () => boolean } {
  let resolved = false;
  void promise.finally(() => {
    resolved = true;
  });
  return { done: () => resolved };
}

const clock = () => createClock({ now: () => Date.now() });

describe("the demo clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits the script's time at 1x", async () => {
    const wait = watch(clock().wait(200));
    await vi.advanceTimersByTimeAsync(199);
    expect(wait.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.done()).toBe(true);
  });

  it("waits half as long at 2x", async () => {
    const fast = clock();
    fast.setRate(2);
    const wait = watch(fast.wait(200));
    await vi.advanceTimersByTimeAsync(100);
    expect(wait.done()).toBe(true);
  });

  // A change lands at the end of the slice in flight, 50ms at most, never at the wait's end.
  it("counts a rate change from the slice after it lands", async () => {
    const shifting = clock();
    const wait = watch(shifting.wait(200));
    await vi.advanceTimersByTimeAsync(100);
    shifting.setRate(2);
    await vi.advanceTimersByTimeAsync(49);
    expect(wait.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(26);
    expect(wait.done()).toBe(true);
  });
});

describe("the demo clock, paused, stopped and watched", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds every wait while paused", async () => {
    const held = clock();
    const wait = watch(held.wait(200));
    await vi.advanceTimersByTimeAsync(100);
    held.pause();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(wait.done()).toBe(false);
    held.resume();
    await vi.advanceTimersByTimeAsync(149);
    expect(wait.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.done()).toBe(true);
  });

  it("resolves early and silently on abort", async () => {
    const stop = new AbortController();
    const wait = watch(clock().wait(10_000, stop.signal));
    await vi.advanceTimersByTimeAsync(10);
    stop.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(wait.done()).toBe(true);
  });

  it("tells its listeners of each change with a new snapshot, and only then", () => {
    const told = clock();
    const listener = vi.fn<() => void>();
    told.subscribe(listener);
    const before = told.state();
    told.pause();
    told.pause();
    told.setRate(2);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(told.state()).toEqual({ rate: 2, paused: true });
    expect(told.state()).not.toBe(before);
  });
});
