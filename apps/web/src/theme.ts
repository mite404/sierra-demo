import { useEffect, useState } from "react";

/** The two looks the tokens define: the light paper, and Umbralkai in the dark (ADR-162). */
export type Theme = "light" | "dark";
/** What the visitor asked for: a look, or whatever the OS or browser prefers. */
export type ThemePreference = Theme | "system";
/** The visitor's preference and how to change it, as the root hands it to the workspace. */
export type ThemeChoice = { preference: ThemePreference; choose: (next: ThemePreference) => void };

const KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
// The design tooling page is drawn for the light theme alone (ADR-160), so it is light whatever
// the visitor chose; the choice comes back when they leave.
const LIGHT_ONLY = "/verify-ui-tooling";

/**
 * Runs from the prerendered shell before React loads, so a visitor whose system is dark never
 * sees the light page flash first. Nothing stored means "system", the default.
 */
export const THEME_BOOT = `(()=>{try{var p=localStorage.getItem(${JSON.stringify(KEY)});var d=p==="dark"||(p!=="light"&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);if(location.pathname===${JSON.stringify(LIGHT_ONLY)})d=false;document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

// How many light-only pages are open; while any is, the root stays light.
let pinned = 0;

// A stored "light" or "dark" is a choice; anything else, nothing included, follows the system.
function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY); // → "light" | "dark" | other | null
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function resolve(preference: ThemePreference): Theme {
  if (preference !== "system") return preference;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function apply(preference: ThemePreference): void {
  document.documentElement.dataset.theme = pinned > 0 ? "light" : resolve(preference);
  try {
    if (preference === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // Private windows may refuse storage; the look still applies for this visit.
  }
}

/**
 * The visitor's theme preference and a setter that applies it to the root element and
 * remembers it. "system", the default, follows the OS and moves when it changes.
 */
export function useTheme(): ThemeChoice {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  useEffect(() => {
    apply(preference);
    const media = matchMedia(DARK_QUERY);
    // Only a visitor following the system moves with it.
    const follow = () => {
      if (preference === "system") apply(preference);
    };
    media.addEventListener("change", follow);
    return () => {
      media.removeEventListener("change", follow);
    };
  }, [preference]);
  return { preference, choose: setPreference };
}

/**
 * Holds the root on the light theme while the calling page is open, for a page drawn for light
 * alone (ADR-160), and gives the visitor's own choice back when it closes.
 */
export function useLightOnly(): void {
  useEffect(() => {
    pinned += 1;
    apply(readPreference());
    return () => {
      pinned -= 1;
      apply(readPreference());
    };
  }, []);
}
