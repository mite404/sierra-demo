import type { CSSProperties } from "react";

export { cn } from "cn";

// A style value carrying CSS custom properties, which React's own CSSProperties type omits.
type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Builds a `style` value that mixes CSS custom properties (`--foo`) into ordinary properties,
 * without an unsafe cast to `CSSProperties`.
 */
export function cssVars(
  vars: Record<`--${string}`, string | number>,
  base?: CSSProperties,
): CSSVarStyle {
  return { ...base, ...vars };
}
