#!/usr/bin/env node
// The before and after pictures of the shell polish, one per area, light and dark:
//
//   node apps/web/scripts/polish-shots.mjs --dir docs/trail/evidence/shell-polish/before
//   node apps/web/scripts/polish-shots.mjs --dir … --query chrome=painting --prefix painting-
import { mkdirSync } from "node:fs";
import path from "node:path";
import { arg, chromium, ROOT } from "./harness.mjs";
import { openScenario, settle, THEMES, titleBar, toEmpty, WIDTHS } from "./polish-checks.mjs";

const DIR = path.resolve(ROOT, arg("--dir", ".artifacts/polish/shots"));
const QUERY = arg("--query");
const PREFIX = arg("--prefix", "");

const browser = await chromium.launch({ args: ["--disable-partial-raster"] }); // ADR-107
mkdirSync(DIR, { recursive: true });
const file = (name) => path.join(DIR, `${PREFIX}${name}.png`);

for (const theme of THEMES) {
  const bar = await openScenario(browser, { theme, query: QUERY });
  await bar.page.screenshot({ path: file(`shell-${theme}`) });
  await titleBar(bar.page).screenshot({ path: file(`title-bar-${theme}`) });
  await toEmpty(bar.page);
  await bar.page.screenshot({ path: file(`empty-canvas-${theme}`) });
  await bar.context.close();

  const long = await openScenario(browser, { scenario: "long", theme, query: QUERY });
  await titleBar(long.page).screenshot({ path: file(`title-bar-long-${theme}`) });
  await long.context.close();

  const narrow = await openScenario(browser, { theme, query: QUERY, viewport: WIDTHS[2] });
  await toEmpty(narrow.page);
  await settle(narrow.page);
  await narrow.page.screenshot({ path: file(`narrow-767-${theme}`) });
  await narrow.context.close();
}
await browser.close();
console.log(`shots: ${DIR}`);
