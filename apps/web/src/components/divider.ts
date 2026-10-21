import type { PointerEvent } from "react";

// A divider's hint line (ADR-089) holds full ink around the pointer and is gone 50px above and
// below it, so the divider tells the stylesheet the pointer's height as `--hint-y`.

/** Records the pointer's height on the divider it is over, for the hint line to centre on. */
export function trackHintLine(event: PointerEvent<HTMLElement>): void {
  const divider = event.currentTarget;
  const top = divider.getBoundingClientRect().top; // → the divider's top, in viewport px
  divider.style.setProperty("--hint-y", `${event.clientY - top}px`);
}
