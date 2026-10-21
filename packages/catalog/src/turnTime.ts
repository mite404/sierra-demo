// When a turn arrived, and how the thread says so: the latest reply carries a stamp that reads
// "just now" and then moves in 20-minute steps, so a reader glancing back knows how fresh the
// answer is without a clock to read (Ethan). A user's turn carries none: the request is theirs,
// and the reply's stamp dates the exchange.

// How far apart two stamps are, at least.
const STEP_MS = 20 * 60_000;
const HOUR_MS = 60 * 60_000;

/** The instant a turn's `time` names, or undefined for a time kept as a clock reading ("9:02"). */
export function instantOf(time: string): number | undefined {
  const parsed = Date.parse(time);
  return Number.isNaN(parsed) || !/^\d{4}-/u.test(time) ? undefined : parsed;
}

/**
 * How long ago `at` was, in 20-minute steps: "just now" within the first step, then "20m ago",
 * "40m ago", "1h ago", "1h 20m ago" and so on. A future `at` reads as just now.
 */
export function relativeStamp(at: number, now: number): string {
  const steps = Math.floor(Math.max(now - at, 0) / STEP_MS); // → whole 20-minute steps
  if (steps === 0) return "just now";
  const ms = steps * STEP_MS;
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = (ms % HOUR_MS) / 60_000;
  if (hours === 0) return `${minutes}m ago`;
  return minutes === 0 ? `${hours}h ago` : `${hours}h ${minutes}m ago`;
}

/**
 * What the latest reply's stamp says at `now`: how long ago for a turn that knows its instant,
 * or the clock reading the thread stored for one that does not.
 */
export function stampOf(time: string, now: number): string {
  const at = instantOf(time);
  return at === undefined ? time : relativeStamp(at, now);
}

/** A turn's local 12-hour clock reading with AM/PM, whether stored as an instant or H:MM. */
export function timeLabel(time: string): string {
  const at = instantOf(time);
  let date: Date;
  if (at === undefined) {
    const clock = /^([01]?\d|2[0-3]):([0-5]\d)$/u.exec(time);
    if (!clock) return time;
    date = new Date(2000, 0, 1, Number(clock[1]), Number(clock[2]));
  } else {
    date = new Date(at);
  }
  // Keep the reader's time zone, but use the English UI's AM/PM clock in every locale.
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
