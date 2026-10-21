import { describe, expect, it } from "vitest";
import { wakeText } from "./wake-text";

// A time on the machine's own clock, so the expectations hold in any time zone.
const on = (month: number, day: number, hour: number, minute: number) =>
  new Date(2026, month - 1, day, hour, minute);

describe("wakeText writes the hour unpadded, as turn times are", () => {
  it.each<["long" | "row" | "menu", string]>([
    ["long", "Friday 2 October at 7:05"],
    ["row", "Fri 2 Oct, 7:05"],
    ["menu", "Fri 7:05"],
  ])("at %s length", (length, expected) => {
    expect(wakeText(on(10, 2, 7, 5), length)).toBe(expected);
  });
});
