/** Where a lane sits along the row and how wide it is, in the row's own px. */
export type Slot = { left: number; width: number };

function centre(slot: Slot): number {
  return slot.left + slot.width / 2;
}

/**
 * The index a lane dragged `dx` px from `from` would land at: it passes a neighbour once its
 * centre crosses the neighbour's, and not before.
 */
export function landingIndex(slots: Slot[], from: number, dx: number): number {
  const dragged = centre(slots[from]) + dx;
  let to = from;
  for (let i = from + 1; i < slots.length; i++) if (dragged > centre(slots[i])) to = i;
  for (let i = from - 1; i >= 0; i--) if (dragged < centre(slots[i])) to = i;
  return to;
}

/** How far lane `i` steps aside, in px, while the lane at `from` is on its way to `to`. */
export function shiftFor(slots: Slot[], from: number, to: number, i: number, gap: number): number {
  const room = slots[from].width + gap;
  if (from < i && i <= to) return -room;
  if (to <= i && i < from) return room;
  return 0;
}

/**
 * Where something carried to `x` would go in the row: before the first lane whose centre is
 * right of `x`, else at the end. Slots and `x` share one frame, such as the viewport.
 */
export function insertionIndex(slots: Slot[], x: number): number {
  const at = slots.findIndex((slot) => x < centre(slot));
  return at === -1 ? slots.length : at;
}

/** The left edge of the slot the lane at `from` will land in at `to`. */
export function slotLeft(slots: Slot[], from: number, to: number): number {
  const target = slots[to];
  return to > from ? target.left + target.width - slots[from].width : target.left;
}
