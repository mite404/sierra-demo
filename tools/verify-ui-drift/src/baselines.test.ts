import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { compareBaseline, imageRef, knownEnvironments, writeBaselines } from "./baselines.ts";
import type { RenderedCell } from "./report.ts";

const dirs: string[] = [];
const fingerprint = {
  environment: "linux-test",
  browser: "1",
  playwright: "1",
  width: 3,
  height: 2,
  dpr: 2,
  policy: 1,
} as const;
const source = "a".repeat(64);
async function setup() {
  const runDir = await mkdtemp(path.join(tmpdir(), "verify-ui-drift-"));
  dirs.push(runDir);
  const baselineDir = path.join(runDir, "refs");
  const png = new PNG({ width: 3, height: 2 });
  png.data.fill(255);
  const current = PNG.sync.write(png);
  const cell: RenderedCell = {
    key: "button.chromium.light",
    story: "button",
    engine: "chromium",
    theme: "light",
    kind: "rendered",
    fingerprint,
    current: imageRef("current.png", current),
    aria: "current.aria.yml",
    pixels: { kind: "missing-baseline" },
    axe: { passes: 1, violations: [], incomplete: [] },
  };
  await writeFile(path.join(runDir, cell.current.path), current);
  const input = { key: cell.key, fingerprint, current, runDir, baselineDir };
  return { input, cell, promotion: { cells: [cell], runDir, baselineDir, source, run: "run-1" } };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("known environments", () => {
  it("names none before the first approval, then the approved machine", async () => {
    const { input, promotion } = await setup();
    expect(await knownEnvironments(input.baselineDir)).toEqual([]);
    await writeBaselines(promotion);
    expect(await knownEnvironments(input.baselineDir)).toEqual(["linux-test"]);
  });
});

describe("baseline lifecycle", () => {
  it("does not bless a missing baseline, then matches only after explicit approval", async () => {
    const { input, promotion } = await setup();
    expect(await compareBaseline(input)).toEqual({ kind: "missing-baseline" });
    await expect(readdir(input.baselineDir)).rejects.toThrow("ENOENT");
    await writeBaselines(promotion);
    const pixels = await compareBaseline(input);
    expect(pixels.kind).toBe("match");
    if (pixels.kind !== "match") throw new Error("No match evidence");
    expect(await readFile(path.join(input.runDir, pixels.baseline.path))).toEqual(input.current);
  });
  it("compares changed source but refuses a different browser build", async () => {
    const { input, promotion } = await setup();
    await writeBaselines(promotion);
    const altered = PNG.sync.read(input.current);
    altered.data[0] = 0;
    const result = await compareBaseline({ ...input, current: PNG.sync.write(altered) });
    expect(result.kind).toBe("changed");
    if (result.kind !== "changed") throw new Error("No changed evidence");
    expect(result.delta.changedPixels).toBe(1);
    expect(
      (await compareBaseline({ ...input, fingerprint: { ...fingerprint, browser: "2" } })).kind,
    ).toBe("stale-baseline");
  });
  it("rejects an image altered after capture before publishing anything", async () => {
    const { input, promotion } = await setup();
    await writeFile(path.join(input.runDir, "current.png"), "tampered");
    await expect(writeBaselines(promotion)).rejects.toThrow(/image|hash/iu);
  });
  it("refuses an old report after another capture has replaced its baseline", async () => {
    const { input, cell, promotion } = await setup();
    await writeBaselines(promotion);
    const pixels = await compareBaseline(input);
    const next = PNG.sync.read(input.current);
    next.data[1] = 0;
    const png = PNG.sync.write(next);
    await writeFile(path.join(input.runDir, "next.png"), png);
    await writeBaselines({
      ...promotion,
      cells: [{ ...cell, pixels, current: imageRef("next.png", png) }],
    });
    await expect(writeBaselines({ ...promotion, cells: [{ ...cell, pixels }] })).rejects.toThrow(
      /baseline.*changed/iu,
    );
  });
});
