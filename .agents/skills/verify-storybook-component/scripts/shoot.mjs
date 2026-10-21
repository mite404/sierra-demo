#!/usr/bin/env node
// Render stories in Chromium and save proof: a screenshot, the ARIA tree, and any errors.
//
//   node .agents/skills/verify-storybook-component/scripts/shoot.mjs <story-id>... [--out dir] [--width px]
//
// Exits 1 when a story throws, logs a console error, or renders nothing, so a PASS line
// means the story actually drew something.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// pnpm keeps playwright inside the app that owns the story tests, so resolve it from there
// and the screenshots come from the same browser build the tests run in.
const playwright = await import(
  createRequire(path.join(ROOT, "apps/storybook/package.json")).resolve("playwright"),
);
const { chromium } = playwright.default ?? playwright; // CommonJS entry: named exports sit on default
const STATE_DIR = process.env.VERIFY_STATE_DIR ?? `/tmp/yaklabs-storybook-verify-${process.env.VERIFY_RUN_ID ?? "default"}`;

function readPort() {
  try {
    return readFileSync(path.join(STATE_DIR, "port"), "utf8").trim();
  } catch {
    return process.env.VERIFY_PORT ?? "6106";
  }
}

function parseArgs(argv) {
  const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  const args = { ids: [], out: path.join(ROOT, ".artifacts/verify-storybook-component", stamp), width: 1280 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = path.resolve(argv[++i]);
    else if (argv[i] === "--width") args.width = Number(argv[++i]);
    else if (argv[i] === "--theme") args.theme = argv[++i];
    else args.ids.push(argv[i]);
  }
  return args;
}

async function shoot(page, base, id, out, theme) {
  const errors = [];
  // The browser asks for a favicon on its first page, which Storybook does not serve; that 404
  // is the browser's, not the story's, and failed whichever story happened to load first.
  const onConsole = (msg) =>
    msg.type() === "error" &&
    !msg.location().url.endsWith("/favicon.ico") &&
    errors.push(`console: ${msg.text()}`);
  const onPageError = (err) => errors.push(`pageerror: ${err.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  // The theme global drives the preview's decorator, which sets the root's data-theme.
  const globals = theme ? `&globals=theme:${theme}` : "";
  await page.goto(`${base}/iframe.html?id=${id}&viewMode=story${globals}`);
  const root = page.locator("#storybook-root");
  await root.waitFor({ state: "attached" });
  // Storybook shows its error overlay instead of throwing, so look for it explicitly.
  await page.waitForFunction(
    () =>
      document.body.classList.contains("sb-show-errordisplay") ||
      document.querySelector("#storybook-root")?.childElementCount > 0,
    null,
    { timeout: 15_000 },
  ).catch(() => errors.push("story never rendered"));
  if (await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay")))
    errors.push(`storybook error: ${(await page.locator("#error-message").innerText()).trim()}`);

  const png = path.join(out, `${id}.png`);
  const aria = path.join(out, `${id}.aria.yml`);
  // Reveal animations fade cards in; capture the settled frame, in the real fonts.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: png, fullPage: true, animations: "disabled" });
  writeFileSync(aria, await root.ariaSnapshot());

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  return { id, errors, png, aria };
}

const args = parseArgs(process.argv.slice(2));
if (args.ids.length === 0) {
  console.error("usage: shoot.mjs <story-id>... [--out dir] [--width px] [--theme light|dark]");
  process.exit(2);
}
mkdirSync(args.out, { recursive: true });

const base = `http://127.0.0.1:${readPort()}`;
// VERIFY_CHROMIUM points at a local Chromium when Playwright's own build is missing, as in
// audit-controls.mjs.
const browser = await chromium.launch(
  process.env.VERIFY_CHROMIUM ? { executablePath: process.env.VERIFY_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: args.width, height: 900 } });
// The chart's grow and the waveform's sweep both honour reduced motion, so every frame is the
// settled one and two runs of the same code are byte-identical.
await page.emulateMedia({ reducedMotion: "reduce" });
const results = [];
for (const id of args.ids) results.push(await shoot(page, base, id, args.out, args.theme));
await browser.close();

for (const r of results) {
  console.log(`${r.errors.length ? "FAIL" : "PASS"} ${r.id}`);
  for (const e of r.errors) console.log(`  ${e}`);
  console.log(`  ${path.relative(ROOT, r.png)}`);
  console.log(`  ${path.relative(ROOT, r.aria)}`);
}
process.exit(results.some((r) => r.errors.length) ? 1 : 0);
