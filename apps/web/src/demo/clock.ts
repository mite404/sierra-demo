/** How fast the demo plays: as written, or twice as fast. */
export type Rate = 1 | 2;

/** The clock's settings, the same object until one of them changes (useSyncExternalStore). */
export type ClockState = { rate: Rate; paused: boolean };

/**
 * The scripted demo's one clock: every pause in a script and every keystroke the player types
 * waits on it, so Pause holds the whole demo and 2x speeds all of it.
 */
export type Clock = {
  state(): ClockState;
  /** Calls `listener` after every change to `state()`; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /**
   * Resolves once `ms` of script time has passed: `ms / rate` of wall time while unpaused, so a
   * rate change or a pause mid-wait counts from then on. An abort resolves it early, silently.
   */
  wait(ms: number, signal?: AbortSignal): Promise<void>;
  setRate(rate: Rate): void;
  pause(): void;
  resume(): void;
};

/** What the clock measures time with; tests pass fakes. */
export type ClockDeps = {
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

// A wait sleeps in slices this long at most, so a pause or a rate change lands within one.
const SLICE_MS = 50;

// Resolves after `ms` of wall time, or early and silently on abort.
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

// A wait of `ms` script time on the settings `settings()` reads afresh each slice, so a pause
// or a rate change mid-wait counts from the next slice on.
async function waitOn(
  settings: () => ClockState,
  { now, nap }: { now: () => number; nap: typeof sleep },
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  let left = ms; // → script ms still to pass
  while (left > 0) {
    if (signal?.aborted === true) return;
    const { rate, paused } = settings();
    const slice = paused ? SLICE_MS : Math.min(SLICE_MS, left / rate);
    const start = now();
    // oxlint-disable-next-line no-await-in-loop -- each slice counts once it has passed
    await nap(slice, signal);
    // A slice that began or ended paused counts for nothing: paused time never moves a script
    // on. A timer never fires early, so a clock that did not move still counts the slice.
    if (!paused && !settings().paused) left -= Math.max(now() - start, slice) * rate;
  }
}

/** A running clock at 1x, unpaused. */
export function createClock({
  now = () => performance.now(),
  sleep: nap = sleep,
}: ClockDeps = {}): Clock {
  let current: ClockState = { rate: 1, paused: false };
  const listeners = new Set<() => void>();
  const change = (next: Partial<ClockState>) => {
    const merged = { ...current, ...next };
    if (merged.rate === current.rate && merged.paused === current.paused) return;
    current = merged;
    for (const listener of listeners) listener();
  };
  return {
    state: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    wait: (ms, signal) => waitOn(() => current, { now, nap }, ms, signal),
    setRate: (rate) => {
      change({ rate });
    },
    pause: () => {
      change({ paused: true });
    },
    resume: () => {
      change({ paused: false });
    },
  };
}
