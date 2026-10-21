// The shell polish's acceptance predicates, one check per section (A to K) of its task list, which
// is in git history at docs/reference/shell-polish/tasks.md. Each returns { ok, detail } and runs
// in its own contexts, so one failure never hides another.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { carry, selectReply } from "./canvas-checks.mjs";
import { ROOT } from "./harness.mjs";
import { shotPath, sidebarDrawn } from "./lever.mjs";
import {
  boxesOf,
  canvasIn,
  headerHeights,
  openScenario,
  pixelsOf,
  rail,
  ratio,
  readBaseline,
  rgbOf,
  running,
  settle,
  shot,
  shown,
  sidebar,
  tabs,
  THEMES,
  titleBar,
  toEmpty,
  toLanes,
  tokenColour,
  WIDTHS,
  worst,
} from "./polish-checks.mjs";

const VARIANTS = ["solid", "painting"];
// The baseline was shot with the window 8px in; it now sits 16px in (ADR-111). A viewport 16px
// larger gives the window the baseline's exact size, so boxes and pixels compare one to one.
const GROWN = { width: 1456, height: 916 };
// The trim draws 2px over the body's edge (ADR-112); pixel comparisons leave that band out.
const TRIM = 2;
// The phone bar: 44px of controls over a row of views (ADR-116).
const PHONE_BAR = 82;

const query = (variant) => `chrome=${variant}`;
const inside = (r, x, y) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
// A box now, moved back by the window's 8px deeper inset, to compare with the baseline's.
const shift = (box) => ({ ...box, x: box.x - 8, y: box.y - 8 });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const round = (n) => Math.round(n * 100) / 100;
const min = (list) => (list.length === 0 ? Infinity : Math.min(...list));
const splash = (page) => shown(page).locator('[data-slot="canvas-splash"]');
const openSpace = (page) => canvasIn(page).locator(":scope > [data-ground]").first();
const lanes = (page) => canvasIn(page).locator(":scope > article");

// Every visible ink in `scope`: each node's own text, by the rectangle its glyphs fill, and
// each icon, by its box less whatever a later sibling paints over it (the bell's badge). A node
// faded out or hidden, or inside one, as a close button is at rest, is not an ink.
/* oxlint-disable unicorn/consistent-function-scoping -- the callback is serialized into the page,
   so its helpers have to live inside it */
function inksOf(scope) {
  return scope.evaluate((root) => {
    const found = [];
    const shownEl = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      for (let at = el; at !== null; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.opacity === "0" || style.visibility !== "visible") return false;
      }
      return el.closest(".sr-only") === null;
    };
    // A box cut to what its clipping ancestors show, and to the unfaded middle of the tab strip:
    // a label scrolled out of view is not an ink, and the fade at an edge is the cue that more
    // tabs lie past it.
    const plain = (r, el) => {
      let [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom];
      for (let at = el; at !== null && at !== root.parentElement; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const clip = at.getBoundingClientRect();
        const fade =
          at.classList.contains("tab-scroller") && at.scrollWidth > at.clientWidth ? 32 : 0;
        [left, top, right, bottom] = [
          Math.max(left, clip.left + fade),
          Math.max(top, clip.top),
          Math.min(right, clip.right - fade),
          Math.min(bottom, clip.bottom),
        ];
      }
      return {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    };
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (!shownEl(el)) continue;
      const colour = getComputedStyle(el).color;
      if (el.tagName.toLowerCase() === "svg") {
        const covers = [];
        for (let next = el.nextElementSibling; next !== null; next = next.nextElementSibling)
          covers.push(plain(next.getBoundingClientRect(), el.parentElement));
        found.push({
          kind: "icon",
          colour,
          rect: plain(el.getBoundingClientRect(), el.parentElement),
          covers,
          label: el.getAttribute("class"),
        });
        continue;
      }
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || node.textContent.trim() === "") continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        found.push({
          kind: "text",
          colour,
          rect: plain(range.getBoundingClientRect(), el),
          covers: [],
          label: node.textContent.trim().slice(0, 24),
        });
      }
    }
    return found;
  });
}
/* oxlint-enable unicorn/consistent-function-scoping */

// worst() for every ink in `scope` at once: one picture of the scope with every glyph and icon
// taken away, then each ink against the pixels under it. Text needs 4.5, icons 3.0 (ADR-065).
async function inkReport(page, scope) {
  const list = await inksOf(scope);
  const box = await scope.boundingBox();
  await scope.evaluate((el) => {
    el.dataset.polishScope = "";
  });
  const style = await page.addStyleTag({
    content:
      "[data-polish-scope],[data-polish-scope] *{color:transparent!important;-webkit-text-fill-color:transparent!important} [data-polish-scope] svg,svg[data-polish-scope]{visibility:hidden!important}",
  });
  const png = await page.screenshot({ clip: box, animations: "disabled", caret: "hide" });
  await style.evaluate((node) => {
    node.remove();
  });
  await scope.evaluate((el) => {
    delete el.dataset.polishScope;
  });
  const { pixels, width } = await pixelsOf(page, png);
  // At a device scale above 1 the picture has that many pixels per CSS pixel; every one counts.
  const dpr = await page.evaluate(() => devicePixelRatio);
  const failures = [];
  const worstOf = { text: [], icon: [] };
  for (const ink of list) {
    const fg = rgbOf(ink.colour);
    let lowest = Infinity;
    const [top, bottom] = [ink.rect.y * dpr, (ink.rect.y + ink.rect.height) * dpr];
    const [left, right] = [ink.rect.x * dpr, (ink.rect.x + ink.rect.width) * dpr];
    for (let y = Math.floor(top); y < Math.ceil(bottom); y += 1) {
      for (let x = Math.floor(left); x < Math.ceil(right); x += 1) {
        if (ink.covers.some((r) => inside(r, (x + 0.5) / dpr, (y + 0.5) / dpr))) continue;
        const [px, py] = [Math.round(x - box.x * dpr), Math.round(y - box.y * dpr)];
        if (px < 0 || py < 0 || px >= width) continue;
        const pixel = pixels[py * width + px];
        if (pixel !== undefined) lowest = Math.min(lowest, ratio(fg, pixel));
      }
    }
    lowest = round(lowest);
    worstOf[ink.kind].push(lowest);
    if (lowest < (ink.kind === "text" ? 4.5 : 3))
      failures.push(`${ink.kind} "${ink.label}" ${lowest}`);
  }
  // A scope with no ink measured nothing, which must never read as a pass.
  if (list.length === 0) failures.push("no inks found");
  return { text: min(worstOf.text), icons: min(worstOf.icon), failures };
}

// The pixels of two PNGs, compared with a band of `inset` pixels at each edge left out, and
// with it the 12px squares at the bottom corners where the trim bends round the window's corners.
async function samePixels(page, a, b, inset = 0, topCorners = 0) {
  const [pa, pb] = [await pixelsOf(page, a), await pixelsOf(page, b)];
  if (pa.width !== pb.width || pa.height !== pb.height) return { same: false, differ: -1 };
  let differ = 0;
  for (let y = inset; y < pa.height - inset; y += 1) {
    for (let x = inset; x < pa.width - inset; x += 1) {
      const corner = inset > 0 && y >= pa.height - 12 && (x < 12 || x >= pa.width - 12);
      const top = y < topCorners && (x < topCorners || x >= pa.width - topCorners);
      if (corner || top) continue;
      const i = y * pa.width + x;
      if (pa.pixels[i].some((c, k) => c !== pb.pixels[i][k])) differ += 1;
    }
  }
  return { same: differ === 0, differ };
}

async function pixelAt(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return (await pixelsOf(page, png)).pixels[0];
}

const barColour = async (page) =>
  rgbOf(await titleBar(page).evaluate((el) => getComputedStyle(el).backgroundColor));

// The share of the middle 60% of a side that `hit` covers: a rounded ring bends away before a
// side's ends, and a clipped or missing side covers none of its middle.
const along = (length, hit) => {
  const [from, to] = [Math.floor(length * 0.2), Math.ceil(length * 0.8)];
  let covered = 0;
  for (let t = from; t < to; t += 1) if (hit(t)) covered += 1;
  return covered / (to - from);
};
const strip = (from) => Array.from({ length: 8 }, (_, k) => from + k);

// E3's ring: how much of each side of a focused control the ring covers. Two pictures of the
// control's box grown by 4px, focused and not; a ring pixel is one that changed and stands 3:1
// off what was there before. A side counts the share of its length with such a pixel in the 8px
// strip across that edge, so a ring clipped on one side, or missing, fails.
async function ringCover(page, control) {
  const box = await control.boundingBox();
  const clip = { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 };
  const focused = await pixelsOf(page, await page.screenshot({ clip }));
  await control.evaluate((el) => {
    el.blur();
  });
  await settle(page);
  const rest = await pixelsOf(page, await page.screenshot({ clip }));
  const { width, height } = focused;
  const ring = (x, y) => {
    const i = y * width + x;
    return ratio(focused.pixels[i], rest.pixels[i]) >= 3;
  };
  const sides = {
    top: along(width, (x) => strip(0).some((y) => ring(x, y))),
    bottom: along(width, (x) => strip(height - 8).some((y) => ring(x, y))),
    left: along(height, (y) => strip(0).some((x) => ring(x, y))),
    right: along(height, (y) => strip(width - 8).some((x) => ring(x, y))),
  };
  return round(Math.min(...Object.values(sides)));
}

// Tab until `control` has the keyboard's focus.
async function tabTo(page, control, stops = 40) {
  await page.locator("body").focus();
  for (let i = 0; i < stops; i += 1) {
    await page.keyboard.press("Tab");
    if (await control.evaluate((el) => el === document.activeElement)) return;
  }
}

// E3 for the focus stops of the bar (the sidebar toggle, the active tab, the next tab, the bell)
// and the account at the rail's foot, each as the share of its ring's worst side. The account
// comes after the rail's places, so it gets a longer walk.
async function ringsOf(page) {
  const bar = titleBar(page);
  const out = {};
  for (const [label, control] of [
    ["toggle", bar.getByRole("button", { name: "Toggle sidebar" })],
    ["active tab", bar.getByRole("tab", { selected: true })],
    ["bell", bar.getByRole("button", { name: /^Notifications/ })],
    ["account", rail(page).getByRole("button", { name: "Account" })],
  ]) {
    await tabTo(page, control, label === "account" ? 150 : 40);
    await settle(page);
    out[label] = await ringCover(page, control);
    if (label === "active tab") {
      await tabTo(page, control);
      await page.keyboard.press("ArrowRight");
      const next = bar.locator('[role="tab"]:focus');
      await settle(page);
      out["next tab"] = await ringCover(page, next);
    }
  }
  return out;
}

export const polishChecks = {
  // Section 1: the solid bar.
  async A(browser) {
    const notes = [];
    let ok = true;
    for (const theme of THEMES) {
      const { page, context } = await openScenario(browser, { theme, query: query("solid") });
      const bg = await titleBar(page).evaluate((el) => getComputedStyle(el).backgroundColor);
      const chrome = await tokenColour(page, "--chrome");
      const a1 = bg === chrome && chrome === "rgb(59, 66, 60)";
      // Measured before the widths below, since a tab eases to its new width after a resize.
      const report = await inkReport(page, titleBar(page));
      const heights = await headerHeights(page);
      const a2 = heights.every((h, i) => h === (WIDTHS[i].width < 768 ? PHONE_BAR : 44));
      const a3 = report.failures.length === 0;
      ok &&= a1 && a2 && a3;
      notes.push(
        `${theme}: A1 ${bg} ${a1}; A2 ${heights.join("/")}; A3 text ${report.text} icons ${report.icons} ${report.failures.join(", ")}`,
      );
      await context.close();
    }
    let hex = "";
    try {
      hex = execFileSync("rg", ["-n", "#[0-9a-fA-F]{3,8}\\b", "apps/web/src/shell"], {
        cwd: ROOT,
        encoding: "utf8",
      });
    } catch {
      hex = "";
    }
    const a4 = hex.trim() === "";
    const base = readBaseline().json.light;
    const a5 = [];
    for (const [scenario, key] of [
      ["demo", "bar"],
      ["long", "long"],
      ["loading", "loading"],
    ]) {
      const opened = await openScenario(browser, { scenario, ready: scenario === "demo" });
      if (scenario !== "demo") {
        await sidebarDrawn(opened.page);
        await opened.page.waitForTimeout(1500);
      }
      a5.push(`${scenario} ${(await titleBar(opened.page).ariaSnapshot()) === base[key].header}`);
      await opened.context.close();
    }
    ok &&= a4 && a5.every((each) => each.endsWith("true"));
    return { ok, detail: `${notes.join("; ")}; A4 no hex ${a4}; A5 ${a5.join(", ")}` };
  },

  // Section 2: the painted bar.
  async B(browser) {
    const notes = [];
    let ok = true;
    for (const theme of THEMES) {
      for (const viewport of WIDTHS.slice(0, 2)) {
        const { page, context } = await openScenario(browser, {
          theme,
          viewport,
          query: query("painting"),
        });
        const report = await inkReport(page, titleBar(page));
        ok &&= report.failures.length === 0;
        notes.push(
          `${theme} ${viewport.width}: text ${report.text} icons ${report.icons} ${report.failures.join(", ")}`,
        );
        await context.close();
      }
    }
    {
      // At 2x the painting's own pixels reach the screen unaveraged.
      const sharp = await openScenario(browser, { query: query("painting"), scale: 2 });
      const report = await inkReport(sharp.page, titleBar(sharp.page));
      ok &&= report.failures.length === 0;
      notes.push(
        `light 1440 at 2x: text ${report.text} icons ${report.icons} ${report.failures.join(", ")}`,
      );
      await sharp.context.close();
    }
    const long = await openScenario(browser, { scenario: "long", query: query("painting") });
    await tabs(long.page).last().scrollIntoViewIfNeeded();
    await settle(long.page);
    const longReport = await inkReport(long.page, titleBar(long.page));
    ok &&= longReport.failures.length === 0;
    notes.push(
      `long, last tab: text ${longReport.text} icons ${longReport.icons} ${longReport.failures.join(", ")}`,
    );
    await long.context.close();

    const fresh = await openScenario(browser, { query: query("painting"), ready: false });
    const before = (await titleBar(fresh.page).boundingBox())?.height;
    await sidebarDrawn(fresh.page);
    await settle(fresh.page);
    const size = await fresh.page.evaluate(
      () =>
        performance
          .getEntriesByType("resource")
          .find((entry) => entry.name.includes("/chrome/painting.webp"))?.transferSize ?? -1,
    );
    const after = (await titleBar(fresh.page).boundingBox()).height;
    const b2 = size > 0 && size <= 80_000 && before === 44 && after === 44;
    await fresh.context.close();

    let b3 = true;
    {
      const opened = await openScenario(browser, { query: query("painting"), ready: false });
      await opened.context.route("**/chrome/painting.webp", (route) => route.abort());
      await opened.page.reload();
      await sidebarDrawn(opened.page);
      await opened.page.getByRole("tab", { selected: true }).waitFor();
      await settle(opened.page);
      const report = await inkReport(opened.page, titleBar(opened.page));
      b3 = report.failures.length === 0;
      notes.push(`blocked: text ${report.text} icons ${report.icons}`);
      await opened.context.close();
    }
    const shots = [];
    for (let i = 0; i < 2; i += 1) {
      const opened = await openScenario(browser, { query: query("painting") });
      shots.push(await shot(titleBar(opened.page)));
      await opened.context.close();
    }
    const probe = await openScenario(browser, {});
    const b4diff = await samePixels(probe.page, shots[0], shots[1]);
    await probe.context.close();
    const b4 = b4diff.same;
    const credits = path.join(ROOT, "apps/web/public/chrome/CREDITS.md");
    const text = existsSync(credits) ? readFileSync(credits, "utf8") : "";
    const b5 = /painting/i.test(text) && /source/i.test(text) && /licen[cs]e/i.test(text);
    ok &&= b2 && b3 && b4 && b5;
    return {
      ok,
      detail: `B1 ${notes.join("; ")}; B2 ${size} bytes, 44 before ${before} after ${after} ${b2}; B3 ${b3}; B4 ${b4} (${b4diff.differ} px differ); B5 ${b5}`,
    };
  },

  // Section 3: the trim. Gone (ADR-136): the window's body draws no coloured line, in either
  // theme, and no token names one.
  async C(browser) {
    const notes = [];
    let ok = true;
    for (const theme of THEMES) {
      const { page, context } = await openScenario(browser, { theme });
      const body = page.locator('[data-slot="window-body"]');
      const look = await body.evaluate((el) => getComputedStyle(el, "::after").boxShadow);
      const declared = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--trim").trim(),
      );
      const c1 = look === "none" && declared === "";
      ok &&= c1;
      notes.push(`${theme}: body ::after ${look}, --trim "${declared}" ${c1}`);
      await context.close();
    }
    return { ok, detail: notes.join("; ") };
  },

  // Section 4: the tabs on the bar.
  async D(browser) {
    const notes = [];
    let ok = true;
    for (const theme of THEMES) {
      for (const variant of VARIANTS) {
        const { page, context } = await openScenario(browser, { theme, query: query(variant) });
        // D1: every tab at rest and hovered, its label and its icons (the close shows on hover),
        // here and in the long scenario's twelve, each scrolled into view.
        const labels = [];
        const misses = [];
        const sweep = async (on) => {
          for (let i = 0; i < (await tabs(on).count()); i += 1) {
            const tab = tabs(on).nth(i);
            const host = tab.locator("xpath=..");
            await tab.scrollIntoViewIfNeeded();
            await on.mouse.move(700, 600);
            await settle(on);
            for (const state of ["rest", "hover"]) {
              if (state === "hover") {
                await tab.hover();
                await settle(on);
              }
              const report = await inkReport(on, host);
              labels.push(report.text);
              misses.push(...report.failures.map((f) => `tab ${i} ${state}: ${f}`));
            }
          }
          await on.mouse.move(700, 600);
          await settle(on);
        };
        await sweep(page);
        const long = await openScenario(browser, {
          scenario: "long",
          theme,
          query: query(variant),
        });
        await sweep(long.page);
        await long.context.close();
        const active = tabs(page).and(page.getByRole("tab", { selected: true }));
        const fill = rgbOf(await active.evaluate((el) => getComputedStyle(el).backgroundColor));
        const d2 =
          variant === "solid"
            ? ratio(fill, await barColour(page))
            : ratio(fill, rgbOf(await tokenColour(page, "--chrome-painting")));
        const d1 = misses.length === 0 && min(labels) >= 4.5;
        ok &&= d1 && d2 >= 3;
        notes.push(`${theme} ${variant}: D1 ${min(labels)} ${misses.join(", ")}; D2 ${round(d2)}`);
        await context.close();
      }
    }
    // D3: the tabs keep 0.6's boxes, moved together so the first starts 4px past the sidebar's
    // edge, which they follow as the sidebar is resized (the ChatGPT app's alignment).
    const grown = await openScenario(browser, { viewport: GROWN });
    const base = readBaseline().json.light.bar.boxes.tabs;
    const now = (await boxesOf(grown.page)).tabs.map(shift);
    const sidebarEdge = (await grown.page.getByRole("main").boundingBox()).x - 8; // → as shifted
    const by = now.length > 0 && base.length > 0 ? now[0].x - base[0].x : 0;
    const d3 =
      same(
        now.map((box) => ({ ...box, x: box.x - by })),
        base,
      ) && Math.abs(now[0].x - (sidebarEdge + 4)) < 0.5;
    await grown.context.close();

    const long = await openScenario(browser, { scenario: "long", query: query("solid") });
    const scroller = long.page.locator(".tab-scroller");
    const mask = await scroller.evaluate((el) => getComputedStyle(el).maskImage);
    const box = await scroller.boundingBox();
    // The column 2px inside the faded right edge, top to bottom: the bar shows through, not
    // paper. Its median pixel is the bar; a glyph fading out may tint a few above it.
    const column = await pixelsOf(
      long.page,
      await long.page.screenshot({
        clip: { x: box.x + box.width - 3, y: box.y, width: 1, height: box.height },
      }),
    );
    const edge = column.pixels.toSorted((p, q) => p[1] - q[1])[
      Math.floor(column.pixels.length / 2)
    ];
    const bar = await barColour(long.page);
    const d4 = mask !== "none" && edge.every((c, i) => Math.abs(c - bar[i]) <= 2);
    await long.context.close();

    // D5 in pixels, on both bars: the painted bar's fill is a translucent wash, so what counts is
    // the skeleton against the bar just beside it.
    const skeletons = {};
    for (const variant of VARIANTS) {
      const loading = await openScenario(browser, {
        scenario: "loading",
        query: query(variant),
        ready: false,
      });
      await sidebarDrawn(loading.page);
      const held = await titleBar(loading.page).locator('[data-slot="skeleton"]').boundingBox();
      const mid = held.y + held.height / 2;
      skeletons[variant] = round(
        ratio(
          await pixelAt(loading.page, held.x + held.width / 2, mid),
          await pixelAt(loading.page, held.x + held.width + 3, mid),
        ),
      );
      await loading.context.close();
    }
    const d5 = Math.min(...Object.values(skeletons));

    const keys = await openScenario(browser, {});
    const count = await tabs(keys.page).count();
    await tabs(keys.page).first().focus();
    await keys.page.keyboard.press("Delete");
    await keys.page.waitForTimeout(300);
    const afterDelete = await tabs(keys.page).count();
    await tabs(keys.page).first().click({ button: "middle" });
    await keys.page.waitForTimeout(300);
    const afterMiddle = await tabs(keys.page).count();
    const d6 = afterDelete === count - 1 && afterMiddle === count - 2;
    await keys.context.close();
    ok &&= d3 && d4 && d5 >= 1.2 && d6;
    return {
      ok,
      detail: `${notes.join("; ")}; D3 ${d3}; D4 mask ${mask !== "none"} edge ${edge} bar ${bar} ${d4}; D5 ${JSON.stringify(skeletons)}; D6 ${count}→${afterDelete}→${afterMiddle}`,
    };
  },

  // Section 5: the bell, the account and the rest of the bar.
  async E(browser) {
    const notes = [];
    let ok = true;
    for (const theme of THEMES) {
      const { page, context } = await openScenario(browser, { theme });
      const bar = await barColour(page);
      const badge = titleBar(page)
        .getByRole("button", { name: /^Notifications/ })
        .locator("span[aria-hidden]");
      const badgeFill = rgbOf(await badge.evaluate((el) => getComputedStyle(el).backgroundColor));
      const badgeText = rgbOf(await badge.evaluate((el) => getComputedStyle(el).color));
      const e2 = ratio(badgeFill, bar) >= 3 && ratio(badgeText, badgeFill) >= 4.5;
      const rings = await ringsOf(page);
      const e3 = Object.values(rings).every((r) => r >= 0.9);
      await page.keyboard.press("Escape");
      await titleBar(page)
        .getByRole("button", { name: /^Notifications/ })
        .click();
      const menu = page.getByRole("menu");
      await menu.waitFor();
      const menuBg = await menu.evaluate((el) => getComputedStyle(el).backgroundColor);
      const itemInk = await menu
        .getByRole("menuitem")
        .first()
        .locator("span span")
        .nth(1)
        .evaluate((el) => getComputedStyle(el).color);
      const e4 =
        menuBg === (await tokenColour(page, "--compose-bg")) &&
        itemInk === (await tokenColour(page, "--ink"));
      await page.keyboard.press("Escape");
      const bell = await titleBar(page)
        .getByRole("button", { name: /^Notifications/ })
        .boundingBox();
      const header = await titleBar(page).boundingBox();
      const inBar = await titleBar(page).getByRole("button", { name: "Account" }).count();
      const inRail = await rail(page).getByRole("button", { name: "Account" }).count();
      const rightmost = await titleBar(page)
        .getByRole("button")
        .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
      // The bell is the bar's last control, flush with its 12px padding; the one account is at the
      // rail's foot.
      const e5 =
        inBar === 0 &&
        inRail === 1 &&
        Math.abs(bell.x + bell.width - rightmost) < 1 &&
        header.x + header.width - (bell.x + bell.width) <= 12;
      const pressed = titleBar(page).locator('[aria-pressed="true"]');
      const pressedFill = rgbOf(
        await pressed.evaluate((el) => getComputedStyle(el).backgroundColor),
      );
      const e6 = ratio(pressedFill, bar) >= 3;
      const lights = await titleBar(page)
        .locator('[data-slot="traffic-lights"] span')
        .evaluateAll((els) =>
          els.map((el) => [
            getComputedStyle(el).borderTopColor,
            getComputedStyle(el).borderTopWidth,
            getComputedStyle(el).backgroundColor,
          ]),
        );
      const traffic = [
        await tokenColour(page, "--traffic-close"),
        await tokenColour(page, "--traffic-minimise"),
        await tokenColour(page, "--traffic-zoom"),
      ];
      const e7 = lights.every(([, w, fill], i) => w === "0px" && fill === traffic[i]);
      const right = await inkReport(page, titleBar(page).locator(":scope > div").last());
      const e1 = right.failures.length === 0;
      ok &&= e1 && e2 && e3 && e4 && e5 && e6 && e7;
      notes.push(
        `${theme}: E1 ${right.text}/${right.icons}; E2 ${round(ratio(badgeFill, bar))}/${round(ratio(badgeText, badgeFill))}; E3 ${JSON.stringify(rings)}; E4 ${menuBg} ${itemInk} ${e4}; E5 ${e5}; E6 ${round(ratio(pressedFill, bar))}; E7 ${e7}`,
      );
      await context.close();
    }
    {
      const long = await openScenario(browser, { scenario: "long" });
      const badge = titleBar(long.page)
        .getByRole("button", { name: /^Notifications/ })
        .locator("span[aria-hidden]");
      const text = await badge.innerText();
      const fill = rgbOf(await badge.evaluate((el) => getComputedStyle(el).backgroundColor));
      const ink = rgbOf(await badge.evaluate((el) => getComputedStyle(el).color));
      const e2long =
        text === "9+" && ratio(fill, await barColour(long.page)) >= 3 && ratio(ink, fill) >= 4.5;
      ok &&= e2long;
      notes.push(`long badge "${text}" ${e2long}`);
      await long.context.close();
    }
    {
      const painted = await openScenario(browser, { query: query("painting") });
      const paintedRings = await ringsOf(painted.page);
      ok &&= Object.values(paintedRings).every((r) => r >= 0.9);
      notes.push(`painting E3 ${JSON.stringify(paintedRings)}`);
      const right = await inkReport(
        painted.page,
        titleBar(painted.page).locator(":scope > div").last(),
      );
      ok &&= right.failures.length === 0;
      notes.push(`painting right group ${right.text}/${right.icons}`);
      await painted.context.close();
    }
    // E1 for a signed-in account (at the rail's foot) with no picture: the same fallback, holding
    // initials, as a WorkOS user's is. A build without sign-in always draws the fallback.
    for (const variant of VARIANTS) {
      const bare = await openScenario(browser, { query: query(variant), ready: false });
      await sidebarDrawn(bare.page);
      const fallback = rail(bare.page).locator('[data-slot="avatar-fallback"]');
      await fallback.waitFor();
      await fallback.evaluate((el) => {
        el.textContent = "EA";
      });
      await settle(bare.page);
      const initials = await inkReport(bare.page, fallback);
      ok &&= initials.failures.length === 0;
      notes.push(`${variant} initials ${initials.text} ${initials.failures.join(", ")}`);
      await bare.context.close();
    }
    return { ok, detail: notes.join("; ") };
  },

  // Section 6: the window inside the browser.
  async F(browser) {
    const notes = [];
    let ok = true;
    for (const theme of THEMES) {
      const { page, context } = await openScenario(browser, { theme });
      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        await settle(page);
        const win = await page.locator('[data-slot="window"]').boundingBox();
        const inset = viewport.width >= 768 ? 16 : 0;
        const f1 =
          win.x === inset &&
          win.y === inset &&
          win.width === viewport.width - 2 * inset &&
          win.height === viewport.height - 2 * inset;
        const radius = await page
          .locator('[data-slot="window"]')
          .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
        const f2 = radius === (viewport.width >= 768 ? "12px" : "0px");
        const f5 = await page.evaluate(
          () =>
            document.scrollingElement.scrollWidth === innerWidth &&
            document.scrollingElement.scrollHeight === innerHeight,
        );
        ok &&= f1 && f2 && f5;
        if (!(f1 && f2 && f5))
          notes.push(`${theme} ${viewport.width}: F1 ${f1} F2 ${radius} F5 ${f5}`);
      }
      await page.setViewportSize(WIDTHS[0]);
      await settle(page);
      const ground = await pixelAt(page, 3, 3);
      const win = await page.locator('[data-slot="window"]').boundingBox();
      const body = await pixelAt(page, win.x + 12, win.y + win.height - 12);
      const bar = await barColour(page);
      const f3 = ratio(ground, body) >= 1.3 && ratio(ground, bar) >= 1.5;
      const corners = [
        await pixelAt(page, win.x + 1, win.y + 1),
        await pixelAt(page, win.x + win.width - 2, win.y + 1),
      ];
      // The window's shadow darkens the ground by a few levels right beside it; the bar's green
      // would be tens of levels away.
      const f4 = corners.every((c) => c.every((v, i) => Math.abs(v - ground[i]) <= 6));
      ok &&= f3 && f4;
      notes.push(
        `${theme}: F3 ${round(ratio(ground, body))}/${round(ratio(ground, bar))}; F4 ${f4}`,
      );
      await context.close();
    }
    return {
      ok,
      detail: `F1, F2, F5 at every width ${notes.every((n) => !n.includes("F1"))}; ${notes.join("; ")}`,
    };
  },

  // Section 7: the canvas splash.
  async G(browser) {
    const notes = [];
    let ok = true;
    const baseline = readBaseline();
    for (const theme of THEMES) {
      const { page, context } = await openScenario(browser, { theme });
      await toEmpty(page);
      const g1empty = await splash(page).count();
      const g3empty = (await canvasIn(page).ariaSnapshot()) === baseline.json[theme].empty.canvas;
      const words = await inkReport(page, openSpace(page));
      const button = openSpace(page).getByRole("button", { name: "Create blank thread" });
      const border = rgbOf(await button.evaluate((el) => getComputedStyle(el).borderTopColor));
      const g4 = [words.text, await worst(page, button, border, { mode: "hide" })];
      const drawing = shown(page).locator('[data-slot="splash-drawing"]');
      const box = await drawing.boundingBox();
      const hideOthers = await page.addStyleTag({
        content: "[data-ground] > p,[data-ground] > button{visibility:hidden!important}",
      });
      const withDrawing = await page.screenshot({ clip: box });
      await drawing.evaluate((el) => {
        el.style.visibility = "hidden";
      });
      const without = await page.screenshot({ clip: box });
      await drawing.evaluate((el) => {
        el.style.visibility = "";
      });
      await hideOthers.evaluate((node) => {
        node.remove();
      });
      const [a, b] = [await pixelsOf(page, withDrawing), await pixelsOf(page, without)];
      let darkest = 1;
      const w = a.width;
      const cornerSame = [
        [2, 2],
        [w - 3, 2],
        [2, a.height - 3],
        [w - 3, a.height - 3],
      ].every(([x, y]) => a.pixels[y * w + x].every((c, i) => c === b.pixels[y * w + x][i]));
      for (const [i, pixel] of a.pixels.entries()) {
        if (pixel.some((c, k) => c !== b.pixels[i][k]))
          darkest = Math.max(darkest, ratio(pixel, b.pixels[i]));
      }
      const g5 = darkest >= 1.05 && darkest <= 1.6;
      ok &&= g1empty === 1 && g3empty && g4[0] >= 4.5 && g4[1] >= 3 && g5 && cornerSame;
      notes.push(
        `${theme}: G1 empty ${g1empty}; G3 empty ${g3empty}; G4 ${g4.join("/")}; G5 ${round(darkest)}; G6 ${cornerSame}`,
      );
      // The brief's order, bottom to top: field, lit fill, drawing, words and button.
      const order = await openSpace(page).evaluate((space) => {
        const layer = space.querySelector('[data-slot="canvas-splash"]');
        return {
          fill: getComputedStyle(space, "::before").zIndex,
          drawing: getComputedStyle(layer).zIndex,
        };
      });
      const stacked = Number(order.fill) < Number(order.drawing) && Number(order.drawing) < 0;
      ok &&= stacked;
      notes.push(`${theme}: order ${JSON.stringify(order)} ${stacked}`);
      if (theme === "light") await page.screenshot({ path: shotPath("G-empty-light") });
      await toLanes(page);
      const g1lanes = await splash(page).count();
      const g3lanes = (await canvasIn(page).ariaSnapshot()) === baseline.json[theme].lanes.canvas;
      ok &&= g1lanes === 0 && g3lanes;
      notes.push(`${theme}: G1 lanes ${g1lanes}; G3 lanes ${g3lanes}`);
      await context.close();

      const grown = await openScenario(browser, { theme, viewport: GROWN });
      await toLanes(grown.page);
      const now = await shot(canvasIn(grown.page));
      const g9 = await samePixels(grown.page, now, baseline.png(`lanes-canvas-${theme}`), TRIM);
      ok &&= g9.same;
      notes.push(`${theme}: G9 lanes canvas as baseline ${g9.same} (${g9.differ} px differ)`);
      await grown.context.close();
    }

    const { page, context } = await openScenario(browser, {});
    await toEmpty(page);
    await canvasIn(page).getByRole("button", { name: "Create blank thread" }).click();
    await lanes(page).first().waitFor();
    const afterCreate = await splash(page).count();
    await canvasIn(page)
      .getByRole("button", { name: /^Close / })
      .first()
      .click();
    await page.waitForTimeout(300);
    const afterClose = await splash(page).count();
    const g2 = afterCreate === 0 && afterClose === 1;

    const drops = [];
    const litBorders = [];
    const olive = await tokenColour(page, "--olive");
    // Once on the picture's upper quarter, once on the lower, where Atlas's body is.
    for (const target of ["upper", "lower"]) {
      const spaceBox = await openSpace(page).boundingBox();
      const point = {
        x: spaceBox.x + spaceBox.width / 2,
        y: spaceBox.y + spaceBox.height * (target === "upper" ? 0.25 : 0.75),
      };
      const under = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? "",
        point,
      );
      const from = await selectReply(page, 12);
      await carry(page, from, [point]);
      litBorders.push(
        await page
          .locator("[data-ground][data-lit]")
          .first()
          .evaluate((el) => getComputedStyle(el).borderTopColor)
          .catch(() => "none"),
      );
      await page.mouse.up();
      await lanes(page)
        .first()
        .waitFor({ timeout: 10_000 })
        .catch(() => {});
      drops.push({ target, under, lanes: await lanes(page).count() });
      await canvasIn(page)
        .getByRole("button", { name: /^Close / })
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(300);
    }
    const g7 = drops.every((d) => d.lanes === 1 && d.under !== "IMG");
    // The three looks (ADR-135) ship a painting or the stencil, well past the sphere's bound.
    const bound = 300_000;
    const g8 = litBorders.every((c) => c === olive);
    const transfer = await page.evaluate(
      () =>
        performance.getEntriesByType("resource").find((entry) => entry.name.includes("/splash/"))
          ?.transferSize ?? -1,
    );
    const g10 = transfer > 0 && transfer <= bound;
    await context.close();
    ok &&= g2 && g7 && g8 && g10;
    return {
      ok,
      detail: `${notes.join("; ")}; G2 ${afterCreate}→${afterClose}; G7 ${JSON.stringify(drops)}; G8 ${litBorders.join("/")} ${g8}; G10 ${transfer} bytes`,
    };
  },

  // Section 8: Kay. The mascot left the canvas (ADR-135), and Kay's face left the avatar (ADR-114,
  // amended): H5 is the person glyph, with no picture.
  async H(browser) {
    const { page, context } = await openScenario(browser, {});
    await toEmpty(page);
    const account = rail(page).getByRole("button", { name: "Account" });
    const h5 =
      (await account.locator("img").count()) === 0 &&
      (await account.locator('[data-slot="avatar-fallback"] svg').count()) === 1;
    const gone = (await shown(page).locator('[data-slot="kay-mascot"]').count()) === 0;
    await context.close();
    return { ok: h5 && gone, detail: `H5 ${h5}; mascot gone ${gone}` };
  },

  // Section 9: dark mode. A to G loop over both themes; this adds I2 and I3.
  async I(browser) {
    // I2 at rest, and with a ghost button hovered, whose shadcn hover differs by theme.
    const heads = [];
    const hovered = [];
    for (const theme of THEMES) {
      const { page, context } = await openScenario(browser, { theme, query: query("solid") });
      await page.mouse.move(700, 600);
      await settle(page);
      heads.push(await shot(titleBar(page)));
      const plus = titleBar(page).getByRole("button", { name: "New thread" });
      await plus.hover();
      await settle(page);
      hovered.push(await shot(plus));
      await context.close();
    }
    const probe = await openScenario(browser, { theme: "light" });
    // The window's rounded top corners show the desk, which is the page's and changes with it.
    const i2rest = await samePixels(probe.page, heads[0], heads[1], 0, 12);
    const i2hover = await samePixels(probe.page, hovered[0], hovered[1]);
    const i2 = { same: i2rest.same && i2hover.same, differ: i2rest.differ + i2hover.differ };
    const look = async () => ({
      paper: await tokenColour(probe.page, "--paper"),
      ink: await tokenColour(probe.page, "--ink"),
      bar: await titleBar(probe.page).evaluate((el) => getComputedStyle(el).backgroundColor),
    });
    const before = await look();
    await rail(probe.page).getByRole("button", { name: "Account" }).click();
    await probe.page.getByRole("menuitemradio", { name: "Dark" }).click();
    await probe.page.keyboard.press("Escape");
    await probe.page.waitForTimeout(200);
    const after = await look();
    const i3 = before.paper !== after.paper && before.ink !== after.ink && before.bar === after.bar;
    await probe.context.close();
    return {
      ok: i2.same && i3,
      detail: `I2 bar identical across themes ${i2.same} (${i2.differ} px differ); I3 ${JSON.stringify(before)} → ${JSON.stringify(after)} ${i3}`,
    };
  },

  // Section 10: reduced motion.
  async J(browser) {
    const notes = [];
    const reduce = await openScenario(browser, {});
    const barRunning = await running(reduce.page);
    await toEmpty(reduce.page);
    const emptyRunning = await running(reduce.page);
    await canvasIn(reduce.page).getByRole("button", { name: "Create blank thread" }).click();
    await lanes(reduce.page).first().waitFor();
    await canvasIn(reduce.page)
      .getByRole("button", { name: /^Close / })
      .first()
      .click();
    await reduce.page.waitForTimeout(100);
    const cycleRunning = await running(reduce.page);
    const one = await shot(canvasIn(reduce.page));
    await reduce.page.waitForTimeout(1000);
    const two = await shot(canvasIn(reduce.page));
    const j1 =
      barRunning.length === 0 &&
      emptyRunning.length === 0 &&
      cycleRunning.length === 0 &&
      Buffer.compare(one, two) === 0;
    const motion = await splash(reduce.page).evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.transitionDuration} ${style.animationName}`;
    });
    const j3 = motion === "0s none";
    notes.push(
      `J1 ${barRunning}|${emptyRunning}|${cycleRunning} same ${Buffer.compare(one, two) === 0}; J3 ${motion}`,
    );
    await reduce.context.close();
    const moving = await openScenario(browser, { motion: "no-preference" });
    await toEmpty(moving.page);
    await moving.page.waitForTimeout(1000);
    const j2 = (await running(moving.page)).length === 0;
    notes.push(`J2 ${j2}`);
    await moving.context.close();
    return { ok: j1 && j2 && j3, detail: notes.join("; ") };
  },

  // Section 12: the guards. K3 is web-check and the repo gates; K4 is tokens.test.ts.
  async K(browser) {
    const baseline = readBaseline();
    const notes = [];
    let ok = true;
    for (const theme of THEMES) {
      const base = baseline.json[theme];
      const { page, context } = await openScenario(browser, { theme, viewport: GROWN });
      const k1 = [
        (await titleBar(page).ariaSnapshot()) === base.bar.header,
        (await sidebar(page).ariaSnapshot()) === base.bar.sidebar,
      ];
      const k2 = await samePixels(
        page,
        await shot(shown(page)),
        baseline.png(`bar-tabpanel-${theme}`),
        TRIM,
      );
      await toEmpty(page);
      k1.push(
        (await titleBar(page).ariaSnapshot()) === base.empty.header,
        (await sidebar(page).ariaSnapshot()) === base.empty.sidebar,
        (await canvasIn(page).ariaSnapshot()) === base.empty.canvas,
      );
      await toLanes(page);
      k1.push(
        (await titleBar(page).ariaSnapshot()) === base.lanes.header,
        (await sidebar(page).ariaSnapshot()) === base.lanes.sidebar,
        (await canvasIn(page).ariaSnapshot()) === base.lanes.canvas,
      );
      for (const scenario of ["long", "loading"]) {
        const opened = await openScenario(browser, { scenario, theme, ready: scenario === "long" });
        await sidebarDrawn(opened.page);
        await opened.page.waitForTimeout(1500);
        const canvas =
          (await canvasIn(opened.page).count()) > 0
            ? await canvasIn(opened.page).ariaSnapshot()
            : "";
        k1.push(
          (await titleBar(opened.page).ariaSnapshot()) === base[scenario].header,
          (await sidebar(opened.page).ariaSnapshot()) === base[scenario].sidebar,
          canvas === base[scenario].canvas,
        );
        await opened.context.close();
      }
      ok &&= k1.every(Boolean) && k2.same;
      notes.push(
        `${theme}: K1 ${k1.join("/")}; K2 tab panel as baseline ${k2.same} (${k2.differ} px differ)`,
      );
      await context.close();
    }
    return { ok, detail: notes.join("; ") };
  },
};
