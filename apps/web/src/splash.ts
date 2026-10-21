import { useSyncExternalStore } from "react";

/** The painting behind a new thread's welcome (ADR-136), with a switch to look through the others. */
export type SplashStyle = "landscape" | "abstract" | "vitruvian" | "bonsai";

// One row per look. A look with no assets yet is listed but cannot be chosen.
type SplashLook = { id: SplashStyle; label: string; available: boolean };

/** The looks the switch offers, in its order: the visit cycle's, then Bonsai, which waits for its assets. */
export const SPLASH_LOOKS: readonly SplashLook[] = [
  { id: "abstract", label: "Abstract", available: true },
  { id: "landscape", label: "Landscape", available: true },
  { id: "vitruvian", label: "Vitruvian", available: true },
  { id: "bonsai", label: "Bonsai", available: false },
];

// The looks visits take in turn, from a visitor's first (Ethan: "abstract first, painting,
// vitruvian man"), then round again.
const CYCLE: readonly SplashStyle[] = SPLASH_LOOKS.filter((look) => look.available).map(
  (look) => look.id,
);
// Where the cycle stands: the place in CYCLE of the look the next visit opens with.
const TURN_KEY = "kay.splash.turn";
// Keys earlier builds kept, read by nothing now and cleared: the switch's last pick, and the
// mark of a first welcome seen.
const RETIRED_KEYS = ["kay.splash", "kay.splash.seen"];
const PARAM = "splash";

// The choice for this visit, held above any remount. Null until the first read decides it.
let current: SplashStyle | null = null;
// This visit's place in the cycle, and whether a welcome has moved the cycle on yet.
let turn = 0;
let advanced = false;
const listeners = new Set<() => void>();

/** The look a string names, or null for anything else: unknown, or listed but not available yet. */
export const splashStyleOf = (value: string | null): SplashStyle | null =>
  SPLASH_LOOKS.find((look) => look.available && look.id === value)?.id ?? null;

/**
 * The look a visit opens with: the one the address asks for, else the cycle's look at `visits`
 * (abstract, landscape, Vitruvian, then round again).
 * @param visits How many visits have shown a welcome before this one; any whole number.
 */
export function lookForVisit(asked: SplashStyle | null, visits: number): SplashStyle {
  if (asked !== null) return asked;
  const n = CYCLE.length;
  const at = Number.isInteger(visits) ? ((visits % n) + n) % n : 0;
  return CYCLE[at];
}

// The painting reaches the CSS as an attribute on <html>, as the title bar's look does: index.css
// draws the landscape and the abstract strokes off `data-splash`.
function apply(style: SplashStyle): void {
  document.documentElement.dataset.splash = style;
}

// The cycle's place for this visit, from the last visit's; 0 for a first visit or when storage
// is refused, as in a private window.
function storedTurn(): number {
  try {
    for (const key of RETIRED_KEYS) localStorage.removeItem(key);
    return Number(localStorage.getItem(TURN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * Moves the cycle on once a welcome has been on screen, once a visit, so the next visit opens
 * on the look after this one's.
 */
export function markSplashSeen(): void {
  if (advanced) return;
  advanced = true;
  try {
    localStorage.setItem(TURN_KEY, String((turn + 1) % CYCLE.length));
  } catch {
    // Storage refused: the next visit opens on the cycle's first look again.
  }
}

// A `?splash=` in the address, which a screenshot run passes, so the same page can be shot in
// each look. It holds for the visit, as a choice from the switch does.
function fromAddress(): SplashStyle | null {
  try {
    return splashStyleOf(new URL(location.href).searchParams.get(PARAM));
  } catch {
    return null;
  }
}

function decide(): SplashStyle {
  turn = storedTurn();
  return lookForVisit(fromAddress(), turn);
}

// Decided on the first read, which is before the welcome's first paint, so the picture never
// flips from one look to another.
function snapshot(): SplashStyle {
  if (current === null) {
    current = decide();
    apply(current);
  }
  return current;
}

// Read as the module loads rather than at the first welcome: the app drops a `?splash=` from the
// address as it lands on a thread, before any welcome has been drawn. The prerender has no
// document to mark.
if (typeof document !== "undefined") snapshot();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// For this visit only: kept, the choice would stand in for every draw after it.
function choose(next: SplashStyle): void {
  if (splashStyleOf(next) === null || next === current) return;
  current = next;
  apply(next);
  for (const listener of listeners) listener();
}

/**
 * The welcome's painting and how to change it for this visit. Every caller reads the one store,
 * so the welcome and its switch agree with no prop between them. A look that is not available is
 * never chosen.
 */
export function useSplash(): { style: SplashStyle; choose: (next: SplashStyle) => void } {
  const style = useSyncExternalStore(subscribe, snapshot, () => CYCLE[0]); // → SplashStyle
  return { style, choose };
}
