// Checks for the projects panel's peek from behind the rail, its resizable edge and the title
// bar's tabs that follow that edge, on a desktop window with motion on.
// oxlint-disable no-await-in-loop -- one pointer drives one page, so each step waits for the last
import { BASE, shotPath } from "./lever.mjs";

const DEMO = `${BASE}/?scenario=demo`;
const DESK = { width: 1440, height: 900 };
// The panel's motion (index.css) and the peek's timing (peek.ts).
/** The peek's slide, out and back alike, in ms (index.css). */
export const SLIDE_MS = 220;
/** The pin and the unpin by the toggle, in ms (index.css). */
export const PIN_MS = 250;
/** The one curve the peek's slide and the pin share (index.css, Ethan's After Effects graph). */
export const PANEL_EASE = "cubic-bezier(0.17, 1.02, 0.58, 1)";
// The last share of the panel's travel back, where the tail fade may dim it as it lands.
const LANDING_SHARE = 0.05;
// The last share of the way back in which no row may show, and how faint "no row" is.
const ROWLESS_SHARE = 0.25;
const ROWLESS_OPACITY = 0.02;
/** How long the pointer rests before the peek opens, in ms (peek.ts). */
export const OPEN_MS = 80;
/** How long the peek waits after the pointer leaves before it closes, in ms (peek.ts). */
export const CLOSE_MS = 250;
// The instants a slide is seeked to: every 20ms, and the last millisecond before it ends.
const SEEK_STEPS = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, SLIDE_MS - 1];
// The tabs start this far past the sidebar's edge (title-bar.tsx).
const TAB_INSET = 4;
const TOGGLE = 'header [data-sidebar="trigger"]';

/** A number rounded to two decimals, for a check's notes. */
export const round = (n) => Math.round(n * 100) / 100;
/** The panel's peek phase: "away" at rest, else the phase it is in. */
export const phaseOf = (page) =>
  page.evaluate(() => document.querySelector('[data-slot="sidebar"]').dataset.peek ?? "away");
// The first tab's left and the workspace's (the sidebar's edge), in CSS px.
const edges = (page) =>
  page.evaluate(() => ({
    tab: document.querySelector('[role="tab"]').getBoundingClientRect().x,
    edge: document.querySelector('[role="main"]').getBoundingClientRect().x,
  }));

/**
 * A fresh desktop window on the demo, the sidebar open or collapsed, at a kept width, in a
 * theme through the system's scheme, with motion on unless asked.
 */
export async function openDesk(
  browser,
  { side = "closed", width, theme = "light", motion = "no-preference" } = {},
) {
  const context = await browser.newContext({
    viewport: DESK,
    deviceScaleFactor: 2,
    reducedMotion: motion,
    colorScheme: theme,
  });
  await context.addInitScript(
    ([s, w]) => {
      localStorage.setItem("kay.sidebar", s);
      // An absent width arrives as null (the arguments go over the wire as JSON).
      if (typeof w === "number") localStorage.setItem("kay.sidebar-width", String(w));
    },
    [side, width],
  );
  const page = await context.newPage();
  await page.goto(DEMO);
  await page
    .locator('[data-slot="sidebar"] [data-thread]')
    .first()
    .waitFor({ state: "attached", timeout: 20_000 });
  await page.waitForTimeout(400);
  return { context, page };
}

/** Rests the pointer on the collapsed rail's empty stretch until the peek is out. */
export async function peek(page) {
  await page.mouse.move(900, 500);
  await page.mouse.move(28, 650, { steps: 3 });
  await page.waitForFunction(
    () => document.querySelector('[data-slot="sidebar"]').dataset.peek === "open",
  );
  await page.waitForTimeout(SLIDE_MS + 100);
}

// The container's running transitions, as property, duration and easing.
const transitions = (page) =>
  page.evaluate(() =>
    document
      .querySelector('[data-slot="sidebar-container"]')
      .getAnimations()
      .map((a) =>
        [a.transitionProperty, a.effect.getTiming().duration, a.effect.getTiming().easing].join(
          " ",
        ),
      ),
  );

// Runs in the page: the transitions a pin or an unpin runs, on the gap's width, the panel's
// left (off canvas, it slides) and the title bar's lead's min-width.
function pinTransitions() {
  const moving = new Set(["width", "left", "min-width"]);
  return document.getAnimations().filter((a) => moving.has(a.transitionProperty)).length;
}

// Catches the container's transitions as they start in `phase`, seeks them and its rows' to each
// of `steps` and reads the panel's edge (its right past the rail's, in CSS px), its opacity and
// its rows' opacity. One synchronous pass, so no frame is drawn and no timer runs between the
// seeks; the last seek leaves the slide a millisecond from its end, to finish on its own.
const seekSlide = (page, phase, steps) =>
  page.evaluate(
    ([want, at]) =>
      new Promise((done) => {
        const sidebar = document.querySelector('[data-slot="sidebar"]');
        const panel = document.querySelector('[data-slot="sidebar-container"]');
        const inner = document.querySelector('[data-slot="rail"]').getBoundingClientRect().right;
        const rows = panel.querySelector('[data-slot="sidebar-content"]');
        // The rows' opacity as drawn, inside the panel: their own and every box's up to it.
        const rowsSeen = () => {
          let seen = 1;
          for (let box = rows; box !== panel; box = box.parentElement) {
            seen *= Number(getComputedStyle(box).opacity);
          }
          return seen;
        };
        const tick = () => {
          const running = panel.getAnimations();
          if ((sidebar.dataset.peek ?? "away") !== want || running.length === 0) {
            requestAnimationFrame(tick);
            return;
          }
          const timings = running.map((a) => {
            const { duration, delay, easing } = a.effect.getTiming();
            return [a.transitionProperty, duration, delay, easing].join(" ");
          });
          const width = panel.getBoundingClientRect().width;
          const all = panel.getAnimations({ subtree: true });
          const frames = at.map((ms) => {
            for (const a of all) a.currentTime = ms;
            const edge = panel.getBoundingClientRect().right - inner;
            const opacity = Number(getComputedStyle(panel).opacity);
            return { ms, edge, opacity, rows: rowsSeen() };
          });
          done({ timings, width, frames });
        };
        tick();
      }),
    [phase, steps],
  );

// Holds the slide back at its last frame, the panel at full strength (its fade seeked to its
// start) or with the fade as it is then, once the slide back begins.
const holdLanding = (page, faded) =>
  page.evaluate(
    ([ms, withFade]) =>
      new Promise((done) => {
        const sidebar = document.querySelector('[data-slot="sidebar"]');
        const panel = document.querySelector('[data-slot="sidebar-container"]');
        const tick = () => {
          const running = panel.getAnimations();
          if (sidebar.dataset.peek !== "leaving" || running.length < 2) {
            requestAnimationFrame(tick);
            return;
          }
          for (const a of running) {
            a.pause();
            a.currentTime = a.transitionProperty === "opacity" && withFade !== true ? 0 : ms;
          }
          done();
        };
        tick();
      }),
    [SLIDE_MS - 1, faded],
  );

/**
 * Runs in the page: the share of two same-sized PNGs' pixels (base64) that differ by more than 8
 * levels in any channel.
 */
export async function differShare(pngs) {
  const pixels = [];
  for (const b64 of pngs) {
    const png = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(png);
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
    context.drawImage(bitmap, 0, 0);
    pixels.push(context.getImageData(0, 0, bitmap.width, bitmap.height).data);
  }
  const [x, y] = pixels;
  let differ = 0;
  for (let i = 0; i < x.length; i += 4) {
    const far = [0, 1, 2].some((c) => Math.abs(x[i + c] - y[i + c]) > 8);
    if (far) differ += 1;
  }
  return differ / (x.length / 4);
}

// The share of the 40px strip past the rail's edge that the slide back's last frame changes
// against rest, at full strength and with the tail fade (rule 26): what would vanish in one
// frame without the fade, the hairline and the soft shadow, and what does with it.
async function tailShare(browser, theme) {
  const shares = {};
  for (const faded of [false, true]) {
    const { context, page } = await openDesk(browser, { theme });
    const stage = await page.locator('[data-slot="stage"]').boundingBox();
    const clip = { x: stage.x, y: stage.y, width: 40, height: stage.height };
    await peek(page);
    const held = holdLanding(page, faded);
    await page.mouse.move(900, 500);
    await held;
    const landing = await page.screenshot({ clip });
    await page.evaluate(() => {
      for (const a of document.querySelector('[data-slot="sidebar-container"]').getAnimations()) {
        a.finish();
      }
    });
    await page.waitForTimeout(SLIDE_MS + 200);
    const rest = await page.screenshot({ clip });
    shares[faded ? "faded" : "full"] = await page.evaluate(differShare, [
      landing.toString("base64"),
      rest.toString("base64"),
    ]);
    await context.close();
  }
  return shares;
}

// The share of a slide's travel drawn at full strength: each step's move weighted by opacity.
function seenShare(frames) {
  let travel = 0;
  let seen = 0;
  for (let i = 1; i < frames.length; i++) {
    const move = Math.abs(frames[i].edge - frames[i - 1].edge);
    travel += move;
    seen += move * Math.min(frames[i].opacity, frames[i - 1].opacity);
  }
  return seen / travel;
}

// Samples the first tab's offset from the sidebar's edge on every frame for `ms`.
function sampleOffsets(page, ms) {
  return page.evaluate(
    (span) =>
      new Promise((done) => {
        const seen = [];
        const start = performance.now();
        const tick = () => {
          const tab = document.querySelector('[role="tab"]').getBoundingClientRect().x;
          const edge = document.querySelector('[role="main"]').getBoundingClientRect().x;
          seen.push({ tab, edge });
          if (performance.now() - start < span) requestAnimationFrame(tick);
          else done(seen);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

// A computed colour's channels, 0 to 255, and its relative luminance (WCAG). A color-mix()
// computes to color(srgb r g b), whose channels run 0 to 1.
function channels(css) {
  const values = css
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);
  return String(css).startsWith("color(srgb") ? values.map((v) => v * 255) : values;
}
function luminance(css) {
  const [r, g, b] = channels(css).map((v) => {
    const c = v / 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG's contrast of two computed colours, rgb() or color(srgb). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// P19's pointer half: resting on the toggle slides the panel out from behind the rail over the
// workspace in 220ms on the drawer curve, moving nothing beneath; passing over it does not;
// leaving closes it after the grace; the strip past the rail opens it too.
async function peekByPointer(page) {
  const before = await edges(page);
  const toggle = await page.locator(TOGGLE).boundingBox();
  await page.mouse.move(toggle.x - 40, toggle.y + 14);
  await page.mouse.move(toggle.x + 80, toggle.y + 14, { steps: 2 });
  await page.waitForTimeout(OPEN_MS * 3);
  const passed = await phaseOf(page);
  await page.mouse.move(toggle.x + 14, toggle.y + 14);
  await page.waitForFunction(
    () => document.querySelector('[data-slot="sidebar"]').dataset.peek === "open",
  );
  const slide = await transitions(page);
  await page.waitForTimeout(SLIDE_MS + 100);
  const during = await edges(page);
  const panel = await page.locator('[data-slot="sidebar-container"]').boundingBox();
  await page.screenshot({
    path: shotPath("P19-peek"),
    clip: { x: 0, y: 0, width: 720, height: 600 },
  });
  await page.mouse.move(900, 500);
  await page.waitForTimeout(CLOSE_MS - 100);
  const graced = await phaseOf(page);
  await page.waitForTimeout(600);
  const closed = await phaseOf(page);
  await page.mouse.move(76, 500, { steps: 3 });
  await page.waitForTimeout(OPEN_MS + SLIDE_MS + 100);
  const hot = await phaseOf(page);
  const ok =
    passed === "away" &&
    slide.includes(`transform ${SLIDE_MS} ${PANEL_EASE}`) &&
    before.tab === during.tab &&
    before.edge === during.edge &&
    panel.width >= 208 &&
    graced === "open" &&
    closed === "away" &&
    hot === "open";
  return {
    ok,
    note: `quick pass ${passed}; slide [${slide.join(", ")}]; beneath ${JSON.stringify(before)}→${JSON.stringify(during)}; panel ${panel.width}px; ${CLOSE_MS - 100}ms after leaving ${graced}, then ${closed}; strip past the rail ${hot}`,
  };
}

// P19's keyboard and menu half: the account menu at the rail's foot holds the peek out with the
// pointer away, and its closing lets go, focus back on the account; Escape closes the peek at
// once; one landmark named Sidebar and one named Places while it peeks.
async function peekHolds(page) {
  await peek(page);
  const landmarks = await page.getByRole("navigation", { name: "Sidebar" }).count();
  const places = await page.getByRole("navigation", { name: "Places" }).count();
  await page.locator('[data-slot="rail"]').getByRole("button", { name: "Account" }).click();
  await page.mouse.move(900, 300);
  await page.waitForTimeout(CLOSE_MS + 300);
  const held = await phaseOf(page);
  // Escape closes the menu, which hands focus back to the account; focus on the rail holds
  // nothing, so with the pointer away the peek goes after the grace.
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "detached" });
  const focus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await page.waitForTimeout(CLOSE_MS + SLIDE_MS + 200);
  const released = await phaseOf(page);
  // Out again, Escape closes it at once, with no motion.
  await peek(page);
  await page.keyboard.press("Escape");
  const escaped = await phaseOf(page);
  const running = await transitions(page);
  return {
    ok:
      landmarks === 1 &&
      places === 1 &&
      held === "open" &&
      focus === "Account" &&
      released === "away" &&
      escaped === "away" &&
      running.length === 0,
    note: `landmarks named Sidebar ${landmarks}, Places ${places}; menu up, pointer away: ${held}; menu closed, focus on ${focus}, then ${released}; Escape: ${escaped}, running [${running.join(", ")}]`,
  };
}

// P19's quiet half: resting on a rail place names it in a pill instead of peeking (ADR-144),
// however long the pointer stays.
async function placesStayQuiet(page) {
  const seen = [];
  for (const name of ["Home", "Lab"]) {
    await page.mouse.move(900, 500);
    await page.waitForTimeout(CLOSE_MS + SLIDE_MS);
    const box = await page
      .locator('[data-slot="rail"]')
      .getByRole("link", { name, exact: true })
      .boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
    await page.waitForTimeout(700);
    seen.push(`${name} ${await phaseOf(page)}`);
  }
  return {
    ok: seen.every((each) => each.endsWith(" away")),
    note: `700ms on ${seen.join(", ")}`,
  };
}

// P21's drag: the width follows the pointer between the clamps, the first tab stays 4px past
// the edge on every frame, and the width is kept on release.
async function dragPinned(page) {
  const handle = page.getByRole("separator", { name: "Resize the sidebar" });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 0.5, 500);
  await page.mouse.down();
  const frames = sampleOffsets(page, 1200);
  for (let x = box.x; x <= box.x + 400; x += 16) await page.mouse.move(x, 500);
  const widest = (await page.locator('[data-slot="sidebar-container"]').boundingBox()).width;
  for (let x = box.x + 400; x >= box.x - 200; x -= 16) await page.mouse.move(x, 500);
  const narrowest = (await page.locator('[data-slot="sidebar-container"]').boundingBox()).width;
  await page.mouse.move(box.x + 144, 500, { steps: 8 });
  await page.mouse.up();
  const offsets = (await frames).map((f) => round(f.tab - f.edge));
  const kept = await page.evaluate(() => localStorage.getItem("kay.sidebar-width"));
  return { widest, narrowest, offsets, kept, handle };
}

// P22's pin: the tab strip moves in step with the sidebar's own width transition. On every
// frame the first tab is 4px past the edge, or after the toggle while the edge is short of it
// (`cluster`, the collapsed tab's x); returns the largest miss in px.
async function pinInStep(page, cluster) {
  const frames = sampleOffsets(page, 450);
  await page.locator(TOGGLE).click();
  const seen = await frames;
  return Math.max(...seen.map((f) => Math.abs(f.tab - Math.max(cluster, f.edge + TAB_INSET))));
}

export const sidebarChecks = {
  // The peek (the projects panel, closed): out on hover of the toggle, the rail's empty stretch
  // or the strip past it, never on a place, back after the grace, held by a menu, closed at once
  // by Escape.
  async P19(browser) {
    const results = [];
    for (const step of [peekByPointer, peekHolds, placesStayQuiet]) {
      const { context, page } = await openDesk(browser);
      results.push(await step(page));
      await context.close();
    }
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },

  // No motion where motion is not wanted: under reduced motion the peek neither slides nor fades
  // and goes the moment its grace ends, a key's pin or unpin (Enter on the toggle, Ctrl+B) moves
  // nothing, and under reduced motion neither does a pointer's.
  async P20(browser) {
    const reduced = await openDesk(browser, { motion: "reduce" });
    await reduced.page.mouse.move(900, 500);
    await reduced.page.mouse.move(28, 650, { steps: 3 });
    await reduced.page.waitForFunction(
      () => document.querySelector('[data-slot="sidebar"]').dataset.peek === "open",
    );
    const fade = await transitions(reduced.page);
    await reduced.page.mouse.move(900, 500, { steps: 3 });
    await reduced.page.waitForTimeout(CLOSE_MS + 100);
    const gone = await phaseOf(reduced.page);
    await reduced.context.close();
    const keys = await openDesk(browser, { side: "open" });
    await keys.page.locator(TOGGLE).focus();
    await keys.page.keyboard.press("Enter");
    const enter = await keys.page.evaluate(pinTransitions);
    await keys.page.keyboard.press("Control+b");
    const shortcut = await keys.page.evaluate(pinTransitions);
    await keys.context.close();
    // Under reduced motion a pointer's pin and unpin are instant too (design pillars, rule 24).
    const still = await openDesk(browser, { side: "open", motion: "reduce" });
    const clicks = [];
    for (let click = 0; click < 2; click++) {
      await still.page.locator(TOGGLE).click();
      clicks.push(await still.page.evaluate(pinTransitions));
    }
    await still.context.close();
    return {
      ok:
        fade.length === 0 &&
        gone === "away" &&
        enter === 0 &&
        shortcut === 0 &&
        clicks.every((n) => n === 0),
      detail: `reduced motion peek: transitions [${fade.join(", ")}], ${gone} ${CLOSE_MS + 100}ms after the pointer left; width, left and min-width transitions after Enter ${enter}, after Ctrl+B ${shortcut}, after a click to unpin and to pin under reduced motion ${clicks.join(" and ")}`,
    };
  },

  // The sidebar's edge resizes it: drag (clamped 208 to 480px, kept, and read back after a
  // reload), arrows, Home and End, a double click back to 256px, and in the peek.
  async P21(browser) {
    const { context, page } = await openDesk(browser, { side: "open" });
    const drag = await dragPinned(page);
    await page.reload();
    await page.getByRole("separator", { name: "Resize the sidebar" }).waitFor();
    const reloaded = await drag.handle.getAttribute("aria-valuenow");
    await drag.handle.focus();
    const steps = [];
    for (const key of ["ArrowRight", "Shift+ArrowLeft", "Home", "End"]) {
      await page.keyboard.press(key);
      steps.push(await drag.handle.getAttribute("aria-valuenow"));
    }
    const hb = await drag.handle.boundingBox();
    await page.mouse.dblclick(hb.x + 0.5, 400);
    await page.waitForTimeout(300);
    const reset = await drag.handle.getAttribute("aria-valuenow");
    await context.close();
    const peeked = await openDesk(browser);
    await peek(peeked.page);
    const beneath = await edges(peeked.page);
    const pb = await peeked.page
      .getByRole("separator", { name: "Resize the sidebar" })
      .boundingBox();
    await peeked.page.mouse.move(pb.x + 0.5, 500, { steps: 2 });
    await peeked.page.mouse.down();
    await peeked.page.mouse.move(pb.x + 100, 500, { steps: 6 });
    await peeked.page.mouse.up();
    const widened = (await peeked.page.locator('[data-slot="sidebar-container"]').boundingBox())
      .width;
    const still = await edges(peeked.page);
    await peeked.context.close();
    const inStep = drag.offsets.every((o) => o === TAB_INSET);
    const ok =
      drag.widest === 480 &&
      drag.narrowest === 208 &&
      inStep &&
      drag.kept === reloaded &&
      steps.join() === `${Number(reloaded) + 16},${Number(reloaded) - 48},208,480` &&
      reset === "256" &&
      widened >= 256 + 90 &&
      still.tab === beneath.tab &&
      still.edge === beneath.edge;
    return {
      ok,
      detail: `drag ${drag.narrowest}..${drag.widest}px; tab offset on ${drag.offsets.length} frames ${Math.min(...drag.offsets)}..${Math.max(...drag.offsets)}; kept ${drag.kept}, after reload ${reloaded}; keys ${steps.join(",")}; double click ${reset}; peek widened to ${widened}px, beneath ${JSON.stringify(beneath)}→${JSON.stringify(still)}`,
    };
  },

  // The tabs start 4px past the sidebar's edge at any width, in either theme; collapsed they
  // start after the toggle and stay put while the sidebar peeks; pinning moves them in step.
  async P22(browser) {
    const notes = [];
    let ok = true;
    for (const theme of ["light", "dark"]) {
      for (const width of [208, 256, 400]) {
        const { context, page } = await openDesk(browser, { side: "open", width, theme });
        const { tab, edge } = await edges(page);
        await page.screenshot({
          path: shotPath(`P22-tabs-${theme}-${width}`),
          clip: { x: edge - 120, y: 0, width: 360, height: 160 },
        });
        ok &&= round(tab - edge) === TAB_INSET;
        notes.push(`${theme} ${width}px: ${round(tab - edge)}px`);
        await context.close();
      }
    }
    const { context, page } = await openDesk(browser);
    const rail = await edges(page);
    const afterToggle = (await page.locator(TOGGLE).boundingBox()).x + 28;
    await peek(page);
    const peeking = await edges(page);
    await page.mouse.move(900, 500);
    await page.waitForTimeout(CLOSE_MS + SLIDE_MS + 300);
    const drift = await pinInStep(page, rail.tab);
    await context.close();
    ok &&= rail.tab > afterToggle && rail.tab === peeking.tab && drift < 0.5;
    notes.push(
      `collapsed ${round(rail.tab)} after the toggle ${rail.tab > afterToggle}, peeking ${round(peeking.tab)}; pin drift ${round(drift)}px`,
    );
    return { ok, detail: notes.join("; ") };
  },

  // The peek slides back as it slides out: the same 220ms on the panel's curve both ways, seeked
  // to the same instants (the back's edge, past the rail's, mirrors the out's within 1% of the
  // panel's width). The stage clips the panel at the rail's edge, so the way back stays at 0.9 or
  // more until its last 5% of travel, and fades out only as it lands. On the way out the panel
  // and its rows are at full strength from the first frame, as a pin's are (Ethan); on the way
  // back the rows are gone for the last quarter of the trip, so no row is left as it lands
  // (Ethan). Notes the
  // share of the 40px past the rail that the landing frame would change at full strength, the
  // tail fade's job (design pillars, rule 26).
  async P24(browser) {
    const { context, page } = await openDesk(browser);
    await page.mouse.move(900, 500);
    const outward = seekSlide(page, "open", SEEK_STEPS);
    await page.mouse.move(28, 650, { steps: 3 });
    const out = await outward;
    await page.waitForTimeout(SLIDE_MS + 200);
    const homeward = seekSlide(page, "leaving", SEEK_STEPS);
    await page.mouse.move(900, 500);
    const back = await homeward;
    await page.waitForTimeout(SLIDE_MS + 200);
    const rested = await phaseOf(page);
    await context.close();
    const slide = `transform ${SLIDE_MS} 0 ${PANEL_EASE}`;
    const miss = Math.max(
      ...out.frames.map((f, i) =>
        Math.abs(f.edge / out.width - (1 - back.frames[i].edge / back.width)),
      ),
    );
    const away = back.frames.filter((f) => f.edge > back.width * LANDING_SHARE);
    const dimmest = Math.min(...away.map((f) => f.opacity));
    const landed = back.frames.at(-1).opacity;
    const sliver = back.frames.filter((f) => f.edge <= back.width * ROWLESS_SHARE);
    const rowsInSliver = Math.max(...sliver.map((f) => f.rows * f.opacity));
    const rowsOut = Math.min(...out.frames.map((f) => f.rows));
    const solidOut = Math.min(...out.frames.map((f) => f.opacity));
    const ok =
      out.timings.includes(slide) === true &&
      back.timings.includes(slide) === true &&
      miss < 0.01 &&
      away.length > 0 &&
      dimmest >= 0.9 &&
      landed < 0.1 &&
      sliver.length > 0 &&
      rowsInSliver <= ROWLESS_OPACITY &&
      rowsOut === 1 &&
      solidOut === 1 &&
      rested === "away";
    const trace = back.frames
      .map((f) => `${f.ms}:${round(f.edge)}@${round(f.opacity)}/${round(f.rows)}`)
      .join(" ");
    const tails = [];
    for (const theme of ["light", "dark"]) {
      const share = await tailShare(browser, theme);
      tails.push(
        `${theme} ${round(share.full * 100)}% at full strength, ${round(share.faded * 100)}% faded`,
      );
    }
    return {
      ok,
      detail: `out [${out.timings.join(", ")}]; back [${back.timings.join(", ")}]; curve miss ${round(miss * 100)}%; back dimmest ${round(dimmest)} before its last ${LANDING_SHARE * 100}% of travel, ${round(landed)} as it lands, then ${rested}; panel out at least ${round(solidOut)}, rows out at least ${round(rowsOut)}, in the last ${ROWLESS_SHARE * 100}% back at most ${round(rowsInSliver)}; travel seen out ${round(seenShare(out.frames))}, back ${round(seenShare(back.frames))}; back ${trace}; the landing frame against rest, in the 40px past the rail: ${tails.join(", ")}`,
    };
  },
};
