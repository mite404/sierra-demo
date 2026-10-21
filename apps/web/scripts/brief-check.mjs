// oxlint-disable no-await-in-loop, no-console -- a lever drives one step at a time and reports on stdout
// The scripted demo's lever: drives the Demo threads at /t/demo-* in headless Chromium at 1280x900 through
// its three scenarios and screenshots each stage to .artifacts/weekly-brief/. Exits 1 when any
// step fails, and counts every console error as a failure.
//
//   node apps/web/scripts/brief-check.mjs [--base http://127.0.0.1:5173] [--out dir]
//   PLAYWRIGHT_CHROMIUM=/path/to/chrome node apps/web/scripts/brief-check.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { briefSteps, interruptedSteps, returnedSteps, shotIn } from "./brief-steps.mjs";
import { arg, launch, ROOT } from "./harness.mjs";

const base = arg("--base", "http://127.0.0.1:5173");
const out = arg("--out", path.join(ROOT, ".artifacts/weekly-brief"));

// Runs a scenario's steps in order; once one fails, the rest are skipped, since each builds on
// the one before.
async function scenario(steps, page, run, results) {
  let failed = false;
  for (const [step, prove] of steps) {
    if (failed) {
      results.push({ step, ok: false, detail: "skipped: an earlier step failed" });
      continue;
    }
    try {
      results.push({ step, ok: true, detail: (await prove(page, run)) ?? "" });
    } catch (error) {
      failed = true;
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ step, ok: false, detail });
    }
  }
}

mkdirSync(out, { recursive: true });
const results = [];
const errors = [];
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  const run = { base, timing: {}, shot: shotIn(out, page) };
  for (const steps of [briefSteps, interruptedSteps, returnedSteps])
    await scenario(steps, page, run, results);
  results.push({ step: "no console errors", ok: errors.length === 0, detail: errors.join(" | ") });
} finally {
  await browser.close();
}
writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
for (const { step, ok, detail } of results)
  console.log(`${ok ? "PASS" : "FAIL"} ${step}${detail === "" ? "" : ` · ${detail}`}`);
const failed = results.filter((result) => !result.ok).length;
console.log(
  failed === 0
    ? `PASS weekly brief, ${results.length} steps`
    : `FAIL ${failed} of ${results.length}`,
);
process.exitCode = failed === 0 ? 0 : 1;
