import { z } from "zod";

/**
 * One CSS color read every way the audit needs. `hex` is `#rrggbb`, or `#rrggbbaa` when the
 * color is translucent, and is gamut-mapped when the color sits outside sRGB; `inSrgb` and
 * `roundTripDelta` (CIEDE2000 between the color and its hex) say how much the hex loses.
 */
export const colorViewsSchema = z.object({
  hex: z.string(),
  oklch: z.string(),
  alpha: z.number(),
  inSrgb: z.boolean(),
  roundTripDelta: z.number(),
});

// Where a finding was authored: `context` is the enclosing chain, outermost first. In CSS that
// is at-rule preludes and selectors; in TSX it is the enclosing JSX element.
const sourceShape = {
  file: z.string(),
  line: z.number().int(),
  column: z.number().int(),
  context: z.array(z.string()),
};

/** A color literal as written in source, with its reading. */
const foundColorSchema = z.object({ text: z.string(), color: colorViewsSchema });

/**
 * What a custom property's authored value says about its color. `literal` is a value that is
 * one color on its own; `composite` holds literal colors among other parts, as a shadow does;
 * `unresolved` names the `var()` references and functions (color-mix and the like) only the
 * browser's cascade can settle; `none` holds no color.
 */
const authoredColorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), color: colorViewsSchema }),
  z.object({ kind: z.literal("composite"), colors: z.array(foundColorSchema) }),
  z.object({
    kind: z.literal("unresolved"),
    references: z.array(z.string()),
    functions: z.array(z.string()),
  }),
  z.object({ kind: z.literal("none") }),
]);

/** A custom property declaration exactly as authored, one entry per declaration. */
const customPropertySchema = z.object({
  ...sourceShape,
  name: z.string(),
  value: z.string(),
  color: authoredColorSchema,
});

/**
 * A token whose literal value is exactly a raw color's value. Each candidate is a role to
 * choose between by meaning, not an alias to rename to.
 */
const tokenCandidateSchema = z.object({
  name: z.string(),
  context: z.array(z.string()),
});

/**
 * A color written as a raw literal outside any custom property declaration. `property` is the
 * CSS property, the JSX attribute or style key, or the whole Tailwind class.
 */
const colorLiteralSchema = z.object({
  ...sourceShape,
  origin: z.enum(["css", "jsx-attribute", "jsx-style", "tailwind"]),
  property: z.string(),
  text: z.string(),
  color: colorViewsSchema,
  candidates: z.array(tokenCandidateSchema),
});

/** The authored color inventory of a set of CSS and TSX sources. */
export const colorInventorySchema = z.object({
  customProperties: z.array(customPropertySchema),
  literals: z.array(colorLiteralSchema),
});

/**
 * A WCAG 2.1 contrast verdict. `composited` is true when a translucent foreground was laid
 * over the opaque background first; `inconclusive` says why no ratio could be claimed.
 */
export const contrastSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ratio"), ratio: z.number(), composited: z.boolean() }),
  z.object({
    kind: z.literal("inconclusive"),
    reason: z.enum(["unparsed-foreground", "unparsed-background", "translucent-background"]),
  }),
]);

export type ColorViews = z.infer<typeof colorViewsSchema>;
export type FoundColor = z.infer<typeof foundColorSchema>;
export type AuthoredColor = z.infer<typeof authoredColorSchema>;
export type CustomProperty = z.infer<typeof customPropertySchema>;
export type TokenCandidate = z.infer<typeof tokenCandidateSchema>;
export type ColorLiteral = z.infer<typeof colorLiteralSchema>;
export type ColorInventory = z.infer<typeof colorInventorySchema>;
export type Contrast = z.infer<typeof contrastSchema>;
