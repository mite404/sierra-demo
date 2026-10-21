import { describe, expect, it } from "vitest";
import { panOf, roomToward } from "./canvas-pan";

describe("roomToward", () => {
  const box = { scrollLeft: 40, scrollWidth: 500, clientWidth: 300 };

  it("measures what is left to scroll either way", () => {
    expect(roomToward(-10, box)).toBe(40);
    expect(roomToward(10, box)).toBe(160);
  });

  it("is 0 at an end, and for a box that does not overflow", () => {
    expect(roomToward(-10, { ...box, scrollLeft: 0 })).toBe(0);
    expect(roomToward(10, { ...box, scrollLeft: 200 })).toBe(0);
    expect(roomToward(10, { scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toBe(0);
  });
});

describe("panOf", () => {
  const ground = { openLane: false, sidewaysRoom: false };
  const lane = { openLane: true, sidewaysRoom: false };

  it("pans a sideways swipe wherever it lands, an open lane included", () => {
    expect(panOf({ dx: 30, dy: 4 }, ground)).toBe(30);
    expect(panOf({ dx: -30, dy: 4 }, lane)).toBe(-30);
  });

  it("leaves a sideways swipe to a log or table that scrolls that way itself", () => {
    expect(panOf({ dx: 30, dy: 0 }, { openLane: true, sidewaysRoom: true })).toBeNull();
  });

  it("turns an up-and-down wheel into a pan off a lane, and leaves it to an open lane's thread", () => {
    expect(panOf({ dx: 0, dy: 50 }, ground)).toBe(50);
    expect(panOf({ dx: 0, dy: 50 }, lane)).toBeNull();
  });

  it("reads a diagonal by its larger part", () => {
    expect(panOf({ dx: 20, dy: 20 }, lane)).toBeNull();
    expect(panOf({ dx: 21, dy: 20 }, lane)).toBe(21);
  });
});
