import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion } from "./reducedMotion";

const withQuery = (matches: boolean) => ({
  matchMedia: (query: string) => ({
    matches: matches && query === "(prefers-reduced-motion: reduce)",
  }),
});

describe("prefersReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false where there is no window, as in server rendering", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("follows the reduced-motion media query in a browser", () => {
    vi.stubGlobal("window", withQuery(true));
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal("window", withQuery(false));
    expect(prefersReducedMotion()).toBe(false);
  });
});
