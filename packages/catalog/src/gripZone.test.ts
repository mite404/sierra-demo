import { describe, expect, it } from "vitest";
import { GRIP_RADIUS, inGripZone } from "./gripZone";

// A lane's title bar, 400px wide and 54px tall, its grip at (200, 25).
const bar = { left: 0, top: 0, width: 400, height: 54 };

describe("inGripZone", () => {
  it("takes the grip's centre, 2px above the bar's middle", () => {
    expect(inGripZone(bar, 200, 25)).toBe(true);
  });

  it("reaches 25px from the centre in every direction, and no further", () => {
    expect(inGripZone(bar, 200 + GRIP_RADIUS, 25)).toBe(true);
    expect(inGripZone(bar, 200 - GRIP_RADIUS - 1, 25)).toBe(false);
    expect(inGripZone(bar, 218, 43)).toBe(false); // 18px over and 18px down: 25.5px away
  });

  it("leaves the bar's ends to its buttons", () => {
    expect(inGripZone(bar, 12, 25)).toBe(false);
    expect(inGripZone(bar, 380, 25)).toBe(false);
  });
});
