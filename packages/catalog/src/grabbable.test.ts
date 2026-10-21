import { describe, expect, it } from "vitest";
import { continuesClicks, pointInBoxes } from "./grabbable";

const line = { left: 100, right: 300, top: 40, bottom: 60 };
const nextLine = { left: 100, right: 180, top: 62, bottom: 82 };

describe("pointInBoxes", () => {
  it("finds a point on either line of a highlight", () => {
    expect(pointInBoxes([line, nextLine], 150, 50)).toBe(true);
    expect(pointInBoxes([line, nextLine], 150, 70)).toBe(true);
  });
  it("misses a point beside the highlight, but forgives the edge by two pixels", () => {
    expect(pointInBoxes([line, nextLine], 250, 70)).toBe(false);
    expect(pointInBoxes([line], 302, 50)).toBe(true);
    expect(pointInBoxes([line], 303, 50)).toBe(false);
  });
  it("finds nothing when there is no highlight", () => {
    expect(pointInBoxes([], 150, 50)).toBe(false);
  });
});

describe("continuesClicks", () => {
  const click = { x: 100, y: 50, at: 1000 };
  it.each([
    ["a press on the spot of the last click, soon after", 101, 52, 1300, true],
    ["a press half a second after the click", 100, 50, 1500, true],
    ["a press later than that", 100, 50, 1501, false],
    ["a press more than a few pixels away", 105, 50, 1100, false],
  ])("%s", (_, x, y, at, continues) => {
    expect(continuesClicks(click, x, y, at)).toBe(continues);
  });
  it("finds no click to continue before the first one", () => {
    expect(continuesClicks(undefined, 100, 50, 1000)).toBe(false);
  });
});
