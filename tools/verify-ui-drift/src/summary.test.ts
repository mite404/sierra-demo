import { describe, expect, it } from "vitest";
import type { Cell, Probe, RenderedCell, Report } from "./report.ts";
import { referenceNotice, summarize } from "./summary.ts";

const fingerprint = {
  environment: "darwin-arm64",
  browser: "1",
  playwright: "1",
  width: 3,
  height: 2,
  dpr: 2,
  policy: 1,
} as const;
const image = { path: "a.png", sha256: "b".repeat(64) };
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
  current: image,
  aria: "button.aria.yml",
  fingerprint,
  pixels: { kind: "match", baseline: image },
  axe: { violations: [], incomplete: [], passes: 7 },
};
const contrast = { id: "color-contrast", help: "Contrast", impact: "serious", nodes: 2 };

function report(cells: Cell[] = [cell], extra: Partial<Report> = {}): Report {
  return {
    schema: 1,
    id: "run-1",
    mode: "comparison",
    source: "a".repeat(64),
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
    ...extra,
  };
}

const text = (lines: string[]) => lines.join("\n");

describe("run summary", () => {
  it("tells a broken run not to be used, and why", () => {
    const lines = summarize(report([cell], { errors: ["firefox did not launch: gone\nbox"] }), []);
    expect(lines[0]).toMatch(/do not use/i);
    expect(text(lines)).toContain("firefox did not launch: gone");
    expect(text(lines)).not.toContain("box");
  });

  it("says nothing was compared when this machine has no references", () => {
    const missing: Cell = { ...cell, pixels: { kind: "missing-baseline" } };
    const lines = summarize(report([missing]), ["linux-x64-debian-12"]);
    expect(lines[0]).toMatch(/not a pass/i);
    expect(text(lines)).toContain("1 of 1 capture has no approved reference");
    expect(text(lines)).toContain("darwin-arm64");
    expect(text(lines)).toContain("linux-x64-debian-12");
  });

  it("does not claim references exist only elsewhere when this machine has some", () => {
    const missing: Cell = { ...cell, pixels: { kind: "missing-baseline" } };
    const lines = summarize(report([missing]), ["darwin-arm64", "linux-x64-debian-12"]);
    expect(text(lines)).toContain("Approved references exist for linux-x64-debian-12.");
    expect(text(lines)).not.toContain("exist only for");
  });

  it("never lets an incomplete run hide an accessibility violation or a change", () => {
    const violating: Cell = {
      ...cell,
      pixels: { kind: "missing-baseline" },
      axe: { ...cell.axe, violations: [contrast] },
    };
    const changed: Cell = {
      ...cell,
      key: "button.chromium.dark",
      theme: "dark",
      pixels: {
        kind: "changed",
        baseline: image,
        diff: image,
        delta: { ...delta, changedPixels: 40 },
      },
    };
    const lines = summarize(
      report([violating, changed], { themes: ["light", "dark"], probes: [] }),
      [],
    );
    expect(text(lines)).toContain("button.chromium.light: color-contrast (serious, 2 nodes)");
    expect(text(lines)).toContain("button.chromium.dark: 40 pixels changed");
  });

  it("names an engine whose comparator proof failed", () => {
    const blind = { ...probe, color: probe.control };
    expect(text(summarize(report([cell], { probes: [blind] }), []))).toMatch(
      /chromium.*cannot be trusted/,
    );
  });

  it("counts captures that did not run, per engine", () => {
    const skipped: Cell = {
      key: "button.webkit.light",
      story: "button",
      engine: "webkit",
      theme: "light",
      kind: "not-run",
      reason: "Error: no webkit\nbox",
    };
    const lines = summarize(report([cell, skipped], { engines: ["chromium", "webkit"] }), []);
    expect(text(lines)).toContain("webkit: 1 capture did not run (Error: no webkit)");
  });

  it("states what a pass covers", () => {
    const lines = summarize(report(), []);
    expect(lines[0]).toBe(
      "All 1 captures match their approved references, with no axe violations.",
    );
  });

  it("lists a failing capture and points at the review app", () => {
    const changed: Cell = {
      ...cell,
      pixels: { kind: "changed", baseline: image, diff: image, delta },
    };
    const lines = summarize(report([changed]), []);
    expect(text(lines)).toContain("button.chromium.light: 1 pixel changed");
    expect(text(lines)).toContain("pnpm verify-ui-drift review");
  });
});

describe("reference notice", () => {
  it("warns before capture on a machine with no references, and only then", () => {
    expect(referenceNotice("comparison", "darwin-arm64", ["linux-x64-debian-12"])).toContain(
      "darwin-arm64",
    );
    expect(referenceNotice("comparison", "darwin-arm64", [])).toContain(
      "References exist for: none",
    );
    expect(
      referenceNotice("comparison", "linux-x64-debian-12", ["linux-x64-debian-12"]),
    ).toBeNull();
    expect(referenceNotice("selftest", "darwin-arm64", [])).toBeNull();
  });
});
