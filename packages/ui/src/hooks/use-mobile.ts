import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const isNarrow = () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;

/**
 * Whether the viewport is narrower than 768px.
 *
 * Read synchronously on first render (so there is no undefined-then-settle flash), then
 * kept current on every `matchMedia` change. Returns `false` outside a browser (no `window`).
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(isNarrow);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(isNarrow());
    };
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return isMobile;
}
