// The harness the workspace lever runs on: a browser, the addresses, the output folder, and a
// runner that gives every check its own page so one failure never hides another.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arg, chromium, ROOT } from "./harness.mjs";

export const BASE = arg("--base", "http://127.0.0.1:5173");
export const STORYBOOK = arg("--storybook", "http://127.0.0.1:6106");
export const OUT = arg(
  "--out",
  path.join(
    ROOT,
    ".artifacts/workspace",
    new Date().toISOString().slice(0, 19).replaceAll(":", "-"),
  ),
);
const ONLY = arg("--only", "")
  .split(",")
  .filter((id) => id !== "");
mkdirSync(OUT, { recursive: true });

/** Where a check saves a picture of what it measured. */
export const shotPath = (name) => path.join(OUT, `${name}.png`);

/**
 * Waits for the sidebar's own first word on what the runtime told it, whichever comes first: a
 * project's "New thread" button, "No projects yet", or its loading skeleton while nothing has
 * arrived yet. `attached`, not `visible`, since a phone starts with the sidebar closed in its
 * sheet. Every wait once kept for the removed data marker (ADR-123) waits on this instead, since
 * all three are already how a visitor reads the sidebar's state, ready or not.
 */
export function sidebarDrawn(page, options = {}) {
  const sidebar = page.locator('[data-slot="sidebar"]');
  return sidebar
    .getByRole("button", { name: /^New thread in /u })
    .first()
    .or(sidebar.getByText("No projects yet"))
    .or(sidebar.locator('[data-sidebar="menu-skeleton"]').first())
    .waitFor({ state: "attached", timeout: 20_000, ...options });
}

/**
 * A fresh browser context on `url` (its own OPFS, so no check sees another's data), ready once
 * a thread panel, or `ready` when given, is on screen. `seed` asks the dev build to seed the
 * device first: "demo-store" for the Demo store's profit thread at /t/profit.
 */
export async function openApp(
  browser,
  url = `${BASE}/`,
  { ready = ".thread-panel", seed, theme = "light" } = {},
) {
  // The system's scheme is the theme: the app follows it until a visitor picks one (ADR-162).
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    colorScheme: theme,
  });
  if (seed !== undefined) {
    await page.addInitScript((name) => {
      localStorage.setItem("kay.seed", name);
    }, seed);
  }
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(url, { waitUntil: "load" });
  if (ready) await page.locator(ready).first().waitFor({ timeout: 20_000 });
  return { page, errors };
}

/** The darkest pixel, the lightest and the mean in a box of the page, 0 (black) to 255 (white). */
export async function luminance(page, clip) {
  const png = await page.screenshot({ clip });
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let min = 255;
    let max = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += l;
      min = Math.min(min, l);
      max = Math.max(max, l);
    }
    return {
      min: Math.round(min),
      max: Math.round(max),
      mean: Math.round(sum / (data.length / 4)),
    };
  }, png.toString("base64"));
}

/**
 * The checks of every collection in one set, for `run`. A spread would let a later check with an
 * id already taken replace the earlier one without a word, so a run could pass without it.
 * @throws {Error} When two collections name a check with the same id.
 */
export function collect(...collections) {
  const checks = {};
  for (const collection of collections) {
    for (const [id, check] of Object.entries(collection)) {
      if (Object.hasOwn(checks, id)) throw new Error(`Two checks are named ${id}`);
      checks[id] = check;
    }
  }
  return checks;
}

/** Runs each check (or those named by --only), prints PASS or FAIL, writes results.json. */
export async function run(checks) {
  // Partial raster redraws only the part of a tile that changed, so an anti-aliased edge that
  // straddles an earlier change keeps a trace of the page's loading order: two loads with the
  // same paint commands then differ by a few levels at a rounded corner. Whole-tile raster makes
  // a screenshot a function of the final page alone, which is what P7 compares.
  const browser = await chromium.launch({ args: ["--disable-partial-raster"] });
  const results = [];
  for (const [id, check] of Object.entries(checks)) {
    if (ONLY.length > 0 && !ONLY.includes(id)) continue;
    try {
      const { ok, detail } = await check(browser);
      results.push({ id, ok, detail });
    } catch (error) {
      results.push({ id, ok: false, detail: String(error).split("\n")[0] });
    }
    const last = results.at(-1);
    console.log(`${last.ok ? "PASS" : "FAIL"} ${last.id} · ${last.detail}`);
  }
  await browser.close();
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`artifacts: ${OUT}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
