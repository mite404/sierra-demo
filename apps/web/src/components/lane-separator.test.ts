import { describe, expect, it } from "vitest";
import { snapWidth } from "./lane-separator";

describe("snapWidth", () => {
  it("rounds a width to the nearest whole grid step", () => {
    expect(snapWidth(440, 18)).toBe(432);
    expect(snapWidth(442, 18)).toBe(450);
    expect(snapWidth(558, 18)).toBe(558);
  });

  it("keeps to the range in whole steps: never under 320px, never over 1800px", () => {
    expect(snapWidth(100, 18)).toBe(324);
    expect(snapWidth(5000, 18)).toBe(1800);
  });
});
