import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AgentTree } from "./AgentTree";
import "./tokens.css";

type Box = { x: number; y: number; width: number; height: number };
type BaseFrame = { top: number; opacity: number };
type ScrollFrame = { baseTop: number; branchTop: number; branchOpacity: number };

let host: HTMLElement;
let root: Root;

function glyph(): HTMLElement {
  const found = host.querySelector<HTMLElement>(".agent-tree");
  if (!found) throw new Error("no agent tree rendered");
  return found;
}

function pills(): HTMLElement[] {
  return [...glyph().querySelectorAll<HTMLElement>(".agent-tree-pill")];
}

// Holds every pill's animation at one moment of the loop.
function seek(ms: number): void {
  for (const animation of glyph().getAnimations({ subtree: true })) {
    animation.pause();
    animation.currentTime = ms;
  }
}

// Each pill's box, in CSS pixels from the glyph's own corner, top to bottom.
function pillBoxes(): Box[] {
  const origin = glyph().getBoundingClientRect();
  return pills().map((pill) => {
    const { x, y, width, height } = pill.getBoundingClientRect();
    return { x: x - origin.x, y: y - origin.y, width, height };
  });
}

// Where the base sits and how visible it is at one moment of the loop.
function baseAt(ms: number): BaseFrame {
  seek(ms);
  const base = pills().at(2);
  if (!base) throw new Error("no base pill");
  const top = base.getBoundingClientRect().y - glyph().getBoundingClientRect().y;
  return { top, opacity: Number(getComputedStyle(base).opacity) };
}

// Where the base and the top branch sit, and how visible the branch is, at one moment of the
// scroll.
function scrollAt(ms: number): ScrollFrame {
  const { top } = baseAt(ms);
  const branch = pills().at(0);
  if (!branch) throw new Error("no top branch");
  return {
    baseTop: top,
    branchTop: branch.getBoundingClientRect().y - glyph().getBoundingClientRect().y,
    branchOpacity: Number(getComputedStyle(branch).opacity),
  };
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  root.unmount();
  host.remove();
});

it("draws Kay's three pills on whole pixels: left branch, right branch, full base", () => {
  flushSync(() => {
    root.render(<AgentTree />);
  });
  seek(700); // 35% in: the scroll is over and every pill is home

  expect(pillBoxes()).toEqual([
    { x: 2, y: 1, width: 7, height: 3 },
    { x: 5, y: 5, width: 7, height: 3 },
    { x: 0, y: 9, width: 12, height: 3 },
  ]);
});

it("scrolls the base fully under the bottom edge, and brings it home before it shows again", () => {
  flushSync(() => {
    root.render(<AgentTree duration={1000} />);
  });

  expect(baseAt(0)).toEqual({ top: 9, opacity: 1 }); // home, solid: the beat's last stretch
  expect(baseAt(320)).toEqual({ top: 13, opacity: 1 }); // past the 12px edge, still solid
  expect(baseAt(340)).toEqual({ top: 9, opacity: 0 }); // home again, clear
  expect(baseAt(900)).toEqual({ top: 9, opacity: 1 }); // faded back in for the beat
});

it("scrolls the top branch in first, and the base out once the branch is on its way", () => {
  flushSync(() => {
    root.render(<AgentTree duration={1000} />);
  });

  // before the move: the branch waits clear, fully above the top edge
  expect(scrollAt(0)).toEqual({ baseTop: 9, branchTop: -3, branchOpacity: 0 });
  const lead = scrollAt(80); // → the base's last frame home, a third into the branch's entry
  expect(lead.baseTop).toBe(9);
  expect(lead.branchTop).toBeGreaterThan(-3); // already peeking past the top edge
  expect(lead.branchOpacity).toBeGreaterThan(0.2); // and visibly lit
  const half = scrollAt(200); // → the halfway frame of the base's scroll
  expect(half.baseTop).toBeCloseTo(11); // 2px down, half under the edge
  expect(half.branchOpacity).toBeGreaterThan(0.9); // the branch nearly landed, nearly solid
  // the base is past the bottom edge with the branch home
  expect(scrollAt(320)).toMatchObject({ baseTop: 13, branchTop: 1 });
});
