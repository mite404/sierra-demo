/**
 * Records how the user last moved focus, as `<html data-input="keyboard" | "pointer">`, so
 * text fields show the focus ring only for keyboard users (ADR-053). Browsers treat every
 * focused text field as keyboard-focused, even after a click, so `:focus-visible` alone
 * cannot tell them apart. Only Tab counts as keyboard, so typing into a clicked field keeps
 * it pointer; with no attribute yet (assistive tools moving focus) the ring shows.
 * @returns A function that stops tracking.
 */
export function trackInputModality(root: HTMLElement = document.documentElement): () => void {
  const pointer = () => (root.dataset.input = "pointer");
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Tab") root.dataset.input = "keyboard";
  };
  document.addEventListener("pointerdown", pointer, true);
  document.addEventListener("keydown", keyboard, true);
  return () => {
    document.removeEventListener("pointerdown", pointer, true);
    document.removeEventListener("keydown", keyboard, true);
  };
}
