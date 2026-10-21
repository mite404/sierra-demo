// The six-dot grip in the middle of a lane's title bar (the web app's index.css) and of a card's
// header in a thread (primitives.css): where it sits and how far from it the pointer wakes it,
// so the dots, the grab hand and a lane's lift agree on one place (Ethan).

/** How far from the grip's centre the grab hand shows and a press takes the lane, in px. */
export const GRIP_RADIUS = 25;

// The grip sits on the title's capitals, this far above the bar's middle (index.css).
const GRIP_LIFT = 2;

// A box on screen, as getBoundingClientRect gives it.
type Box = { left: number; top: number; width: number; height: number };

/** Whether the point (x, y) lies within GRIP_RADIUS of the grip at the middle of `bar`. */
export function inGripZone(bar: Box, x: number, y: number): boolean {
  const centreX = bar.left + bar.width / 2;
  const centreY = bar.top + bar.height / 2 - GRIP_LIFT;
  return Math.hypot(x - centreX, y - centreY) <= GRIP_RADIUS;
}
