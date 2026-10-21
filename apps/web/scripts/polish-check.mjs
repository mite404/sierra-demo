#!/usr/bin/env node
// Measures the shell polish's acceptance predicates on the real app. `--capture` records the 0.6 baseline instead, on the commit before the polish.
//
//   pnpm dev:web                                                   # http://127.0.0.1:5173
//   node apps/web/scripts/polish-check.mjs --capture               # once, on the base
//   node apps/web/scripts/polish-check.mjs [--only A,C] [--out dir]
import { chromium } from "./harness.mjs";
import { run } from "./lever.mjs";
import { capture } from "./polish-checks.mjs";
import { polishChecks } from "./polish-predicates.mjs";

if (process.argv.includes("--capture")) {
  const browser = await chromium.launch({ args: ["--disable-partial-raster"] }); // ADR-107
  await capture(browser);
  await browser.close();
  console.log("baseline written to .artifacts/polish/baseline");
} else {
  await run(polishChecks);
}
