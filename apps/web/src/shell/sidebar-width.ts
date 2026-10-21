// The projects panel's width (the sidebar's, beside the rail), which the visitor drags on its
// edge (sidebar-resize.tsx) and the app keeps: its range, what a key does to it, and how it is
// stored and written as CSS.

/** The width the panel opens at until the visitor drags it (16rem), in CSS px. */
export const SIDEBAR_DEFAULT_PX = 256;
/**
 * The narrowest the panel goes: a row's name still reads. With the 56px rail beside it, that is
 * always wider than the title bar's lights and toggle (112px) before the tabs.
 */
export const SIDEBAR_MIN_PX = 208;
/** The widest the panel goes, and never past this share of the window. */
export const SIDEBAR_MAX_PX = 480;
const MAX_SHARE = 0.4;

// What an arrow does on the handle, and with Shift held.
const STEP_PX = 16;
const BIG_STEP_PX = 64;

// A stored width: whole or fractional px, nothing else.
const STORED = /^\d+(?:\.\d+)?$/;

/** The widest the panel may be in a window this wide, never below the narrowest. */
export function widestFor(windowPx: number): number {
  const share = Math.floor(windowPx * MAX_SHARE); // → 40% of the window, in whole px
  return Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, share));
}

/** A width held to the panel's range in a window this wide, in whole px. */
export function clampWidth(px: number, windowPx: number): number {
  return Math.min(widestFor(windowPx), Math.max(SIDEBAR_MIN_PX, Math.round(px)));
}

/**
 * The width a stored value names, held to the panel's range, or null when there is none or
 * it is not a width at all.
 */
export function parseStoredWidth(stored: string | null): number | null {
  if (stored === null || !STORED.test(stored)) return null;
  return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, Math.round(Number(stored))));
}

/**
 * The width a key on the handle asks for, or null for a key it leaves alone: an arrow steps
 * 16px (64px with Shift), Home and End go to the narrowest and the widest.
 */
export function widthForKey(
  key: string,
  shift: boolean,
  px: number,
  windowPx: number,
): number | null {
  const step = shift ? BIG_STEP_PX : STEP_PX;
  const targets: Partial<Record<string, number>> = {
    ArrowLeft: px - step,
    ArrowRight: px + step,
    Home: SIDEBAR_MIN_PX,
    End: SIDEBAR_MAX_PX,
  };
  const target = targets[key]; // → px | undefined
  return target === undefined ? null : clampWidth(target, windowPx);
}

/**
 * The width as the CSS the panel and the title bar read (`--sidebar-width`): the chosen px,
 * or 40% of the viewport where that is less, so a window made narrower never gives the
 * panel most of it.
 */
export function widthValue(px: number): string {
  return `min(${px}px, ${MAX_SHARE * 100}vw)`;
}
