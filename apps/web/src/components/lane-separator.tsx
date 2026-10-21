import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { trackHintLine } from "./divider";

// The widths the gap sets (ADR-117): never narrower than a readable measure for the thread
// inside, and never wider than the widest canvas a 2560px screen lays out. Each is met in whole
// grid steps (`snapWidth`).
const LANE_MIN_PX = 320;
const LANE_MAX_PX = 1800;
// What an arrow does on a separator: resize the lane before it by some grid steps, or, with
// Shift, move that lane some slots.
type KeyAction = { kind: "resize"; steps: number } | { kind: "move"; step: number };
type Keys = Partial<Record<string, KeyAction>>;
const MOVE_KEYS: Keys = {
  "Shift+ArrowLeft": { kind: "move", step: -1 },
  "Shift+ArrowRight": { kind: "move", step: 1 },
};
const KEYS: Keys = {
  ArrowLeft: { kind: "resize", steps: -1 },
  ArrowRight: { kind: "resize", steps: 1 },
  ...MOVE_KEYS,
};

// What a gap is for: resizing and moving the lane before it, or, after a collapsed lane
// (ADR-133), only moving it, since a strip has no width to drag. Each says so in its name, its
// keys, its look and the range of widths it reports.
type Gap = { verb: string; keys: Keys; look: string; range: (width: number) => [number, number] };
const GAPS: Record<"resize" | "move", Gap> = {
  resize: {
    verb: "Resize or move",
    keys: KEYS,
    look: "drag-hint cursor-col-resize",
    range: (width) => [Math.min(LANE_MIN_PX, width), Math.max(LANE_MAX_PX, width)],
  },
  move: { verb: "Move", keys: MOVE_KEYS, look: "", range: (width) => [width, width] },
};

// The lane a separator resizes is the one before it in the row.
function laneBefore(separator: HTMLElement): HTMLElement | undefined {
  const lane = separator.previousElementSibling;
  return lane instanceof HTMLElement ? lane : undefined;
}

// One step of the canvas's dot grid. The gap is exactly one step wide (index.css), so it
// measures the step rather than keeping a second copy of it here.
function gridOf(separator: HTMLElement): number {
  return separator.getBoundingClientRect().width || 18;
}

/**
 * A lane width in whole steps of the dot grid, nearest first, inside the range the gap sets.
 * Every lane being whole steps wide is what keeps each gap's column of dots centred between the
 * lanes either side of it.
 */
export function snapWidth(px: number, step: number): number {
  const min = Math.ceil(LANE_MIN_PX / step) * step;
  const max = Math.floor(LANE_MAX_PX / step) * step;
  return Math.min(max, Math.max(min, Math.round(px / step) * step));
}

// The gap's value, as ARIA's window splitter gives one: the lane's width, inside the range the
// gap sets, widened to hold a width the lane has from elsewhere (a default column in a pane
// narrower than the minimum). A gap that only moves its lane has a range of just its width.
function splitterValue(width: number, gap: Gap) {
  const [min, max] = gap.range(width);
  return {
    "aria-valuenow": width,
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuetext": `${width} pixels wide`,
  };
}

// The width of the lane before the gap, in whole px, followed as it changes; null until it is
// first measured.
function useLaneWidth(gap: RefObject<HTMLDivElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const lane = gap.current === null ? undefined : laneBefore(gap.current);
    if (lane === undefined) return () => {};
    const measure = () => {
      setWidth(Math.round(lane.getBoundingClientRect().width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    return () => {
      observer.disconnect();
    };
  }, [gap]);
  return width;
}

// Dragging the gap: the width follows the pointer, and is kept once the pointer lets go. A gap
// that does not resize its lane takes no drag.
function useGapDrag(resizable: boolean, onResize: (px: number, kept: boolean) => void) {
  const [dragging, setDragging] = useState(false);
  // Where the drag began (the pointer's x and the lane's width then) and the width reached since.
  const origin = useRef<{ x: number; width: number; reached: number } | null>(null);
  const up = () => {
    const drag = origin.current;
    origin.current = null;
    setDragging(false);
    if (drag && drag.reached !== drag.width) onResize(drag.reached, true);
  };
  return {
    dragging,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      const lane = laneBefore(event.currentTarget);
      if (event.button !== 0 || !lane || !resizable) return;
      event.preventDefault();
      const width = lane.getBoundingClientRect().width;
      origin.current = { x: event.clientX, width, reached: width };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      trackHintLine(event);
      if (origin.current === null) return;
      const step = gridOf(event.currentTarget);
      const px = snapWidth(origin.current.width + event.clientX - origin.current.x, step);
      origin.current.reached = px;
      onResize(px, false);
    },
    onPointerUp: up,
    onPointerCancel: up,
  };
}

// The key as a gap's keys name it: "ArrowLeft", or "Shift+ArrowLeft" with Shift held.
function keyName(event: KeyboardEvent<HTMLDivElement>): string {
  return event.shiftKey ? `Shift+${event.key}` : event.key;
}

// Arrows resize the lane before the gap a grid step at a time, kept at once; with Shift they move it a slot instead.
// A gap's keys may only move its lane, as after a collapsed one.
function keyOn(
  event: KeyboardEvent<HTMLDivElement>,
  keys: Keys,
  onResize: (px: number, kept: boolean) => void,
  onMove: (step: number) => void,
): void {
  const action = keys[keyName(event)];
  const lane = laneBefore(event.currentTarget);
  if (action === undefined || lane === undefined) return;
  event.preventDefault();
  if (action.kind === "move") onMove(action.step);
  else {
    const step = gridOf(event.currentTarget);
    onResize(snapWidth(lane.getBoundingClientRect().width + action.steps * step, step), true);
  }
}

/**
 * The gap after a lane, which drags the lane's right edge (ADR-089). The hint line shows while
 * the pointer is on it; pointer capture keeps the drag alive once the pointer outruns the gap.
 * The width follows the pointer in whole steps of the dot grid and is kept when it lets go
 * (`kept`); an arrow key keeps a step at once, and with Shift moves the lane a slot instead. Focused, it says the lane's
 * width, as a window splitter does. After a collapsed lane (ADR-133) it only moves the lane:
 * a strip has no width to drag, so it says its fixed width and draws no hint.
 */
export function LaneSeparator({
  title,
  resizable,
  style,
  onResize,
  onMove,
}: {
  title: string;
  /** Whether the gap resizes the lane; false for a collapsed lane, which it only moves. */
  resizable: boolean;
  style: CSSProperties;
  onResize: (px: number, kept: boolean) => void;
  onMove: (step: number) => void;
}) {
  const kind = GAPS[resizable ? "resize" : "move"];
  const { dragging, ...handlers } = useGapDrag(resizable, onResize);
  const gap = useRef<HTMLDivElement>(null);
  const width = useLaneWidth(gap);
  const value = width === null ? {} : splitterValue(width, kind);
  /* oxlint-disable jsx-a11y/prefer-tag-over-role -- a separator that takes focus and a drag is a widget; an hr can do neither */
  return (
    <div
      ref={gap}
      role="separator"
      aria-orientation="vertical"
      aria-label={`${kind.verb} ${title}`}
      {...value}
      tabIndex={0}
      data-dragging={dragging || undefined}
      className={`lane-shift relative w-(--canvas-grid) shrink-0 outline-none ${kind.look}`}
      style={style}
      {...handlers}
      onKeyDown={(event) => {
        keyOn(event, kind.keys, onResize, onMove);
      }}
    />
  );
  /* oxlint-enable jsx-a11y/prefer-tag-over-role */
}
