import { useRef, type PointerEvent } from "react";

// The ground: the row's own padding, the open space around its words, and the run of ground
// past it. A press there pans the row; a press on anything in a lane belongs to the lane.
function isGround(target: EventTarget | null, row: HTMLElement): boolean {
  return target === row || (target instanceof Element && target.matches("[data-ground]"));
}

/**
 * Panning by the ground (ADR-089): a press on the ground takes hold of the row, and the row
 * follows the pointer until it lets go.
 */
export function usePan(): {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
} {
  // Where the pan began: the pointer's x and the row's scroll at that moment.
  const origin = useRef<{ x: number; scrollLeft: number } | null>(null);
  return {
    onPointerDown: (event) => {
      const row = event.currentTarget;
      if (event.button !== 0 || !isGround(event.target, row)) return;
      origin.current = { x: event.clientX, scrollLeft: row.scrollLeft };
      row.setPointerCapture(event.pointerId);
      document.documentElement.dataset.dragging = "ground";
    },
    onPointerMove: (event) => {
      if (origin.current) {
        event.currentTarget.scrollLeft =
          origin.current.scrollLeft - (event.clientX - origin.current.x);
      }
    },
    onPointerUp: () => {
      origin.current = null;
      delete document.documentElement.dataset.dragging;
    },
  };
}

// A box that may scroll sideways, as far as a wheel needs to know it.
type Sideways = { scrollLeft: number; scrollWidth: number; clientWidth: number };

/** How far `box` can still scroll `dx`'s way, in px: 0 at that end, or when it does not overflow. */
export function roomToward(dx: number, box: Sideways): number {
  return dx < 0 ? box.scrollLeft : box.scrollWidth - box.clientWidth - box.scrollLeft;
}

/**
 * How far a wheel pans the row, or null when the row should leave it be. A sideways swipe pans
 * the row wherever it lands, unless something under the pointer scrolls that way itself (a wide
 * log or table); an up-and-down wheel pans it only off an open lane, which scrolls its own thread.
 */
export function panOf(
  wheel: { dx: number; dy: number },
  over: { openLane: boolean; sidewaysRoom: boolean },
): number | null {
  if (Math.abs(wheel.dx) > Math.abs(wheel.dy)) return over.sidewaysRoom ? null : wheel.dx;
  return over.openLane ? null : wheel.dy;
}

// The elements between the pointer and the row, innermost first.
function between(path: EventTarget[], row: HTMLElement): HTMLElement[] {
  const end = path.indexOf(row);
  return path
    .slice(0, end === -1 ? path.length : end)
    .filter((node) => node instanceof HTMLElement);
}

// An open lane scrolls its own thread; a collapsed lane's strip has nothing to scroll.
const isOpenLane = (node: HTMLElement): boolean =>
  node.tagName === "ARTICLE" && node.dataset.collapsed !== "true";

const scrollsX = (node: HTMLElement): boolean =>
  ["auto", "scroll"].includes(getComputedStyle(node).overflowX);

/**
 * Wheels and trackpad swipes over the row pan it (ADR-089). Listened for natively and not
 * passively, since a passive listener cannot keep the browser from handing a sideways swipe
 * over a lane to that lane's thread, which latches the whole gesture and goes nowhere.
 * @returns The function that stops listening.
 */
export function panByWheel(row: HTMLElement): () => void {
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey) return; // a pinch zooms the page
    const under = between(event.composedPath(), row); // → HTMLElement[], innermost first
    const by = panOf(
      { dx: event.deltaX, dy: event.deltaY },
      {
        openLane: under.some(isOpenLane),
        sidewaysRoom: under.some((node) => scrollsX(node) && roomToward(event.deltaX, node) > 0),
      },
    ); // → px to pan, or null
    if (by === null || by === 0) return;
    event.preventDefault();
    row.scrollLeft += by;
  };
  row.addEventListener("wheel", wheel, { passive: false });
  return () => {
    row.removeEventListener("wheel", wheel);
  };
}
