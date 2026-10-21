import { useState } from "react";

/** The title bar's two looks (ADR-115): the flat green, or the oil painting under a green wash. */
export type ChromeStyle = "solid" | "painting";
/** The visitor's bar and how to change it, as the window hands it to the account menu. */
export type ChromeChoice = { style: ChromeStyle; choose: (next: ChromeStyle) => void };

const KEY = "kay.chrome";
const PARAM = "chrome";
const SEED = "chromeSeed"; // → <html data-chrome-seed>
const STYLES: readonly ChromeStyle[] = ["solid", "painting"];

/**
 * Runs from the prerendered shell before React and the router load, as THEME_BOOT does: a
 * `?chrome=` in the address is handed to the page as `data-chrome-seed` and taken out of the
 * address, so the router never sees it and no link or history entry carries it on.
 */
export const CHROME_BOOT = `(()=>{try{var u=new URL(location.href),c=u.searchParams.get(${JSON.stringify(PARAM)});if(c!==null){if(${JSON.stringify(STYLES)}.indexOf(c)>=0)document.documentElement.dataset.${SEED}=c;u.searchParams.delete(${JSON.stringify(PARAM)});history.replaceState(history.state,"",u)}}catch(e){}})()`;

// The choice for this visit, above any remount of the window, for when storage is refused.
let held: ChromeStyle | null = null;

const styleOf = (value: string | null | undefined): ChromeStyle | null =>
  STYLES.find((each) => each === value) ?? null;

function remember(style: ChromeStyle): void {
  held = style;
  try {
    localStorage.setItem(KEY, style);
  } catch {
    // Private windows may refuse storage; `held` keeps the choice for this visit.
  }
}

function stored(): ChromeStyle | null {
  try {
    return styleOf(localStorage.getItem(KEY)); // → ChromeStyle | null
  } catch {
    return null;
  }
}

// The visit's own choice first; then a `?chrome=` the boot script seeded, kept as the choice;
// then the stored choice; then the solid bar.
function readChrome(): ChromeStyle {
  if (held !== null) return held;
  const seed = styleOf(document.documentElement.dataset[SEED]);
  if (seed !== null) {
    delete document.documentElement.dataset[SEED];
    remember(seed);
    return seed;
  }
  return stored() ?? "solid";
}

/** The bar's look, read before the first paint so it never flips, and a setter that keeps it. */
export function useChrome(): ChromeChoice {
  const [style, setStyle] = useState(readChrome);
  return {
    style,
    choose: (next) => {
      setStyle(next);
      remember(next);
    },
  };
}
