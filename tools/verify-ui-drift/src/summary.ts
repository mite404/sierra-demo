import { brokenReasons, firstLine, fullMatrix, proved, verdict } from "./report.ts";
import type { Cell, RenderedCell, Report } from "./report.ts";

// Every summary line is written for someone deciding whether to trust a run, not for the code:
// what happened, why, and what to do next. A reason is never left for report.json alone.

const REVIEW = "pnpm verify-ui-drift review";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function rendered(report: Report): RenderedCell[] {
  return report.cells.filter((cell): cell is RenderedCell => cell.kind === "rendered");
}

function changedLines(cells: RenderedCell[]): string[] {
  return cells.flatMap((cell) =>
    cell.pixels.kind === "changed"
      ? [`${cell.key}: ${plural(cell.pixels.delta.changedPixels, "pixel")} changed`]
      : [],
  );
}

function axeLines(cells: RenderedCell[]): string[] {
  return cells.flatMap((cell) =>
    cell.axe.violations.map(
      (finding) =>
        `${cell.key}: ${finding.id} (${finding.impact}, ${plural(finding.nodes, "node")})`,
    ),
  );
}

function blindEngines(report: Report): string[] {
  return report.engines
    .filter((engine) => !proved(report.probes, [engine]))
    .map(
      (engine) => `${engine}: the comparator proof failed, so its comparisons cannot be trusted.`,
    );
}

function notRunLines(cells: Cell[]): string[] {
  const byEngine = new Map<string, string[]>();
  for (const cell of cells)
    if (cell.kind === "not-run")
      byEngine.set(cell.engine, [...(byEngine.get(cell.engine) ?? []), firstLine(cell.reason)]);
  return [...byEngine].map(
    ([engine, reasons]) =>
      `${engine}: ${plural(reasons.length, "capture")} did not run (${reasons[0]})`,
  );
}

// Missing references are the quiet failure: every line reads "axe=0" and nothing was compared.
function referenceLines(report: Report, cells: RenderedCell[], known: string[]): string[] {
  const missing = cells.filter((cell) => cell.pixels.kind === "missing-baseline");
  const stale = cells.flatMap((cell) =>
    cell.pixels.kind === "stale-baseline"
      ? [`${cell.key}: its reference is stale (${cell.pixels.reason})`]
      : [],
  );
  if (missing.length === 0) return stale;
  const here = new Set(missing.map((cell) => cell.fingerprint.environment)); // → Set<string>
  const elsewhere = known.filter((environment) => !here.has(environment));
  return [
    `${missing.length} of ${report.cells.length} ${report.cells.length === 1 ? "capture" : "captures"} ${missing.length === 1 ? "has" : "have"} no approved reference for this machine (${[...here].join(", ")}), so ${missing.length === 1 ? "it was" : "they were"} not compared.`,
    elsewhere.length > 0
      ? `Approved references exist for ${elsewhere.join(", ")}. Review CI's design-verification artifact, or approve local references on purpose.`
      : "No approved references exist for them yet.",
    ...stale,
  ];
}

function incompleteLines(report: Report, cells: RenderedCell[], known: string[]): string[] {
  // Not-run cells already name their gap; any other hole in the matrix gets a line of its own.
  const accounted = report.cells.some((cell) => cell.kind === "not-run") || fullMatrix(report);
  return [
    ...blindEngines(report),
    ...notRunLines(report.cells),
    ...referenceLines(report, cells, known),
    ...(accounted ? [] : ["Some selected captures are missing from this report."]),
  ];
}

function failHeadline(changed: number, violations: number): string {
  const parts = [
    ...(changed > 0 ? [`${plural(changed, "capture")} changed`] : []),
    ...(violations > 0 ? [plural(violations, "axe violation")] : []),
  ];
  return `${parts.join(" and ")}: each needs a decision.`;
}

/** What to say before capture when this machine has no approved references: a comparison here
 * would record captures and compare none. Null when there is nothing to warn about. */
export function referenceNotice(
  mode: Report["mode"],
  environment: string,
  known: string[],
): string | null {
  if (mode !== "comparison" || known.includes(environment)) return null;
  return `No approved references exist for this machine (${environment}), so captures are recorded but not compared. References exist for: ${known.join(", ") || "none"}.`;
}

/** Turns a finished report into plain lines for the terminal: a headline, the reasons behind it,
 * and the next step. Changes and axe violations are listed whenever they exist, so an incomplete
 * run can never hide them.
 * @param known environments that have approved references on disk. */
export function summarize(report: Report, known: string[]): string[] {
  const outcome = verdict(report);
  if (outcome === "broken")
    return [
      "Do not use these results: the run did not finish cleanly.",
      ...brokenReasons(report),
      "Next: fix the cause above and run again. A broken run cannot be approved.",
    ];
  const cells = rendered(report);
  const findings = [...changedLines(cells), ...axeLines(cells)];
  if (outcome === "pass")
    return report.mode === "selftest"
      ? ["The comparator caught every planted change on each engine."]
      : [
          `All ${report.cells.length} captures match their approved references, with no axe violations.`,
        ];
  if (outcome === "fail")
    return [
      failHeadline(changedLines(cells).length, axeLines(cells).length),
      ...findings,
      `Next: inspect each one in ${REVIEW}. Approve only a change you meant; fix the rest.`,
    ];
  return [
    "Incomplete, which is not a pass: part of this run was not verified.",
    ...incompleteLines(report, cells, known),
    ...findings,
    `Next: treat these results as unverified. ${REVIEW} shows the evidence that exists.`,
  ];
}
