// The shell polish's scenarios, its measurements, and the baseline it compares against. The
// task list they came from is in git history, at docs/reference/shell-polish/tasks.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./harness.mjs";
import { BASE, sidebarDrawn } from "./lever.mjs";

export const BASELINE = path.join(ROOT, ".artifacts/polish/baseline");
export const THEMES = ["light", "dark"];
export const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 767, height: 900 },
  { width: 390, height: 844 },
];

export const titleBar = (page) => page.locator('header[data-slot="title-bar"]');
export const sidebar = (page) => page.locator('[data-slot="sidebar"]');
export const rail = (page) => page.locator('[data-slot="rail"]');
export const shown = (page) => page.locator('[role="tabpanel"]:not([inert])');
export const canvasIn = (page) => shown(page).locator('[aria-label="Compose canvas"]');
export const tabs = (page) => page.getByRole("tablist", { name: "Open threads" }).getByRole("tab");
export const layoutButton = (page, name) =>
  page.getByRole("group", { name: "Layout" }).getByRole("button", { name, exact: true });

// "?scenario=demo" plus any extra query, such as "chrome=painting".
const addressOf = (scenario, query) =>
  `${BASE}/?scenario=${scenario}${query === undefined ? "" : `&${query}`}`;

/**
 * A fresh context on a scenario in a theme, ready once the sidebar has drawn and stopped
 * loading (SC-bar). `motion` is "reduce" unless a predicate says otherwise.
 */
export async function openScenario(browser, { theme = "light", ...options }) {
  const { scenario = "demo", query, viewport = WIDTHS[0], motion = "reduce" } = options;
  const { ready = true, scale = 1 } = options;
  const context = await browser.newContext({
    viewport,
    reducedMotion: motion,
    deviceScaleFactor: scale,
    colorScheme: theme,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(addressOf(scenario, query), { waitUntil: "load" });
  if (ready !== false) {
    await sidebarDrawn(page);
    await page
      .locator('[data-sidebar="menu-skeleton"]')
      .first()
      .waitFor({ state: "detached", timeout: 20_000 });
    // A phone hides the tabs behind its row of views (ADR-116); one is still selected.
    await page
      .getByRole("tab", { selected: true, includeHidden: true })
      .waitFor({ state: "attached", timeout: 20_000 });
    await settle(page);
  }
  return { page, context, errors };
}

// Fonts loaded, every image decoded, two frames painted.
export async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    // shadcn's transition-all eases colours and fills even under reduced motion.
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished.catch(() => {})),
    );
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

/** SC-empty: the Refund audit main, which has no lanes, on the canvas. */
export async function toEmpty(page) {
  const link = sidebar(page).getByRole("link", { name: "Refund audit" });
  // A narrow window keeps the sidebar in a sheet, so it goes by the thread's address instead.
  if (await link.isVisible()) await link.click();
  else await page.goto(`${BASE}/t/t-004${new URL(page.url()).search}`);
  await page.locator('[role="tabpanel"][aria-label="Refund audit"]:not([inert])').waitFor();
  await layoutButton(page, "Canvas").click();
  await canvasIn(page).waitFor();
  await page.mouse.move(0, 0);
  await settle(page);
}

/** SC-lanes: the Last week's sales tab, the profit main on its canvas with lanes. */
export async function toLanes(page) {
  await tabs(page).filter({ hasText: "Last week's sales" }).click();
  await page.locator(`[role="tabpanel"][aria-label="Last week's sales"]:not([inert])`).waitFor();
  await canvasIn(page).waitFor();
  // A lane shows "Opening …" until its thread has loaded.
  await canvasIn(page)
    .getByText(/^Opening /)
    .first()
    .waitFor({ state: "detached" });
  await page.mouse.move(0, 0);
  await settle(page);
}

export const shot = (locator) => locator.screenshot({ animations: "disabled", caret: "hide" });

// WCAG 2.x relative luminance and contrast of two sRGB triples.
const linear = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminanceOf = ([r, g, b]) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
export function ratio(a, b) {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].toSorted((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// "rgb(59, 66, 60)", "rgba(…)" or a color-mix()'s "color(srgb 0.23 0.26 0.24)" → [59, 66, 60];
// alpha is ignored.
export function rgbOf(css) {
  const numbers = css
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);
  return css.startsWith("color(srgb") ? numbers.map((n) => Math.round(n * 255)) : numbers;
}

/** Every pixel of a PNG as [r, g, b] triples, decoded by the page itself. */
export function pixelsOf(page, png) {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const out = [];
    for (let i = 0; i < data.length; i += 4) out.push([data[i], data[i + 1], data[i + 2]]);
    return { width: bitmap.width, height: bitmap.height, pixels: out };
  }, png.toString("base64"));
}

/**
 * worst(el, fg): the lowest contrast of `fg` against any pixel of `el`'s box with its
 * foreground taken away, so a painted ground is measured pixel by pixel. "text" turns only the
 * element's glyphs transparent and keeps its own fill (a badge); "hide" hides it whole (an icon,
 * or a button whose border is the foreground). `grow` widens the box.
 */
export async function worst(page, el, fg, { mode = "text", grow = 0 } = {}) {
  const box = await el.boundingBox();
  if (box === null) throw new Error(`worst(): ${String(el)} has no box`);
  await el.evaluate((node) => {
    node.dataset.polishProbe = "";
  });
  const style = await page.addStyleTag({
    content:
      mode === "text"
        ? "[data-polish-probe],[data-polish-probe] *{color:transparent!important;-webkit-text-fill-color:transparent!important}"
        : "[data-polish-probe]{visibility:hidden!important}",
  });
  const png = await page.screenshot({
    clip: {
      x: box.x - grow,
      y: box.y - grow,
      width: box.width + 2 * grow,
      height: box.height + 2 * grow,
    },
    animations: "disabled",
    caret: "hide",
  });
  await style.evaluate((node) => {
    node.remove();
  });
  await el.evaluate((node) => {
    delete node.dataset.polishProbe;
  });
  const { pixels } = await pixelsOf(page, png);
  let min = Infinity;
  for (const pixel of pixels) min = Math.min(min, ratio(fg, pixel));
  return Math.round(min * 100) / 100;
}

/** running(): document-timeline animations still playing (the scroll-driven tab fade excluded). */
export const running = (page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.timeline instanceof DocumentTimeline && a.playState === "running")
      .map((a) => a.animationName ?? a.constructor.name),
  );

/** A resolved custom property of the root, as the browser computes it into a colour. */
export const tokenColour = (page, name, within = "html") =>
  page.evaluate(
    ({ token, host }) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      document.querySelector(host).append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    },
    { token: name, host: within },
  );

/** The boxes 0.6 records: the tab panel on screen, the sidebar, and every tab. */
export async function boxesOf(page) {
  return {
    tabpanel: await shown(page).boundingBox(),
    sidebar: await sidebar(page).boundingBox(),
    tabs: await tabs(page).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    ),
  };
}

// What 0.6 records, per theme; the aria trees are theme-independent but cost nothing twice.
// The title bar's height at each width in WIDTHS, resizing `page` as it goes: one row of 44px
// from 768px up, and two rows below (A2, ADR-116).
export async function headerHeights(page) {
  const heights = [];
  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    await settle(page);
    heights.push((await titleBar(page).boundingBox()).height); // → number
  }
  return heights;
}

async function record(browser, theme) {
  const out = {};
  const files = {};
  const bar = await openScenario(browser, { theme });
  out.bar = {
    header: await titleBar(bar.page).ariaSnapshot(),
    sidebar: await sidebar(bar.page).ariaSnapshot(),
    boxes: await boxesOf(bar.page),
  };
  files[`bar-tabpanel-${theme}`] = await shot(shown(bar.page));
  files[`bar-header-${theme}`] = await shot(titleBar(bar.page));
  await toEmpty(bar.page);
  out.empty = {
    canvas: await canvasIn(bar.page).ariaSnapshot(),
    header: await titleBar(bar.page).ariaSnapshot(),
    sidebar: await sidebar(bar.page).ariaSnapshot(),
  };
  files[`empty-canvas-${theme}`] = await shot(canvasIn(bar.page));
  await toLanes(bar.page);
  out.lanes = {
    canvas: await canvasIn(bar.page).ariaSnapshot(),
    header: await titleBar(bar.page).ariaSnapshot(),
    sidebar: await sidebar(bar.page).ariaSnapshot(),
  };
  files[`lanes-canvas-${theme}`] = await shot(canvasIn(bar.page));
  out.bar.heights = await headerHeights(bar.page);
  await bar.context.close();
  for (const scenario of ["long", "loading"]) {
    const opened = await openScenario(browser, { scenario, theme, ready: false });
    await sidebarDrawn(opened.page);
    await opened.page.waitForTimeout(1500);
    out[scenario] = {
      header: await titleBar(opened.page).ariaSnapshot(),
      sidebar: await sidebar(opened.page).ariaSnapshot(),
      canvas:
        (await canvasIn(opened.page).count()) > 0 ? await canvasIn(opened.page).ariaSnapshot() : "",
    };
    await opened.context.close();
  }
  return { out, files };
}

/** Writes the 0.6 baseline to `dir`: aria trees, boxes, and the region shots. */
export async function capture(browser, dir = BASELINE) {
  mkdirSync(dir, { recursive: true });
  const all = {};
  for (const theme of THEMES) {
    const { out, files } = await record(browser, theme);
    all[theme] = out;
    for (const [name, png] of Object.entries(files))
      writeFileSync(path.join(dir, `${name}.png`), png);
  }
  writeFileSync(path.join(dir, "baseline.json"), JSON.stringify(all, null, 2));
  return all;
}

export const readBaseline = (dir = BASELINE) => ({
  json: JSON.parse(readFileSync(path.join(dir, "baseline.json"), "utf8")),
  png: (name) => readFileSync(path.join(dir, `${name}.png`)),
});
