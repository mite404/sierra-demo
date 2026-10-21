import type { Mint } from "./mint";
import type { Store } from "./store";

/** Runs `callback` once after `delay` ms and returns its cancel. */
export type Schedule = (delay: number, callback: () => void) => () => void;

/** A store's settling passes: one now, and the one timer for the next. */
export type Settler = {
  /**
   * Runs a pass now and sets the timer for the next one due, replacing any earlier timer.
   * @param starting Whether the page just opened, when every tombstone goes.
   * @returns Whether the workspace changed.
   * @throws When the store's pass fails; the timer is left as it was.
   */
  settle(starting: boolean): boolean;
};

// The longest a settler waits between passes: a machine that slept has a timer that fired late
// or not at all, so the clock is read again at least daily.
const MAX_WAIT = 24 * 60 * 60 * 1000;

/** `setTimeout`, as a `Schedule`. */
export function timeoutSchedule(delay: number, callback: () => void): () => void {
  const timer = setTimeout(callback, delay);
  return () => {
    clearTimeout(timer);
  };
}

/**
 * The settling passes for one store (ADR-128 to ADR-131): a snooze due wakes, an idle main
 * archives, a tombstone past its window goes, an expired share drops. After each pass it waits
 * for the next moment something falls due, at most a day. A pass the timer runs that changes
 * the workspace calls `onChange`; one that fails is logged, and the next write settles again.
 */
export function createSettler(deps: {
  store: Store;
  mint: Mint;
  schedule: Schedule;
  onChange: () => void;
}): Settler {
  const { store, mint, schedule, onChange } = deps;
  let cancel: (() => void) | undefined;

  const settle = (starting: boolean): boolean => {
    const now = mint.now();
    const { changed, next } = store.settle(now.toISOString(), starting);
    cancel?.();
    cancel = undefined;
    if (next !== null) {
      const delay = Math.min(Math.max(Date.parse(next) - now.getTime(), 0), MAX_WAIT);
      cancel = schedule(delay, () => {
        cancel = undefined;
        try {
          if (settle(false)) onChange();
        } catch (error) {
          // oxlint-disable-next-line no-console -- no request to fail; the next write settles again
          console.warn("[runtime] Settling failed.", error);
        }
      });
    }
    return changed;
  };

  return { settle };
}
