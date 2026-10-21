// When a snoozed thread wakes, in words: the hour unpadded, as the thread's own turn times
// are written, at the length each place has room for (ADR-128).
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const shortDayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const weekdayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

/** "9:00", "11:03": the hour unpadded, as the thread's own turn times are written. */
export function clock(at: Date): string {
  return `${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/**
 * When a snoozed thread wakes, on the machine's clock, at three lengths: "long" for a toast
 * ("Friday 2 October at 9:00"), "row" for a sidebar row ("Fri 2 Oct, 9:00"), "menu" for the
 * menu's right edge ("Fri 9:00").
 */
export function wakeText(at: Date, length: "long" | "row" | "menu"): string {
  if (length === "long") return `${dayFormat.format(at)} at ${clock(at)}`;
  if (length === "row") return `${shortDayFormat.format(at)}, ${clock(at)}`;
  return `${weekdayFormat.format(at)} ${clock(at)}`;
}
