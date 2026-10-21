/**
 * Whether the visitor asked the OS for reduced motion. False where there is no window (server
 * rendering, the node unit tests), since render paths call it too.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
