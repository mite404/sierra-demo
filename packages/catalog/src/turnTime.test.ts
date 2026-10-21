import { describe, expect, it } from "vitest";
import { instantOf, relativeStamp, stampOf, timeLabel } from "./turnTime";

const AT = Date.UTC(2026, 8, 30, 9, 0);
const MINUTE = 60_000;

describe("relativeStamp", () => {
  it("reads just now for the first twenty minutes, a future instant included", () => {
    expect(relativeStamp(AT, AT)).toBe("just now");
    expect(relativeStamp(AT, AT + 19 * MINUTE)).toBe("just now");
    expect(relativeStamp(AT, AT - MINUTE)).toBe("just now");
  });

  it("then moves in twenty-minute steps", () => {
    expect(relativeStamp(AT, AT + 20 * MINUTE)).toBe("20m ago");
    expect(relativeStamp(AT, AT + 39 * MINUTE)).toBe("20m ago");
    expect(relativeStamp(AT, AT + 40 * MINUTE)).toBe("40m ago");
    expect(relativeStamp(AT, AT + 60 * MINUTE)).toBe("1h ago");
    expect(relativeStamp(AT, AT + 85 * MINUTE)).toBe("1h 20m ago");
    expect(relativeStamp(AT, AT + 26 * 60 * MINUTE)).toBe("26h ago");
  });
});

describe("instantOf and stampOf", () => {
  it("reads an ISO time and leaves a clock reading alone", () => {
    expect(instantOf("2026-09-30T09:00:00.000Z")).toBe(AT);
    expect(instantOf("9:02")).toBeUndefined();
    expect(instantOf("now")).toBeUndefined();
    expect(stampOf("2026-09-30T09:00:00.000Z", AT + 45 * MINUTE)).toBe("40m ago");
    expect(stampOf("9:02", AT)).toBe("9:02");
  });

  it.each([
    ["0:07", "12:07 AM"],
    ["9:02", "9:02 AM"],
    ["12:00", "12:00 PM"],
    ["13:07", "1:07 PM"],
    ["23:59", "11:59 PM"],
  ])("labels stored clock %s as %s", (time, expected) => {
    expect(timeLabel(time)).toBe(expected);
  });

  it("labels an instant on the reader's local 12-hour clock", () => {
    expect(timeLabel(new Date(2026, 8, 30, 13, 7).toISOString())).toBe("1:07 PM");
  });
});
