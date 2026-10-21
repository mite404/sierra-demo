// Checks that the rail holds while the projects panel moves beside it (ADR-144), on a desktop
// window with motion on: at rest, docked at several widths, and at held frames of the peek and
// of an unpin. It also lends its frame holding to the panel's edge checks.
// oxlint-disable no-await-in-loop -- one pointer drives one page, so each step waits for the last
import { differShare, openDesk } from "./sidebar-checks.mjs";

const THEMES = ["light", "dark"];
// The rail's box at 1440x900, the window 16px in behind its 1px border (window.tsx, rail.tsx),
// and how close the account keeps to its foot.
const RAIL_AT = { x: 17, width: 56 };
const FOOT_PX = 16;
/** The panel's kept widths a check docks it at, in CSS px. */
export const WIDTHS = [208, 256, 400];
// The instants a slide is held at: its start, every 40ms, and a millisecond before it ends.
const FRAMES = [0, 40, 80, 120, 160, 219];
// The instant an unpin (250ms, index.css) is held at.
const MID_UNPIN_MS = 100;
// How far a glyph may drift, in CSS px, and how many of the rail's pixels may differ from rest by
// more than 8 levels (antialiasing), as a share.
const DRIFT_PX = 0.5;
const PIXELS_OFF = 0.001;
// The rail's right edge, the column that carries the docked divider (index.css), which P35
// reads; the rail's pixels are compared without it.
const DIVIDER_PX = 1;

// Runs in the page: the rail's box against the window's body, its places' glyphs, the avatar's
// centre and distance from the foot, how many accounts there are and whether the old echo is
// back.
function readRail() {
  const rail = document.querySelector('[data-slot="rail"]');
  const body = document.querySelector('[data-slot="window-body"]').getBoundingClientRect();
  const box = rail.getBoundingClientRect();
  const avatar = rail.querySelector('[aria-label="Account"]').getBoundingClientRect();
  return {
    box: [box.x, box.y, box.width, box.height],
    body: [body.y, body.height],
    glyphs: [...rail.querySelectorAll('[data-sidebar="menu-button"] svg')].map((svg) => {
      const r = svg.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    }),
    avatar: [avatar.x + avatar.width / 2, box.bottom - avatar.bottom],
    accounts: document.querySelectorAll('[aria-label="Account"]').length,
    echo: document.querySelector('[data-slot="rail-echo"]') !== null,
  };
}

// A reading's glyph boxes and avatar as one list of numbers.
const spotsOf = (look) => [...look.glyphs.flat(), ...look.avatar];

// The largest distance between two readings' glyphs and avatars, in CSS px.
function drift(rest, now) {
  const [a, b] = [spotsOf(rest), spotsOf(now)];
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  return Math.max(...a.map((value, i) => Math.abs(value - b[i])));
}

// The rail's look now: its reading and its pixels, short of the divider's column.
async function railNow(page) {
  const look = await page.evaluate(readRail);
  const [x, y, width, height] = look.box;
  const png = await page.screenshot({ clip: { x, y, width: width - DIVIDER_PX, height } });
  return { look, png: png.toString("base64") };
}

// Waits for the panel's transitions in `phase` to start, then pauses them, held for seeking.
const catchSlide = (page, phase) =>
  page.evaluate(
    (want) =>
      new Promise((done) => {
        const sidebar = document.querySelector('[data-slot="sidebar"]');
        const panel = document.querySelector('[data-slot="sidebar-container"]');
        const tick = () => {
          const running = panel.getAnimations();
          if ((sidebar.dataset.peek ?? "away") !== want || running.length === 0) {
            requestAnimationFrame(tick);
            return;
          }
          for (const a of running) a.pause();
          window.heldSlide = running;
          done(running.length);
        };
        tick();
      }),
    phase,
  );

// Seeks the held transitions to `ms`, and lets them finish.
const seekHeld = (page, ms) =>
  page.evaluate((at) => {
    for (const a of window.heldSlide) a.currentTime = at;
  }, ms);
const finishHeld = (page) =>
  page.evaluate(() => {
    for (const a of window.heldSlide) a.finish();
  });

// One direction of a peek, held at each frame and read by `read`.
async function heldFrames(page, way, read) {
  const frames = [];
  for (const ms of FRAMES) {
    await seekHeld(page, ms);
    frames.push({ label: `${way} ${ms}ms`, ...(await read(page)) });
  }
  await finishHeld(page);
  return frames;
}

/**
 * A peek on a closed desktop window, held at its start, every 40ms and just before its end as
 * it slides out and then back, each frame read by `read`; `open` is read once it is out. The
 * pointer rests on the rail's empty stretch to open it and leaves for the workspace.
 */
export async function throughPeek(page, read) {
  await page.mouse.move(900, 500);
  const out = catchSlide(page, "open");
  await page.mouse.move(28, 650, { steps: 3 });
  await out;
  const outward = await heldFrames(page, "out", read);
  await page.waitForTimeout(300);
  const open = await read(page);
  const back = catchSlide(page, "leaving");
  await page.mouse.move(900, 500);
  await back;
  const homeward = await heldFrames(page, "back", read);
  return { frames: [...outward, ...homeward], open };
}

// The rail halfway through a pointer's unpin of the docked panel, the unpin's transitions held.
async function railMidUnpin(page) {
  const held = page.evaluate(
    (ms) =>
      new Promise((done) => {
        const moving = new Set(["width", "left", "min-width"]);
        const tick = () => {
          const running = document.getAnimations().filter((a) => moving.has(a.transitionProperty));
          if (running.length === 0) {
            requestAnimationFrame(tick);
            return;
          }
          for (const a of running) {
            a.pause();
            a.currentTime = ms;
          }
          done(running.length);
        };
        tick();
      }),
    MID_UNPIN_MS,
  );
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await held;
  return { label: `mid-unpin ${MID_UNPIN_MS}ms`, ...(await railNow(page)) };
}

// Whether the rail sits where it should: at the window's inner left, 56px wide, the body's full
// height, the avatar on its centre line and at its foot.
function railPlaced({ box, body, avatar }) {
  const [x, y, width, height] = box;
  return (
    x === RAIL_AT.x &&
    width === RAIL_AT.width &&
    y === body[0] &&
    height === body[1] &&
    avatar[0] === RAIL_AT.x + RAIL_AT.width / 2 &&
    avatar[1] <= FOOT_PX
  );
}

// P29 in one theme: the rail at rest, docked at each width, through a peek and mid-unpin.
async function railHolds(browser, theme) {
  const closed = await openDesk(browser, { theme });
  await closed.page.mouse.move(900, 500);
  const rest = await railNow(closed.page);
  const views = (await throughPeek(closed.page, railNow)).frames;
  await closed.context.close();
  for (const width of WIDTHS) {
    const open = await openDesk(browser, { side: "open", width, theme });
    await open.page.mouse.move(900, 500);
    views.push({ label: `docked ${width}px`, ...(await railNow(open.page)) });
    if (width === 256) views.push(await railMidUnpin(open.page));
    await open.context.close();
  }
  const probe = await openDesk(browser, { theme });
  const scored = [];
  for (const view of views) {
    const off = await probe.page.evaluate(differShare, [rest.png, view.png]);
    scored.push({ label: view.label, drift: drift(rest.look, view.look), off });
  }
  await probe.context.close();
  const single = rest.look.accounts === 1 && rest.look.echo === false;
  const moved = scored.filter((view) => view.drift > DRIFT_PX || view.off > PIXELS_OFF);
  const worst = Math.max(...scored.map((view) => view.off));
  return {
    ok: railPlaced(rest.look) && single && moved.length === 0,
    note: `${theme}: rail ${JSON.stringify(rest.look.box)} over a body at ${JSON.stringify(rest.look.body)}, avatar centre ${rest.look.avatar[0]}, ${rest.look.avatar[1]}px off the foot; accounts ${rest.look.accounts}, echo ${rest.look.echo}; ${scored.length} views, most drift ${Math.max(...scored.map((view) => view.drift))}px, most pixels off ${Math.round(worst * 100_000) / 1000}%${moved.length === 0 ? "" : ` (${moved.map((view) => `${view.label} ${view.drift}px ${view.off}`).join(", ")})`}`,
  };
}

/** The workspace lever's checks of the rail as the panel moves, by id; panel-checks.mjs registers them. */
export const panelFrameChecks = {
  // The rail holds (ADR-144): 56px at the window's inner left, the body's full height, its
  // glyphs and avatar on the same pixels, and its pixels as at rest (antialiasing aside, and its
  // right edge's column, the docked divider's, which P35 reads), with
  // the panel closed, docked at 208, 256 and 400px, at every held frame of a peek out and back,
  // and halfway through an unpin; one account, and no echo of the rail beneath the panel.
  async P29(browser) {
    const results = [];
    for (const theme of THEMES) results.push(await railHolds(browser, theme));
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },
};
