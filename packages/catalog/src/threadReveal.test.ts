import { describe, expect, it } from "vitest";
import {
  centerScrollTop,
  jumpPlan,
  nudgeScrollTop,
  restedAtEnd,
  runwayFor,
  type Viewport,
} from "./threadReveal";

// A 600px thread scrolled to 400, with the thread's 20px padding at both ends.
const view: Viewport = {
  scrollTop: 400,
  height: 600,
  insetTop: 20,
  insetBottom: 20,
  maxScrollTop: 5000,
};

describe("nudgeScrollTop", () => {
  it("leaves a card alone when nothing is clipped", () => {
    expect(nudgeScrollTop({ top: 500, bottom: 900 }, view)).toBe(400);
  });

  it("rests a clipped card's bottom 20px above the compose box, like the thread's last card", () => {
    // The band ends at 400 + 600 - 20 = 980; a card ending at 1011 rises by 31px.
    expect(nudgeScrollTop({ top: 600, bottom: 1011 }, view)).toBe(431);
  });

  it("measures the gap from the dock when a card floats above the compose box", () => {
    expect(nudgeScrollTop({ top: 800, bottom: 1011 }, { ...view, insetBottom: 220 })).toBe(631);
  });

  it("shows a card taller than the band down to its bottom edge, so nothing is left hidden", () => {
    // Its bottom rests 20px above the compose box (1700 - 600 + 20); its top leaves the view.
    expect(nudgeScrollTop({ top: 700, bottom: 1700 }, view)).toBe(1120);
  });

  it("never scrolls up to reveal, which would move away from the click", () => {
    expect(nudgeScrollTop({ top: 100, bottom: 950 }, view)).toBe(400);
  });

  it("never scrolls past the end of the thread", () => {
    expect(nudgeScrollTop({ top: 600, bottom: 1011 }, { ...view, maxScrollTop: 420 })).toBe(420);
  });

  it("stops once the pressed control reaches the top of the band, to read on right under it", () => {
    // Work details pressed at 900, low in the band, opens a reply that now ends at 2400: showing
    // that bottom edge would scroll to 1820 and leave the header far above; it stops at 880,
    // where the header sits 20px under the band's top with what it opened below it.
    expect(nudgeScrollTop({ top: 700, bottom: 2400 }, view, 900)).toBe(880);
  });

  it("still rises only as far as the bottom edge needs when that comes first", () => {
    expect(nudgeScrollTop({ top: 600, bottom: 1011 }, view, 900)).toBe(431);
  });

  it("never scrolls up for a control already above the band's top", () => {
    expect(nudgeScrollTop({ top: 300, bottom: 1500 }, view, 350)).toBe(400);
  });
});

describe("centerScrollTop", () => {
  it("centers a jumped-to turn in the visible band", () => {
    // A 200px turn at 1000 in a 560px band sits 180px below the band's top.
    expect(centerScrollTop({ top: 1000, bottom: 1200 }, view)).toBe(800);
  });

  it("starts a turn taller than the band at the band's top", () => {
    expect(centerScrollTop({ top: 1000, bottom: 1700 }, view)).toBe(980);
  });

  it("never scrolls above the start of the thread", () => {
    expect(centerScrollTop({ top: 40, bottom: 140 }, view)).toBe(0);
  });
});

describe("runwayFor", () => {
  it("adds nothing when the centered scroll is within reach", () => {
    expect(runwayFor({ top: 1000, bottom: 1200 }, view)).toBe(0);
  });

  it("adds the room a turn near the end needs to land centered", () => {
    // Centering the turn at 1000 takes a scroll of 800; the thread reaches only 620.
    expect(runwayFor({ top: 1000, bottom: 1200 }, { ...view, maxScrollTop: 620 })).toBe(180);
  });

  it("rounds up to a whole pixel, so the clamp never lands a fraction short", () => {
    // A 201px turn centers at a scroll of 800.5: 180.5px short, so 181px of room.
    expect(runwayFor({ top: 1000, bottom: 1201 }, { ...view, maxScrollTop: 620 })).toBe(181);
  });

  it("adds nothing for a turn taller than the band, which starts at the top instead", () => {
    expect(runwayFor({ top: 1000, bottom: 1700 }, { ...view, maxScrollTop: 620 })).toBe(0);
  });

  it("adds nothing to a thread that fits its view: the glow marks the turn", () => {
    expect(runwayFor({ top: 300, bottom: 400 }, { ...view, scrollTop: 0, maxScrollTop: 0 })).toBe(
      0,
    );
  });

  it("reads the band from the dock, so a docked card still leaves the turn centered", () => {
    // A 360px band: centering the turn at 1000 takes 1000 - 20 - 80 = 900.
    expect(
      runwayFor({ top: 1000, bottom: 1200 }, { ...view, insetBottom: 220, maxScrollTop: 620 }),
    ).toBe(280);
  });
});

describe("restedAtEnd", () => {
  it("follows a thread that rested at its end as a turn grows", () => {
    // A chunk grew the last turn 29px: the reach went 463 → 492, the scroll stayed at 463.
    expect(restedAtEnd({ reach: 492, scrollTop: 463 }, 29)).toBe(true);
  });

  it("follows a thread a rounding pixel short of its end", () => {
    expect(restedAtEnd({ reach: 492, scrollTop: 462 }, 29)).toBe(true);
  });

  it("leaves a thread that rested 2px short of its end", () => {
    expect(restedAtEnd({ reach: 492, scrollTop: 461 }, 29)).toBe(false);
  });

  it("unpins a reader who scrolls up in the same frame a streaming reply grows", () => {
    // The wheel moved scrollTop 463 → 300 as a chunk grew the reach to 492: the resize sees
    // both, and only 29px of the 192px gap is the chunk's.
    expect(restedAtEnd({ reach: 492, scrollTop: 300 }, 29)).toBe(false);
  });

  it("follows a thread the browser clamped to its end as a turn above shrank", () => {
    // One turn shrank 20px and another grew 4px: the reach fell 433 → 417, clamping the scroll.
    expect(restedAtEnd({ reach: 417, scrollTop: 417 }, 4)).toBe(true);
  });

  it("follows a thread whose view got shorter as the compose box grew", () => {
    // The view lost 24px, so the reach went 463 → 487 with the scroll still at 463.
    expect(restedAtEnd({ reach: 487, scrollTop: 463 }, 24)).toBe(true);
  });
});

describe("jumpPlan", () => {
  // The band runs 420 to 980 at a scrollTop of 400.
  it("leaves a target already wholly in view where it is, for its highlight to point at", () => {
    expect(jumpPlan({ top: 500, bottom: 700 }, view, true)).toBe("stay");
    expect(jumpPlan({ top: 500, bottom: 700 }, view, false)).toBe("stay");
  });

  it("centers a user's message out of view", () => {
    expect(jumpPlan({ top: 2000, bottom: 2100 }, view, true)).toBe("center");
    expect(jumpPlan({ top: 100, bottom: 200 }, view, true)).toBe("center");
  });

  it("brings anything else below the view up just far enough to show it", () => {
    // Its bottom rests at the band's bottom: 1100 - 600 + 20.
    expect(jumpPlan({ top: 900, bottom: 1100 }, view, false)).toBe(520);
  });

  it("brings anything else above the view down to the band's top", () => {
    expect(jumpPlan({ top: 200, bottom: 300 }, view, false)).toBe(180);
  });

  it("never cuts off the top of a target taller than the band", () => {
    expect(jumpPlan({ top: 1200, bottom: 2400 }, view, false)).toBe(1180);
  });
});
