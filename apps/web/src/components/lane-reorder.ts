import { inGripZone } from "@yaklabs/catalog/gripZone";
import type { LaneId } from "@yaklabs/runtime";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { landingIndex, shiftFor, slotLeft, type Slot } from "../canvas";

// How far a grip travels before its lane lifts, so a click stays a click.
const LIFT_PX = 6;

// A lane on its way somewhere (ADR-089): which, from which slot, the slot it would land in,
// and how far the pointer has carried it.
type Move = { id: LaneId; from: number; to: number; dx: number; dy: number };

// What a drag measured as it began, so the lift itself never moves the targets: every lane's
// slot along the row, the pointer's place, and the lane's box on screen. The lane itself is
// kept for the copy that floats under the pointer.
type Lift = {
  id: LaneId;
  from: number;
  x: number;
  y: number;
  slots: Slot[];
  gap: number;
  box: DOMRect;
  lane: HTMLElement;
};

// A lane in hand: what was measured when its grip was pressed and, once the lane has travelled
// far enough to lift, where it is on its way to.
type Drag = { lift: Lift; move: Move | null };

/** What a lane's element listens with while the reorder can take hold of it. */
export type LaneHandlers = {
  onPointerDownCapture: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
};

// What takes hold of a lane: the grip on the title bar of what it shows, within GRIP_RADIUS of
// its centre (Ethan), or the whole of a collapsed lane (ADR-133), its strip's title included.
// The title of an open lane is for renaming, and any button keeps its job.
const BAR = ".thread-header, .card-heading";
const NOT_GRIP = "h2, .card-heading-text, input, button, [role='menu']";

// The open lane's own title bar a press landed on, outside its title and its buttons; null for
// a press anywhere else, a card's header inside a thread lane's turns included, which carries
// that card on its own.
function barOf(target: EventTarget | null): Element | null {
  if (!(target instanceof Element) || target.closest(NOT_GRIP) !== null) return null;
  if (target.closest(".thread-scroll") !== null) return null;
  return target.closest(BAR);
}

function isGrip(event: PointerEvent<HTMLElement>): boolean {
  const { target, clientX, clientY } = event;
  if (target instanceof Element && target.closest('[data-collapsed="true"]') !== null) {
    return target.closest("button") === null;
  }
  const bar = barOf(target);
  return bar !== null && inGripZone(bar.getBoundingClientRect(), clientX, clientY);
}

// A press on an open lane's title bar off its grip: it takes nothing, so neither the lane nor
// the card in it (CardHeader's carry) lifts where the hand does not show.
function offGrip(event: PointerEvent<HTMLElement>): boolean {
  const bar = barOf(event.target);
  return bar !== null && !inGripZone(bar.getBoundingClientRect(), event.clientX, event.clientY);
}

// Every lane's slot along the row, in the row's own coordinates (its scroll included).
function measureSlots(row: HTMLElement): Slot[] {
  const rowBox = row.getBoundingClientRect();
  return [...row.querySelectorAll(":scope > article")].map((el) => {
    const box = el.getBoundingClientRect();
    return { left: box.left - rowBox.left + row.scrollLeft, width: box.width };
  });
}

// The drag as the pointer reaches (x, y): unchanged until the lane has travelled enough to lift.
function dragTo(drag: Drag, x: number, y: number): Drag {
  const dx = x - drag.lift.x;
  const dy = y - drag.lift.y;
  if (drag.move === null && Math.abs(dx) < LIFT_PX && Math.abs(dy) < LIFT_PX) return drag;
  const { id, from, slots } = drag.lift;
  return { ...drag, move: { id, from, to: landingIndex(slots, from, dx), dx, dy } };
}

// A snapshot's live parts: what was typed and how far each part had scrolled, which cloning
// the DOM leaves behind. `to` has to be in the document already for the scrolling to take.
function syncSnapshot(from: HTMLElement, to: HTMLElement): void {
  const sources = from.querySelectorAll("*");
  const targets = to.querySelectorAll("*");
  sources.forEach((source, i) => {
    const target = targets[i];
    if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
      target.value = source.value;
    }
    if (source.scrollTop !== 0) target.scrollTop = source.scrollTop;
  });
}

// A copy of the lane, fixed to the screen where the lane was, to float under the pointer.
function floatingCopyOf(lift: Lift): HTMLElement | null {
  const clone = lift.lane.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  delete clone.dataset.lifted;
  clone.dataset.ghost = "";
  clone.setAttribute("aria-hidden", "true");
  clone.classList.add("lane-ghost");
  clone.style.left = `${lift.box.left}px`;
  clone.style.top = `${lift.box.top}px`;
  clone.style.width = `${lift.box.width}px`;
  clone.style.height = `${lift.box.height}px`;
  return clone;
}

// The copy of the lane that floats under the pointer while the lane itself waits, dimmed, in
// the slot it would take. It appears when the lane lifts and moves by however far the pointer
// has gone since.
function useFloatingCopy(lift: Lift | null, move: Move | null): void {
  const copy = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clone = lift && floatingCopyOf(lift);
    if (!clone) return () => {};
    document.body.append(clone);
    syncSnapshot(lift.lane, clone);
    document.documentElement.dataset.dragging = "lane";
    copy.current = clone;
    return () => {
      clone.remove();
      delete document.documentElement.dataset.dragging;
      copy.current = null;
    };
  }, [lift]);

  useEffect(() => {
    if (copy.current && move) {
      copy.current.style.transform = `translate(${move.dx}px, ${move.dy}px)`;
    }
  }, [move]);
}

// The lifted lane and its move, or nothing while the pointer is still within the dead zone.
function liftedOf(drag: Drag | null): [Lift | null, Move | null] {
  return drag?.move ? [drag.lift, drag.move] : [null, null];
}

// The open lane's title bar whose grip the pointer is over, by the same measure a press takes
// hold by; null anywhere else.
function gripUnder(event: PointerEvent<HTMLElement>): HTMLElement | null {
  const bar = barOf(event.target);
  if (!(bar instanceof HTMLElement)) return null;
  return inGripZone(bar.getBoundingClientRect(), event.clientX, event.clientY) ? bar : null;
}

// Marks the one bar in `lane` whose grip the pointer is over, so its dots show only where the
// hand does and a press would take hold (Ethan); null clears them all.
function markGrip(lane: HTMLElement, bar: HTMLElement | null): void {
  for (const marked of lane.querySelectorAll<HTMLElement>("[data-grip-near]")) {
    if (marked !== bar) delete marked.dataset.gripNear;
  }
  if (bar !== null) bar.dataset.gripNear = "";
}

// Follows the pointer over a lane, marking the grip it is over while the reorder is on.
const trackGrip =
  (enabled: boolean) =>
  (event: PointerEvent<HTMLElement>): void => {
    if (enabled) markGrip(event.currentTarget, gripUnder(event));
  };

// Clears a lane's grip as the pointer leaves it.
const leaveGrip = (event: PointerEvent<HTMLElement>): void => {
  markGrip(event.currentTarget, null);
};

// Whether a press takes hold of its lane: the primary button on a grip, unclaimed. A press
// something nearer already claimed is theirs: a card's header inside a thread lane arms a
// carry, which claims its press (preventDefault) rather than stopping it.
function takesLane(event: PointerEvent<HTMLElement>): boolean {
  return event.button === 0 && !event.isDefaultPrevented() && isGrip(event);
}

// Stops a press on an open lane's title bar off its grip before the lane's lift or a card's
// carry hears it, while the reorder is on.
const holdOffGrip =
  (enabled: boolean) =>
  (event: PointerEvent<HTMLElement>): void => {
    if (enabled && offGrip(event)) event.stopPropagation();
  };

// What a press on a lane measured, or nothing when it does not take hold of the lane.
function liftAt(event: PointerEvent<HTMLElement>, id: LaneId, index: number): Lift | null {
  const row = event.currentTarget.closest("section");
  if (row === null || !takesLane(event)) return null;
  const lane = event.currentTarget;
  return {
    id,
    from: index,
    x: event.clientX,
    y: event.clientY,
    slots: measureSlots(row),
    gap: parseFloat(getComputedStyle(row).getPropertyValue("--canvas-grid")),
    box: lane.getBoundingClientRect(),
    lane,
  };
}

// Escape puts a lifted lane back where it was; the pointer letting go then moves nothing.
function usePutBack(lifted: boolean, setDrag: (drag: Drag | null) => void): void {
  useEffect(() => {
    const putBack = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDrag(null);
    };
    if (lifted) window.addEventListener("keydown", putBack);
    return () => {
      window.removeEventListener("keydown", putBack);
    };
  }, [lifted, setDrag]);
}

/**
 * Reordering by a lane's grip (ADR-089): past a small dead zone the lane lifts, a copy of it
 * rides the pointer, the lane itself waits dimmed in the slot it would take and the lanes it
 * passes step aside; Escape puts it back. The lane handlers go on each lane's element.
 * @param enabled Whether a grip takes hold of its lane at all; off makes the canvas view-only,
 * as on a phone (ADR-122), where the row still scrolls but nothing lifts.
 */
export function useReorder(
  onMove: (id: LaneId, to: number) => void,
  enabled = true,
): {
  drag: Drag | null;
  laneFor: (id: LaneId, index: number) => LaneHandlers;
} {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [lift, move] = liftedOf(drag);
  useFloatingCopy(lift, move);

  usePutBack(move !== null, setDrag);

  const laneFor = (id: LaneId, index: number): LaneHandlers => ({
    onPointerDownCapture: holdOffGrip(enabled),
    onPointerDown: (event) => {
      if (!enabled) return;
      const pressed = liftAt(event, id, index);
      if (!pressed) return;
      event.preventDefault();
      setDrag({ lift: pressed, move: null });
      pressed.lane.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      trackGrip(enabled)(event);
      const { clientX, clientY } = event;
      setDrag((current) => current && dragTo(current, clientX, clientY));
    },
    onPointerLeave: leaveGrip,
    onPointerUp: () => {
      if (drag?.move && drag.move.to !== drag.move.from) onMove(drag.move.id, drag.move.to);
      setDrag(null);
    },
    onPointerCancel: () => {
      setDrag(null);
    },
  });

  return { drag, laneFor };
}

/**
 * How far lane `index` is displaced while a move is under way: the lifted lane to the slot it
 * would take, the lanes it passes by its room. A CSS transform, or none.
 */
export function displacement(drag: Drag | null, index: number): string {
  if (!drag?.move) return "";
  const { slots, gap } = drag.lift;
  const { from, to } = drag.move;
  const px =
    index === from
      ? slotLeft(slots, from, to) - slots[from].left
      : shiftFor(slots, from, to, index, gap);
  return `translateX(${px}px)`;
}
