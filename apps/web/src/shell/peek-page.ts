import type { PeekIntent } from "./peek";

// The page's side of the peek (ADR-144): where the pointer, keys, menus and focus meet its
// timing (peek.ts). The React side that owns it is sidebar-peek.tsx.

// The title bar's toggle, and the projects panel that slides.
const TOGGLE = 'header [data-sidebar="trigger"]';
const PANEL = '[data-slot="sidebar-container"]';
// Every place the pointer can rest for the panel to peek: the toggle, the strip just past the
// rail's edge, the rail, and the panel itself. At rest the rail's places (the gaps between them
// included) and its account show their names and menu instead, so only its empty stretch peeks.
const ZONES = `${TOGGLE}, [data-slot="sidebar-hot-zone"], [data-slot="rail"], ${PANEL}`;
const RAIL_QUIET = '[data-slot="rail"] :is([role="navigation"], button)';
// What holds the peek out: a menu open from a trigger in the rail or the panel (its popup sits
// outside both, so the pointer leaving for it must not close the panel), and keyboard focus in
// the panel, whose rows would leave with it. Focus on a rail place holds nothing: the rail stays
// either way, so the panel can go.
const MENU_OPEN = '[aria-haspopup="menu"][aria-expanded="true"]';
const FOCUS_IN_PANEL = ":focus-visible";

// The elements the peek belongs to: the panel that slides, and the rail it slides from.
type PeekHosts = { panel: HTMLElement; rail: HTMLElement | null };

// Whether the pointer is on a place that peeks: the toggle, the strip past the rail, the rail
// off its places and account, or, while the panel is out, anywhere on the rail or the panel, so
// crossing the rail to the account never closes it.
function inPeekZone(target: EventTarget | null, out: boolean): boolean {
  if (!(target instanceof Element) || target.closest(ZONES) === null) return false;
  return out || target.closest(RAIL_QUIET) === null;
}

// The hosts that exist: a phone has no rail, though nothing peeks there.
const hostsOf = ({ panel, rail }: PeekHosts): HTMLElement[] =>
  rail === null ? [panel] : [panel, rail];

/**
 * Whether something keeps the panel out: a menu open in the panel or the rail, or keyboard focus
 * in the panel.
 */
export function isHeld(hosts: PeekHosts): boolean {
  const menuOpen = hostsOf(hosts).some((host) => host.querySelector(MENU_OPEN) !== null);
  return menuOpen || hosts.panel.querySelector(FOCUS_IN_PANEL) !== null;
}

// Escape closes the peek, unless a menu has it: the menu closes itself first.
function escapes(event: KeyboardEvent): boolean {
  const inMenu = event.target instanceof Element && event.target.closest('[role="menu"]') !== null;
  return event.key === "Escape" && !event.defaultPrevented && !inMenu;
}

/**
 * Moves keyboard focus to the title bar's toggle when it sits in the projects panel, so closing
 * the panel never drops focus to the page's body; focus on the rail stays where it is. Call it
 * before the panel closes: a focused element that turns inert loses focus on the spot.
 */
export function handFocusToToggle(): void {
  const at = document.activeElement; // → Element | null
  if (at === null || at.closest(PANEL) === null) return;
  document.querySelector<HTMLElement>(TOGGLE)?.focus();
}

/**
 * Wires the page's pointer, keys, menus and focus to the peek's timing while the panel can peek.
 * @param out Whether the panel is out now, read on each event.
 * @returns What removes every listener and stops the timing.
 */
export function listen(peek: PeekIntent, hosts: PeekHosts, out: () => boolean): () => void {
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch") peek.point(inPeekZone(event.target, out()));
  };
  const onLeave = () => {
    peek.point(false);
  };
  const onDown = () => {
    peek.input(false);
  };
  const onKey = (event: KeyboardEvent) => {
    peek.input(true);
    if (out() && escapes(event)) peek.close(true);
  };
  const onFocusOut = () => {
    setTimeout(peek.release);
  };
  const menus = new MutationObserver(peek.release);
  for (const host of hostsOf(hosts)) {
    menus.observe(host, { subtree: true, attributeFilter: ["aria-expanded"] });
    host.addEventListener("focusout", onFocusOut);
  }
  document.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey);
  return () => {
    peek.dispose();
    menus.disconnect();
    for (const host of hostsOf(hosts)) host.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey);
  };
}
