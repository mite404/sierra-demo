import { useCarryTarget, type Carried, type CarryPoint } from "@yaklabs/catalog/carry";
import { useState, type RefObject } from "react";
import { insertionIndex } from "../canvas";

/** An incoming lane's insertion index, untransformed left edge, and preview content. */
export type Landing = { at: number; left: number; carried: Carried };

function sameLanding(current: Landing, next: Landing): boolean {
  return current.at === next.at && current.left === next.left && current.carried === next.carried;
}

// Where a carry at `point` lands in `row`, measured from the lanes as they stand now.
function landingAt(row: HTMLElement, point: CarryPoint, carried: Carried): Landing {
  const rowBox = row.getBoundingClientRect();
  // Transformed neighbor boxes would feed the preview's own movement back into hit testing.
  const slots = [...row.querySelectorAll<HTMLElement>(":scope > article")].map((lane) => ({
    left: lane.offsetLeft,
    width: lane.offsetWidth,
  }));
  const at = insertionIndex(slots, point.x - rowBox.left + row.scrollLeft);
  const last = slots.at(-1);
  const style = getComputedStyle(row);
  const end = last
    ? last.left + last.width + parseFloat(style.getPropertyValue("--canvas-grid"))
    : parseFloat(style.paddingLeft);
  return { at, left: slots.at(at)?.left ?? end, carried };
}

/**
 * Makes the whole row a carry target (ADR-091): while a card or a highlight is over it, the
 * landing follows the pointer; a release hands `onCarry` what was carried and where it goes.
 * Escape, a cancel or leaving the row clears the landing, and so does the drop itself.
 */
export function useLanding(
  row: RefObject<HTMLElement | null>,
  onCarry: (carried: Carried, at: number) => void,
): Landing | null {
  const [landing, setLanding] = useState<Landing | null>(null);
  const follow = (next: Landing | null) => {
    setLanding((current) => {
      if (current === null || next === null) return next;
      return sameLanding(current, next) ? current : next;
    });
  };
  useCarryTarget(row, {
    over: (carried, point) => {
      if (row.current !== null) follow(landingAt(row.current, point, carried));
      return row.current !== null;
    },
    leave: () => {
      follow(null);
    },
    drop: (carried, point) => {
      follow(null);
      if (row.current !== null) onCarry(carried, landingAt(row.current, point, carried).at);
    },
  });
  return landing;
}
