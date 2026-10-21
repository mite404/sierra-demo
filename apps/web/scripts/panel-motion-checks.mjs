// Checks how the projects panel's rows and edge move through the toggle (ADR-144), on a desktop
// window with motion on: the rows through a pin and an unpin, and the edge through a pin from a
// peek, in both themes.
// oxlint-disable no-await-in-loop -- one pointer drives one page, so each step waits for the last
import { openDesk, peek, PIN_MS } from "./sidebar-checks.mjs";

const THEMES = ["light", "dark"];
// The instants a pin or an unpin is held at, in ms from its first frame.
const HELD_MS = [0, 20, 40, 60, 80, 120, 160, 200, PIN_MS - 1];
// The last share of an unpin's travel in which no row may show, and how faint "no row" is.
const ROWLESS_SHARE = 0.25;
const ROWLESS_OPACITY = 0.02;

// Runs in the page: catches the toggle's slide as its `width` or `left` transition starts,
// holds every running transition at each of `at` and reads the panel's right past the rail's
// edge, its width, the rows' drawn opacity (their own and every box's up to the panel) and the
// panel's shadow, then lets them finish.
const heldToggle = (page, at) =>
  page.evaluate(
    (instants) =>
      new Promise((done) => {
        const panel = document.querySelector('[data-slot="sidebar-container"]');
        const rows = panel.querySelector('[data-slot="sidebar-content"]');
        const rail = document.querySelector('[data-slot="rail"]').getBoundingClientRect().right;
        const moving = new Set(["width", "left"]);
        const rowsSeen = () => {
          let seen = 1;
          for (let box = rows; box !== panel; box = box.parentElement) {
            seen *= Number(getComputedStyle(box).opacity);
          }
          return seen;
        };
        const tick = () => {
          const running = document.getAnimations().filter((a) => a.timeline === document.timeline);
          if (!running.some((a) => moving.has(a.transitionProperty))) {
            requestAnimationFrame(tick);
            return;
          }
          const frames = instants.map((ms) => {
            for (const a of running) a.currentTime = ms;
            const box = panel.getBoundingClientRect();
            const shadow = getComputedStyle(panel).boxShadow;
            return { ms, edge: box.right - rail, width: box.width, rows: rowsSeen(), shadow };
          });
          for (const a of running) a.finish();
          done(frames);
        };
        tick();
      }),
    at,
  );

// A frame as the detail prints it: its instant, the panel's edge and the rows' opacity.
const traced = (frames) =>
  frames.map((f) => `${f.ms}:${Math.round(f.edge)}/${Math.round(f.rows * 100) / 100}`).join(" ");

// P36 in one theme: a pin by the toggle from closed, then an unpin, each held through its slide.
async function rowsThroughToggle(browser, theme) {
  const { context, page } = await openDesk(browser, { theme });
  const toggle = page.getByRole("button", { name: "Toggle sidebar" });
  const pinning = heldToggle(page, HELD_MS);
  await toggle.click();
  const pin = await pinning;
  await page.waitForTimeout(PIN_MS + 150);
  const unpinning = heldToggle(page, HELD_MS);
  await toggle.click();
  const unpin = await unpinning;
  await context.close();
  const width = unpin[0].width;
  const sliver = unpin.filter((f) => f.edge <= width * ROWLESS_SHARE);
  const pinRows = Math.min(...pin.map((f) => f.rows));
  const sliverRows = Math.max(...sliver.map((f) => f.rows));
  return {
    ok: pinRows === 1 && sliver.length > 0 && sliverRows <= ROWLESS_OPACITY,
    note: `${theme}: pin rows at least ${pinRows} [${traced(pin)}]; unpin rows in the last ${ROWLESS_SHARE * 100}% at most ${Math.round(sliverRows * 1000) / 1000} [${traced(unpin)}]`,
  };
}

// P37 in one theme: a pin by the toggle while the panel peeks, its shadow held through the slide.
async function edgeThroughPinFromPeek(browser, theme) {
  const { context, page } = await openDesk(browser, { theme });
  await peek(page);
  const pinning = heldToggle(page, HELD_MS);
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  const pin = await pinning;
  await page.waitForTimeout(PIN_MS + 150);
  const rest = await page
    .locator('[data-slot="sidebar-container"]')
    .evaluate((el) => getComputedStyle(el).boxShadow);
  await context.close();
  const held = pin.every((f) => f.shadow !== "none");
  return {
    ok: held === true && rest === "none",
    note: `${theme}: edge held on ${pin.filter((f) => f.shadow !== "none").length} of ${pin.length} frames, then ${rest}`,
  };
}

/** The workspace lever's checks of the panel's rows and edge through the toggle, by id. */
export const panelMotionChecks = {
  // Closing by the toggle, the rows leave before the panel does, as on the peek's way back: at
  // most 2% for the last quarter of the unpin's travel, so no row is left as it lands (Ethan);
  // opening, they are at full strength from the pin's first frame.
  async P36(browser) {
    const results = [];
    for (const theme of THEMES) results.push(await rowsThroughToggle(browser, theme));
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },

  // A pin while the panel peeks moves only the workspace, under the panel: the peek's edge (its
  // hairline and shadow) holds on every frame of the slide until the workspace's rounded border
  // is under it, then goes (Ethan).
  async P37(browser) {
    const results = [];
    for (const theme of THEMES) results.push(await edgeThroughPinFromPeek(browser, theme));
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },
};
