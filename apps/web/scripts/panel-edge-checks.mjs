// Checks that the projects panel extends from the rail's edge (ADR-144), on a desktop window
// with motion on: docked at several widths, closed, peeking and at held frames of the peek, and
// on a window too short for every place.
// oxlint-disable no-await-in-loop -- one pointer drives one page, so each step waits for the last
import { BASE } from "./lever.mjs";
import { throughPeek, WIDTHS } from "./panel-frame-checks.mjs";
import { openDesk, PANEL_EASE, PIN_MS } from "./sidebar-checks.mjs";

const THEMES = ["light", "dark"];
// The tabs start this far past the docked panel's edge, and right after the toggle with it
// closed (title-bar.tsx); the panel's default width (sidebar-width.ts).
const TAB_INSET = 4;
const TAB_CLOSED = 137;
const DEFAULT_PX = 256;
// A window too short for every place (ADR-144's default: they scroll, the account stays put).
const SHORT = { width: 1024, height: 480 };
// How many heights the rail's edge is probed at, and how close the account keeps to its foot.
const PROBES = 10;
const FOOT_PX = 16;
// How long a pin or an unpin is sampled for (it takes PIN_MS, index.css), the instants it is
// also held at, and how far an edge may miss, in CSS px.
const PIN_SAMPLE_MS = 450;
const PIN_HELD_MS = [20, 60, 100, 140, 180];
const MISS_PX = 0.5;

// Runs in the page: where the panel sits against the rail and what sits beside it: the rail's
// right, the panel's left and width, main's left, the first tab's left, whether the panel is
// inert, the stage's overflow, and how many of `probes` heights down the rail's edge the rail
// itself draws.
function readPanel(probes) {
  const rail = document.querySelector('[data-slot="rail"]').getBoundingClientRect();
  const panel = document.querySelector('[data-slot="sidebar-container"]');
  const box = panel.getBoundingClientRect();
  const hits = Array.from({ length: probes }, (_, i) => {
    const hit = document.elementFromPoint(
      rail.right - 1,
      rail.top + ((i + 0.5) * rail.height) / probes,
    );
    return hit !== null && hit.closest('[data-slot="rail"]') !== null;
  });
  return {
    railRight: rail.right,
    left: box.left,
    width: box.width,
    main: document.querySelector('[role="main"]').getBoundingClientRect().x,
    tab: document.querySelector('[role="tab"]').getBoundingClientRect().x,
    inert: panel.inert,
    clip: getComputedStyle(document.querySelector('[data-slot="stage"]')).overflowX,
    railHits: hits.filter(Boolean).length,
  };
}

const panelNow = (page) => page.evaluate(readPanel, PROBES);

// Whether a docked panel extends from the rail's edge at its kept width, with the workspace and
// the first tab past it.
const dockedRight = (at, width) =>
  at.left === at.railRight &&
  at.width === width &&
  at.main === at.left + at.width &&
  at.tab === at.main + TAB_INSET &&
  at.inert === false;

// Whether a closed panel leaves the workspace at the rail and the tabs after the toggle, out of
// reach.
const closedAway = (at) => at.main === at.railRight && at.tab === TAB_CLOSED && at.inert === true;

// Whether a peeking panel starts at the rail's edge at its width while nothing beneath moves.
const peeksBeside = (at, closed) =>
  at.left === at.railRight &&
  at.width === DEFAULT_PX &&
  at.main === closed.main &&
  at.tab === closed.tab;

// P30's short window: the account keeps the rail's foot and the Lab, last of the places, is
// brought into view by focus, the places scrolling with no scrollbar drawn.
async function shortWindow(browser) {
  const context = await browser.newContext({ viewport: SHORT, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    localStorage.setItem("kay.sidebar", "closed");
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/?scenario=demo`);
  await page.locator('[data-slot="rail"]').waitFor();
  await page.locator('[data-slot="rail"] a[aria-label="Lab"]').focus();
  const look = await page.evaluate(() => {
    const rail = document.querySelector('[data-slot="rail"]').getBoundingClientRect();
    const places = document.querySelector('[data-slot="rail"] [role="navigation"]');
    const box = places.getBoundingClientRect();
    const lab = places.querySelector('a[aria-label="Lab"]').getBoundingClientRect();
    const account = document.querySelector('[data-slot="rail"] [aria-label="Account"]');
    return {
      scrolls: places.scrollHeight > places.clientHeight,
      labShown: lab.top >= box.top && lab.bottom <= box.bottom,
      noBar: places.offsetWidth === places.clientWidth,
      foot: rail.bottom - account.getBoundingClientRect().bottom,
    };
  });
  await context.close();
  return {
    ok:
      look.scrolls === true &&
      look.labShown === true &&
      look.noBar === true &&
      look.foot <= FOOT_PX,
    note: `${SHORT.width}x${SHORT.height}: places scroll ${look.scrolls}, Lab in view on focus ${look.labShown}, no scrollbar ${look.noBar}, account ${look.foot}px off the foot`,
  };
}

// P30 in one theme: docked at each width, closed, peeking and through the peek's frames.
async function panelBeside(browser, theme) {
  const notes = [];
  let ok = true;
  for (const width of WIDTHS) {
    const { context, page } = await openDesk(browser, { side: "open", width, theme });
    const at = await panelNow(page);
    await context.close();
    ok &&= dockedRight(at, width);
    notes.push(
      `${theme} docked ${width}: rail ${at.railRight}, panel ${at.left}+${at.width}, main ${at.main}, tab ${at.tab}`,
    );
  }
  const { context, page } = await openDesk(browser, { theme });
  const closed = await panelNow(page);
  const { frames, open } = await throughPeek(page, panelNow);
  await context.close();
  const gated = frames.filter((frame) => frame.railHits === PROBES && frame.clip === "clip");
  ok &&= closedAway(closed) && peeksBeside(open, closed) && gated.length === frames.length;
  notes.push(
    `${theme} closed: main ${closed.main}, tab ${closed.tab}, inert ${closed.inert}; peeking: panel ${open.left}+${open.width}, main ${open.main}, tab ${open.tab}; held frames with the rail's edge drawn by the rail at all ${PROBES} heights and the stage clipped: ${gated.length} of ${frames.length}`,
  );
  const short = await shortWindow(browser);
  return { ok: ok && short.ok, note: [...notes, short.note].join("; ") };
}

// Samples the panel's width and right, main's left and the first tab's left on every frame for
// `ms`.
const sampleEdges = (page, ms) =>
  page.evaluate(
    (span) =>
      new Promise((done) => {
        const seen = [];
        const start = performance.now();
        const tick = () => {
          const panel = document
            .querySelector('[data-slot="sidebar-container"]')
            .getBoundingClientRect();
          seen.push({
            width: panel.width,
            right: panel.right,
            main: document.querySelector('[role="main"]').getBoundingClientRect().x,
            tab: document.querySelector('[role="tab"]').getBoundingClientRect().x,
          });
          if (performance.now() - start < span) requestAnimationFrame(tick);
          else done(seen);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

// Holds a pin's three transitions (the gap's width, the panel's left, the lead's min-width) at
// each of `instants` once they start, reading the same edges at each, then lets them finish.
const holdPin = (page, instants) =>
  page.evaluate(
    (at) =>
      new Promise((done) => {
        const moving = new Set(["width", "left", "min-width"]);
        const tick = () => {
          const running = document.getAnimations().filter((a) => moving.has(a.transitionProperty));
          if (running.length < 3) {
            requestAnimationFrame(tick);
            return;
          }
          const frames = at.map((ms) => {
            for (const a of running) a.currentTime = ms;
            const panel = document
              .querySelector('[data-slot="sidebar-container"]')
              .getBoundingClientRect();
            return {
              width: panel.width,
              right: panel.right,
              main: document.querySelector('[role="main"]').getBoundingClientRect().x,
              tab: document.querySelector('[role="tab"]').getBoundingClientRect().x,
            };
          });
          for (const a of running) a.finish();
          done(frames);
        };
        tick();
      }),
    instants,
  );

// The frames of a pin that miss: the panel off its width, its right edge off the workspace's
// left, or the first tab neither 4px past it nor after the toggle, whichever is further.
const missesOf = (frames) =>
  frames.filter(
    (f) =>
      Math.abs(f.width - DEFAULT_PX) > MISS_PX ||
      Math.abs(f.right - f.main) > MISS_PX ||
      Math.abs(f.tab - Math.max(TAB_CLOSED, f.main + TAB_INSET)) > MISS_PX,
  ).length;

// How many frames fall mid-way, the workspace's edge between the rail and the docked panel's.
const midWay = (frames, rail) =>
  frames.filter((f) => f.main > rail && f.main < rail + DEFAULT_PX).length;

// Runs in the page: the pin's running transitions (the gap, the panel and the title bar's lead),
// as property, duration and easing.
function pinTimings() {
  const moving = new Set(["width", "left", "min-width"]);
  return document
    .getAnimations()
    .filter((a) => moving.has(a.transitionProperty))
    .map((a) => {
      const { duration, easing } = a.effect.getTiming();
      return [a.transitionProperty, duration, easing].join(" ");
    });
}

// P31 in one theme: a pointer's unpin of the docked panel and its pin, each a click with no rest
// (the pointer stays on the toggle between them, which keeps the peek from starting): once
// held at fixed instants, then sampled on every frame as it plays.
async function pinBehindRail(browser, theme) {
  const { context, page } = await openDesk(browser, { side: "open", theme });
  const toggle = page.getByRole("button", { name: "Toggle sidebar" });
  const rail = (await panelNow(page)).railRight;
  const notes = [];
  let ok = true;
  for (const way of ["unpin", "pin"]) {
    const held = holdPin(page, PIN_HELD_MS);
    await toggle.click();
    const frames = await held;
    ok &&= missesOf(frames) === 0 && midWay(frames, rail) === PIN_HELD_MS.length;
    notes.push(
      `${theme} ${way} held: ${missesOf(frames)} of ${frames.length} off, ${midWay(frames, rail)} mid-way`,
    );
    await page.waitForTimeout(300);
  }
  for (const way of ["unpin", "pin"]) {
    const sampled = sampleEdges(page, PIN_SAMPLE_MS);
    await toggle.click();
    const timings = await page.evaluate(pinTimings);
    const frames = await sampled;
    const onClock =
      timings.length >= 3 && timings.every((t) => t.endsWith(`${PIN_MS} ${PANEL_EASE}`));
    ok &&= missesOf(frames) === 0 && onClock;
    notes.push(
      `${theme} ${way} played: ${missesOf(frames)} of ${frames.length} frames off, ${midWay(frames, rail)} mid-way, [${timings.join(", ")}]`,
    );
    await page.waitForTimeout(300);
  }
  await context.close();
  return { ok, note: notes.join("; ") };
}

/** The workspace lever's checks of the panel's edge, by id; panel-checks.mjs registers them. */
export const panelEdgeChecks = {
  // The panel extends from the rail's edge (ADR-144): docked at 208, 256 and 400px it starts at
  // the rail's right, the workspace at its right and the first tab 4px past; closed, the
  // workspace starts at the rail and the panel is inert; peeking, it starts at the rail again
  // while nothing beneath moves; at every held frame of the peek the rail's edge is the rail's
  // own, behind the stage's clip. On a short window the places scroll and the account holds.
  async P30(browser) {
    const results = [];
    for (const theme of THEMES) results.push(await panelBeside(browser, theme));
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },

  // A pin slides the panel out from behind the rail at its own width while the workspace makes
  // room, and an unpin mirrors it (ADR-144): on every frame the panel's right meets the
  // workspace's left within half a pixel and the first tab keeps step, 4px past it or after the
  // toggle; the rows never reflow.
  async P31(browser) {
    const results = [];
    for (const theme of THEMES) results.push(await pinBehindRail(browser, theme));
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },
};
