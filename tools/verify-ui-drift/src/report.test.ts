import { describe, expect, it } from "vitest";
import { approvalCells, brokenReasons, proved, verdict } from "./report.ts";
import type { Cell, Probe, RenderedCell, Report } from "./report.ts";

const source = "a".repeat(64);
const fingerprint = {
  environment: "linux-test",
  browser: "1",
  playwright: "1",
  width: 3,
  height: 2,
  dpr: 2,
  policy: 1,
} as const;
const current = { path: "button.current.png", sha256: "b".repeat(64) };
const delta = { changedPixels: 1, totalPixels: 6, resized: false };
const probe: Probe = {
  engine: "chromium",
  fingerprint,
  control: { ...delta, changedPixels: 0 },
  color: delta,
  geometry: delta,
};
const cell: RenderedCell = {
  key: "button.chromium.light",
  story: "button",
  engine: "chromium",
  theme: "light",
  kind: "rendered",
  current,
  aria: "button.aria.yml",
  fingerprint,
  pixels: { kind: "missing-baseline" },
  axe: { violations: [], incomplete: [], passes: 7 },
};
function report(cells: Cell[] = [cell]): Report {
  return {
    schema: 1,
    id: "run-1",
    mode: "comparison",
    source,
    head: "head",
    createdAt: "now",
    engines: ["chromium"],
    themes: ["light"],
    indexedStories: 1,
    selectedStories: ["button"],
    errors: [],
    probes: [probe],
    cells,
    inventory: { customProperties: [], literals: [] },
    tokens: [],
    contrasts: [],
  };
}

describe("evidence verdict", () => {
  it.each([
    ["missing-baseline", "incomplete"],
    ["match", "pass"],
    ["changed", "fail"],
    ["stale-baseline", "incomplete"],
  ] as const)("reports %s as %s", (kind, expected) => {
    const pixels =
      kind === "missing-baseline"
        ? { kind }
        : kind === "match"
          ? { kind, baseline: current }
          : kind === "changed"
            ? { kind, baseline: current, diff: current, delta }
            : { kind, baseline: current, reason: "browser upgraded" };
    expect(verdict(report([{ ...cell, pixels }]))).toBe(expected);
  });
  it("never passes zero selected checks or a missing matrix cell", () => {
    expect(verdict(report([]))).toBe("incomplete");
    expect(verdict({ ...report(), themes: ["light", "dark"] })).toBe("incomplete");
  });
  it("does not let matching pixels hide axe violations", () => {
    expect(
      verdict(
        report([
          {
            ...cell,
            pixels: { kind: "match", baseline: current },
            axe: {
              ...cell.axe,
              violations: [{ id: "color-contrast", help: "Contrast", impact: "serious", nodes: 1 }],
            },
          },
        ]),
      ),
    ).toBe("fail");
  });
  it("keeps engine and render errors visible", () => {
    expect(verdict(report([{ ...cell, kind: "not-run", reason: "browser unavailable" }]))).toBe(
      "incomplete",
    );
    expect(verdict(report([{ ...cell, kind: "render-error", errors: ["blank"] }]))).toBe("broken");
    expect(verdict({ ...report(), errors: ["source changed during capture"] })).toBe("broken");
  });
  it("requires both mutations, a matching control, and every requested engine", () => {
    expect(proved([probe], ["chromium"])).toBe(true);
    expect(proved([probe], ["chromium", "webkit"])).toBe(false);
    expect(proved([{ ...probe, color: probe.control }], ["chromium"])).toBe(false);
    expect(proved([{ ...probe, control: delta }], ["chromium"])).toBe(false);
    expect(proved([], [])).toBe(false);
  });
});

describe("broken reasons", () => {
  it("names each run error and render error by its first line", () => {
    const launch = "firefox did not launch: Error: Executable doesn't exist\n╔═══ box ═══╗";
    expect(
      brokenReasons({
        ...report([{ ...cell, kind: "render-error", errors: ["blank page", "second"] }]),
        errors: [launch],
      }),
    ).toEqual([
      "firefox did not launch: Error: Executable doesn't exist",
      "button.chromium.light: blank page",
    ]);
  });
  it("has nothing to say about a run that is not broken", () => {
    expect(brokenReasons(report())).toEqual([]);
  });
});

describe("explicit approval", () => {
  it("returns the named capture after the source and count match", () => {
    expect(approvalCells(report(), source, [cell.key], 1).map((item) => item.key)).toEqual([
      cell.key,
    ]);
  });
  it.each([
    ["stale source", source.replace(/^a/u, "b"), [cell.key], 1],
    ["wrong count", source, [cell.key], 2],
    ["empty selection", source, [], 0],
    ["unknown key", source, ["other"], 1],
    ["duplicate key", source, [cell.key, cell.key], 2],
  ])("refuses %s", (_name, now, keys, count) => {
    expect(() => approvalCells(report(), now, keys, count)).toThrow(/Stale|count|Cannot approve/u);
  });
  it("refuses a run with render errors or an unproved comparator", () => {
    expect(() =>
      approvalCells(
        report([{ ...cell, kind: "render-error", errors: ["blank"] }]),
        source,
        [cell.key],
        1,
      ),
    ).toThrow("Only complete, rendered runs");
    expect(() => approvalCells({ ...report(), probes: [] }, source, [cell.key], 1)).toThrow(
      "Only complete, rendered runs",
    );
  });
});
