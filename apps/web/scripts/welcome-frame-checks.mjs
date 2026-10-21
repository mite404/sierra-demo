// oxlint-disable no-await-in-loop -- a check drives one browser step at a time, in order
/* oxlint-disable unicorn/consistent-function-scoping -- the frame sampler is serialized into the
   page, so its helpers have to live inside it */
// A thread's first frames on the real app's demo scenario, sampled on every animation frame:
// whether a new thread's welcome paints whole, picture and all, from the first frame its tab
// paints, and how a thread with turns waits for them. Every check opens its own browser context,
// so none sees another's data or stored look.
import { LOOKS, openDemo, panelOf, startThread } from "./welcome-checks.mjs";

// How long a slow worker holds back each message it sends the page.
const SLOW_MS = 400;

// Holds back every message a page's runtime worker sends it by `ms`, as a slow worker would
// answer: the runtime starts its worker with `new Worker`, so a subclass in its place is the
// one it gets.
async function slowWorkers(context, ms) {
  await context.addInitScript((wait) => {
    window.Worker = class SlowWorker extends Worker {
      addEventListener(type, listener, options) {
        if (type !== "message") {
          super.addEventListener(type, listener, options);
          return;
        }
        const late = (event) => {
          setTimeout(() => {
            listener.call(this, event);
          }, wait);
        };
        super.addEventListener(type, late, options);
      }
    };
  }, ms);
}

// Runs in the page: records, on every animation frame from now until `window.frameLog.stop`,
// what the shown tab's main pane holds: its tab, whether it waits ([data-pending]) and whether
// its "Opening ..." line is visible, whether it shows a welcome, whether the picture is behind
// it, and the opacity its faintest layer paints at. A rAF callback sees the tree the frame then
// paints, with every animation at that frame's time. The log lives on the window, which a
// reload would wipe.
function sampleFrames() {
  const log = { frames: [], stop: false };
  window.frameLog = log;
  // The opacity an element paints at: its own times every ancestor's.
  const paintedOpacity = (el) => {
    let opacity = 1;
    for (let at = el; at !== null; at = at.parentElement) {
      opacity *= Number(getComputedStyle(at).opacity);
    }
    return opacity;
  };
  const tick = (t) => {
    const panel = document.querySelector('[role="tabpanel"]:not([inert])');
    const pane = panel === null ? null : panel.querySelector("[data-thread-pane]");
    const has = (selector) => pane !== null && pane.querySelector(selector) !== null;
    // The line found by its words, which every build has said, so the check reads it the same
    // on code without the line's own attribute.
    const lines = pane === null ? [] : [...pane.querySelectorAll("[data-pending] p")];
    const line = lines.find((each) => each.textContent.startsWith("Opening "));
    const art =
      pane === null ? null : pane.querySelector('.welcome-art, [data-slot="welcome-splash"]');
    const layers = art === null ? [] : [art, ...art.querySelectorAll("*")];
    log.frames.push({
      t,
      tab: panel === null ? null : panel.id,
      pending: has("[data-pending]"),
      line: line !== undefined && getComputedStyle(line).visibility === "visible",
      welcome: has(".welcome"),
      art: art !== null,
      faintest: art === null ? null : Math.min(...layers.map((layer) => paintedOpacity(layer))),
    });
    if (!log.stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// The frames from a press until another tab is on screen and shows `settled`, plus a few more,
// and whether the window survived (no reload). The address changes a few frames before the
// router's transition puts the tab on screen, so the tab, not the address, marks the switch.
async function framesOf(page, press, settled) {
  await page.evaluate(sampleFrames);
  const from = await page.evaluate(
    () => document.querySelector('[role="tabpanel"]:not([inert])')?.id ?? null,
  );
  await press();
  await page.waitForFunction(
    ([start, want]) => {
      const last = window.frameLog?.frames.at(-1);
      return last !== undefined && last.tab !== start && last[want];
    },
    [from, settled],
    { timeout: 15_000 },
  );
  await page.waitForTimeout(300);
  const log = await page.evaluate(() => {
    if (window.frameLog === undefined) return null;
    window.frameLog.stop = true;
    return window.frameLog;
  });
  const reloads = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  const frames = log === null ? [] : log.frames;
  // The new tab's frames: once the tab on screen is no longer the one the press started on.
  const after = frames.filter((frame) => frame.tab !== from);
  return { after, kept: log !== null && reloads === 1 };
}

// Closes every open tab, which leaves Home's "Start a thread".
async function closeAllTabs(page) {
  const tabs = page.getByRole("tablist", { name: "Open threads" }).getByRole("tab");
  while ((await tabs.count()) > 0) {
    await tabs.first().hover();
    await page
      .getByRole("button", { name: /^Close / })
      .first()
      .click();
  }
  await page.getByRole("button", { name: "Start a thread" }).waitFor();
}

// Every way to start a thread, in one look with motion on, and what each new tab painted:
// Home's Start a thread, the sidebar's "+", the welcome's "+" for a new project and the tab
// strip's "+".
async function startsIn(browser, look) {
  const { page, context, errors } = await openDemo(browser, {
    query: `splash=${look}`,
    motion: "no-preference",
  });
  await closeAllTabs(page);
  const sidebarPlus = page
    .locator('[data-slot="sidebar"]')
    .getByRole("button", { name: "New thread in Demo store" });
  const presses = [
    { name: "home", press: () => page.getByRole("button", { name: "Start a thread" }).click() },
    { name: "sidebar", press: () => sidebarPlus.click() },
    {
      name: "welcome",
      press: () => panelOf(page).getByRole("button", { name: "New project" }).click(),
    },
    {
      name: "tabs",
      press: () => page.getByRole("button", { name: "New thread", exact: true }).click(),
    },
  ];
  const rows = [];
  for (const { name, press } of presses) {
    const { after, kept } = await framesOf(page, press, "welcome");
    rows.push({
      name,
      frames: after.length,
      waiting: after.filter((frame) => frame.pending).length,
      bare: after.filter((frame) => frame.welcome !== true || frame.art !== true).length,
      faded: after.filter((frame) => frame.faintest !== null && frame.faintest < 1).length,
      kept,
    });
  }
  await context.close();
  return { look, rows, errors };
}

export const welcomeFrameChecks = {
  // W7: every way to start a thread shows the new thread's welcome, its picture whole and at
  // full strength, in the first frame its tab paints, in every look and with motion on: never a
  // frame of the waiting frame, of bare paper, or of a picture fading in, each of which read as
  // a white flash between two pictures. The page never reloads.
  async W7(browser) {
    const runs = [];
    for (const look of LOOKS) runs.push(await startsIn(browser, look));
    const clean = (row) =>
      row.frames > 0 && row.waiting === 0 && row.bare === 0 && row.faded === 0 && row.kept === true;
    const dirty = runs.flatMap((run) => run.rows).filter((row) => !clean(row)).length;
    const errors = runs.reduce((sum, run) => sum + run.errors.length, 0);
    const rowText = (row) =>
      `${row.name} ${row.frames} frames/${row.waiting} waiting/${row.bare} bare/${row.faded} faded${row.kept === true ? "" : "/RELOADED"}`;
    return {
      ok: dirty === 0 && errors === 0,
      detail: runs
        .map(
          (run) =>
            `${run.look}: ${run.rows.map(rowText).join(", ")}; errors ${JSON.stringify(run.errors).slice(0, 200)}`,
        )
        .join(" | "),
    };
  },

  // W8: a thread with turns, opened from a welcome while its worker is slow (every message held
  // back 400ms), never shows the painting while it waits, and its "Opening ..." line stays
  // hidden for the first 100ms of the wait (a quicker open shows no line at all), then shows.
  async W8(browser) {
    const { page, context, errors } = await openDemo(browser, {
      prepare: (fresh) => slowWorkers(fresh, SLOW_MS),
    });
    await startThread(page);
    const refunds = page
      .locator('[data-slot="sidebar"]')
      .getByRole("link", { name: "Refund audit" });
    const { after, kept } = await framesOf(page, () => refunds.click(), "pending");
    const waits = after.filter((frame) => frame.pending);
    const start = waits.at(0)?.t ?? 0;
    const early = waits.filter((frame) => frame.t - start < 80 && frame.line).length;
    const late = waits.filter((frame) => frame.t - start > 150 && frame.line).length;
    const painted = after.filter((frame) => frame.art).length;
    await context.close();
    return {
      ok: waits.length > 0 && painted === 0 && early === 0 && late > 0 && kept,
      detail: `${waits.length} waiting frames over ${Math.round((waits.at(-1)?.t ?? start) - start)}ms, ${painted} with the painting, line shown in ${early} frames of the first 80ms and ${late} after 150ms, window kept ${kept}; errors ${JSON.stringify(errors).slice(0, 300)}`,
    };
  },
};
