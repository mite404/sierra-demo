#!/usr/bin/env node
// oxlint-disable no-await-in-loop, no-console -- a lever drives one step at a time and reports on stdout
// The thread actions menu, on the real app (ADR-126 to ADR-131): the checks A1 to A9 and S1
// to S4, or with --shots its pictures, light and dark, a desktop and a 390px phone. It waits on
// the tree and the tabs, never on the data marker, which main has since removed (ADR-123).
//
//   pnpm dev:web                                          # http://127.0.0.1:5173
//   node apps/web/scripts/thread-actions-check.mjs [--only A1,A2] [--out dir]
//   node apps/web/scripts/thread-actions-check.mjs --shots docs/trail/evidence/thread-actions/after
import path from "node:path";
import { arg, chromium, ROOT } from "./harness.mjs";
import { run } from "./lever.mjs";
import { shareChecks } from "./share-checks.mjs";
import { threadActionChecks } from "./thread-actions-checks.mjs";
import { shots } from "./thread-actions-shots.mjs";

const SHOTS = arg("--shots");

if (SHOTS === undefined) {
  await run({ ...threadActionChecks, ...shareChecks });
} else {
  const browser = await chromium.launch({ args: ["--disable-partial-raster"] }); // ADR-107
  try {
    await shots(browser, path.resolve(ROOT, SHOTS));
    console.log(`shots: ${SHOTS}`);
  } finally {
    await browser.close();
  }
  // The gateway's Vite loader keeps the process alive.
  process.exit(0);
}
