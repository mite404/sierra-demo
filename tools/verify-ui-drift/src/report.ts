import { z } from "zod";
import { colorInventorySchema, colorViewsSchema, contrastSchema } from "./colors-schema.ts";

export const engineSchema = z.enum(["chromium", "firefox", "webkit"]);
export const themeSchema = z.enum(["light", "dark"]);
export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/u);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const imageSchema = z.object({ path: idSchema, sha256: digestSchema });
const deltaSchema = z.object({
  changedPixels: z.number().int().nonnegative(),
  totalPixels: z.number().int().positive(),
  resized: z.boolean(),
});
const fingerprintSchema = z.object({
  environment: z.string(),
  browser: z.string(),
  playwright: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dpr: z.literal(2),
  policy: z.literal(1),
});
export const baselineSchema = z.object({
  image: imageSchema,
  fingerprint: fingerprintSchema,
  source: digestSchema,
  run: idSchema,
});
const pixelsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("missing-baseline") }),
  z.object({ kind: z.literal("match"), baseline: imageSchema }),
  z.object({
    kind: z.literal("changed"),
    baseline: imageSchema,
    diff: imageSchema,
    delta: deltaSchema,
  }),
  z.object({ kind: z.literal("stale-baseline"), baseline: imageSchema, reason: z.string() }),
]);
const cellBase = z.object({
  key: idSchema,
  story: idSchema,
  engine: engineSchema,
  theme: themeSchema,
});
const axeFinding = z.object({
  id: z.string(),
  help: z.string(),
  impact: z.string(),
  nodes: z.number(),
});
const cellSchema = z.discriminatedUnion("kind", [
  cellBase.extend({ kind: z.literal("not-run"), reason: z.string() }),
  cellBase.extend({ kind: z.literal("render-error"), errors: z.array(z.string()).min(1) }),
  cellBase.extend({
    kind: z.literal("rendered"),
    current: imageSchema,
    aria: idSchema,
    fingerprint: fingerprintSchema,
    pixels: pixelsSchema,
    axe: z.object({
      violations: z.array(axeFinding),
      incomplete: z.array(axeFinding),
      passes: z.number(),
    }),
  }),
]);
const probeSchema = z.object({
  engine: engineSchema,
  fingerprint: fingerprintSchema,
  control: deltaSchema,
  color: deltaSchema,
  geometry: deltaSchema,
});
const tokenSampleSchema = z.object({
  name: z.string(),
  theme: themeSchema,
  scope: z.string(),
  computed: z.string(),
  color: colorViewsSchema,
});
const contrastPairSchema = z.object({
  foreground: z.string(),
  background: z.string(),
  theme: themeSchema,
  minimum: z.number(),
  measurement: contrastSchema,
});
export const reportSchema = z.object({
  schema: z.literal(1),
  id: idSchema,
  mode: z.enum(["comparison", "selftest"]),
  source: digestSchema,
  head: z.string(),
  createdAt: z.string(),
  engines: z.array(engineSchema).min(1),
  themes: z.array(themeSchema).min(1),
  indexedStories: z.number().int().nonnegative(),
  selectedStories: z.array(idSchema),
  errors: z.array(z.string()),
  probes: z.array(probeSchema),
  cells: z.array(cellSchema),
  inventory: colorInventorySchema,
  tokens: z.array(tokenSampleSchema),
  contrasts: z.array(contrastPairSchema),
});
const repoPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !value.startsWith("/") && !value.split("/").includes(".."),
    "Path must be repository-relative and cannot escape the repository.",
  );
export const storyEntrySchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  name: z.string().min(1),
  importPath: repoPathSchema,
  componentPath: repoPathSchema.optional(),
});
export const storybookStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("available"), stories: z.array(storyEntrySchema) }),
  z.object({ kind: z.literal("unavailable"), reason: z.string() }),
]);
export const reviewStateSchema = z.object({
  report: reportSchema.nullable(),
  stale: z.boolean(),
  runs: z.array(idSchema),
  storybook: storybookStateSchema,
});

export type Engine = z.infer<typeof engineSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type Image = z.infer<typeof imageSchema>;
export type Delta = z.infer<typeof deltaSchema>;
export type Fingerprint = z.infer<typeof fingerprintSchema>;
export type Cell = z.infer<typeof cellSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ReviewState = z.infer<typeof reviewStateSchema>;
export type StoryEntry = z.infer<typeof storyEntrySchema>;
export type StorybookState = z.infer<typeof storybookStateSchema>;
export type Probe = z.infer<typeof probeSchema>;
export type RenderedCell = Extract<Cell, { kind: "rendered" }>;
export type Verdict = "pass" | "fail" | "incomplete" | "broken";

/** Whether the report holds exactly one cell for every selected story, engine and theme. */
export function fullMatrix(report: Report): boolean {
  const expected = report.selectedStories.flatMap((story) =>
    report.engines.flatMap((engine) => report.themes.map((theme) => `${story}.${engine}.${theme}`)),
  );
  const actual = report.cells.map((cell) => `${cell.story}.${cell.engine}.${cell.theme}`);
  return (
    expected.length > 0 &&
    expected.length === actual.length &&
    new Set(actual).size === actual.length &&
    expected.every((key) => actual.includes(key))
  );
}

/** Checks that clean recapture matches and that both real CSS mutations change pixels. */
export function proved(probes: Probe[], engines: Engine[]): boolean {
  return (
    engines.length > 0 &&
    engines.every((engine) => {
      const matching = probes.filter((probe) => probe.engine === engine);
      return (
        matching.length === 1 &&
        matching.every(
          ({ control, color, geometry }) =>
            control.changedPixels === 0 &&
            !control.resized &&
            color.changedPixels > 0 &&
            geometry.changedPixels > 0,
        )
      );
    })
  );
}

/** An error's first line. Playwright's install notes follow it, and it already names the cause. */
export function firstLine(message: string): string {
  return message.split("\n")[0] ?? message;
}

/** Why a run is broken, one line per run error and per render-error cell, so the terminal can
 * say what the review app would. */
export function brokenReasons(report: Report): string[] {
  const cellErrors = report.cells.flatMap((cell) =>
    cell.kind === "render-error" ? [`${cell.key}: ${firstLine(cell.errors[0] ?? "")}`] : [],
  ); // → string[]
  return [...report.errors.map(firstLine), ...cellErrors];
}

/** One verdict policy for the review app and command exit code. */
export function verdict(report: Report): Verdict {
  if (report.errors.length > 0 || report.cells.some((cell) => cell.kind === "render-error"))
    return "broken";
  if (!proved(report.probes, report.engines)) return "incomplete";
  if (report.mode === "selftest") return "pass";
  if (!fullMatrix(report)) return "incomplete";
  if (
    report.cells.some(
      (cell) =>
        cell.kind === "rendered" &&
        (cell.pixels.kind === "changed" || cell.axe.violations.length > 0),
    )
  )
    return "fail";
  if (report.cells.some((cell) => cell.kind !== "rendered" || cell.pixels.kind !== "match"))
    return "incomplete";
  return "pass";
}

/** Selects only explicitly named, fresh captures for baseline promotion.
 * @throws If evidence is stale, incomplete, failed to render, or the selection is ambiguous.
 */
export function approvalCells(
  report: Report,
  source: string,
  keys: string[],
  expected: number,
): RenderedCell[] {
  if (report.source !== source) throw new Error("Stale report. Rerun against the current source.");
  if (
    report.mode !== "comparison" ||
    !fullMatrix(report) ||
    report.errors.length > 0 ||
    report.cells.some((cell) => cell.kind !== "rendered") ||
    !proved(report.probes, report.engines)
  ) {
    throw new Error("Only complete, rendered runs with a proved comparator can be approved.");
  }
  if (keys.length === 0 || keys.length !== expected || new Set(keys).size !== keys.length) {
    throw new Error("Name distinct captures and the exact expected count.");
  }
  return keys.map((key) => {
    const cell = report.cells.find((item) => item.key === key);
    if (cell?.kind !== "rendered" || cell.axe.violations.length > 0) {
      throw new Error(`Cannot approve ${key}. It is missing or has accessibility violations.`);
    }
    return cell;
  });
}
