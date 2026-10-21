// Checks for the projects panel beside the rail, on a desktop window with motion on: where
// keyboard focus goes as the panel closes or peeks away, and what focus holds a peek.
// oxlint-disable no-await-in-loop -- one keyboard drives one page, so each step waits for the last
import { collect } from "./lever.mjs";
import { panelDividerChecks } from "./panel-divider-checks.mjs";
import { panelEdgeChecks } from "./panel-edge-checks.mjs";
import { panelFrameChecks } from "./panel-frame-checks.mjs";
import { panelMotionChecks } from "./panel-motion-checks.mjs";
import { panelReachChecks } from "./panel-reach-checks.mjs";
import { placeOf, RAIL_PLACES } from "./rail-places.mjs";
import { CLOSE_MS, openDesk, peek, phaseOf, SLIDE_MS } from "./sidebar-checks.mjs";

const THEMES = ["light", "dark"];
// What the closing panel hides that keyboard focus can sit on: a project row and the edge.
const HIDDEN_ON_CLOSE = [
  { role: "button", name: "Demo store" },
  { role: "separator", name: "Resize the sidebar" },
];
// A slide back that never reports its end still settles by then (sidebar-peek.tsx).
const LEAVE_FALLBACK_MS = 400;
// The most a peek takes to go once the pointer leaves: the grace, the slide back, its fallback.
const GONE_MS = CLOSE_MS + SLIDE_MS + LEAVE_FALLBACK_MS;
const [HOME] = RAIL_PLACES;
const LAB = RAIL_PLACES.at(-1);
// The panel's thread rows (the second opens a thread other than the demo's first), and the
// name of the project row above them.
const ROW = '[data-slot="sidebar-container"] a[data-thread]';
const PROJECT = { name: "Demo store", exact: true };
// How long focus is watched once the panel is away: Chrome lets go of focus in an inert panel
// lazily, some hundreds of milliseconds on, so focus that looks kept at first can still drop.
const SETTLE_MS = 800;

// Runs in the page: the focused element as its role and name, or "body".
function focusedNow() {
  const at = document.activeElement;
  if (at === null || at === document.body) return "body";
  const role = at.getAttribute("role") ?? at.tagName.toLowerCase();
  return `${role} ${at.getAttribute("aria-label") ?? at.textContent.trim()}`;
}

// Keyboard focus on a control by a Tab onto it, so it is focus-visible as a visitor's is.
async function tabOnto(page, target) {
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
}

// P27's one case: docked, keyboard focus on `place`, then Ctrl/Cmd+B.
async function closeFrom(browser, theme, place) {
  const { context, page } = await openDesk(browser, { side: "open", theme });
  const target = page.getByRole(place.role, { name: place.name, exact: true });
  const toggle = page.getByRole("button", { name: "Toggle sidebar" });
  await tabOnto(page, target);
  const held = await target.evaluate((el) => el === document.activeElement);
  await page.keyboard.press("ControlOrMeta+b");
  await page.waitForTimeout(100);
  const handed = await toggle.evaluate((el) => el === document.activeElement);
  const now = await page.evaluate(focusedNow);
  const expanded = await toggle.getAttribute("aria-expanded");
  await context.close();
  return {
    ok: held === true && handed === true && expanded === "false",
    note: `${theme} ${place.name}: focused ${held}, then ${now}, expanded ${expanded}`,
  };
}

// P28's first case: keyboard focus on Home, the pointer rests on the rail until the panel peeks,
// then leaves: the peek goes as it would with no focus anywhere.
async function railFocusReleases(browser, theme) {
  const { context, page } = await openDesk(browser, { theme });
  await page.mouse.move(900, 500);
  await tabOnto(page, placeOf(page, HOME));
  const visible = await page.evaluate(() => document.activeElement.matches(":focus-visible"));
  await peek(page);
  const left = Date.now();
  await page.mouse.move(900, 400, { steps: 2 });
  const gone = await page
    .waitForFunction(
      () => document.querySelector('[data-slot="sidebar"]').dataset.peek === undefined,
      null,
      {
        timeout: GONE_MS + 200,
      },
    )
    .then(() => Date.now() - left)
    .catch(() => null);
  const still = await page.evaluate(focusedNow);
  await context.close();
  return {
    ok: visible === true && gone !== null && still === `a ${HOME.name}`,
    note: `${theme} focus on ${HOME.name} (visible ${visible}): the peek ${gone === null ? `held past ${GONE_MS}ms` : `went ${gone}ms after the pointer left`}, focus still on ${still}`,
  };
}

// The name pills up now.
const pillsUp = (page) => page.locator('[data-slot="tooltip-content"]:visible').count();

// P28's Escape cases: with focus on Lab, the first Escape closes Lab's pill (a tooltip owns
// Escape while it shows) and the next closes the peek, leaving focus on Lab; with focus Tabbed
// into the panel's first row, Escape hands it to the toggle.
async function escapeFrom(browser, theme) {
  const { context, page } = await openDesk(browser, { theme });
  await peek(page);
  await tabOnto(page, placeOf(page, LAB));
  await page.waitForTimeout(200);
  const pill = await pillsUp(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const first = { pill: await pillsUp(page), phase: await phaseOf(page) };
  await page.keyboard.press("Escape");
  const fromRail = { phase: await phaseOf(page), focus: await page.evaluate(focusedNow) };
  await page.mouse.move(900, 500);
  await page.waitForTimeout(CLOSE_MS);
  await peek(page);
  await tabOnto(page, page.locator('[data-slot="rail"]').getByRole("button", { name: "Account" }));
  await page.keyboard.press("Tab");
  const inPanel = await page.evaluate(
    () => document.activeElement.closest('[data-slot="sidebar-container"]') !== null,
  );
  await page.keyboard.press("Escape");
  const fromPanel = { phase: await phaseOf(page), focus: await page.evaluate(focusedNow) };
  await context.close();
  return {
    ok:
      pill === 1 &&
      first.pill === 0 &&
      first.phase === "open" &&
      fromRail.phase === "away" &&
      fromRail.focus === "a Lab" &&
      inPanel === true &&
      fromPanel.phase === "away" &&
      fromPanel.focus === "button Toggle sidebar",
    note: `${theme} focus on Lab, ${pill} pill up; Escape: ${first.pill} pills, peek ${first.phase}; Escape: ${fromRail.phase}, focus on ${fromRail.focus}; Tab past the account into the panel ${inPanel}, Escape: ${fromPanel.phase}, focus on ${fromPanel.focus}`,
  };
}

// Runs in the page: whether the peek is away and its panel inert.
const isAway = () =>
  document.querySelector('[data-slot="sidebar"]').dataset.peek === undefined &&
  document.querySelector('[data-slot="sidebar-container"]').inert;

// Waits for the panel to go away, lets focus settle, and reads where it sits and whether it
// is ringed.
async function focusOnceAway(page) {
  await page.waitForFunction(isAway, null, { timeout: GONE_MS + 1000 });
  await page.waitForTimeout(SETTLE_MS);
  return {
    focus: await page.evaluate(focusedNow),
    ringed: await page.evaluate(() => document.activeElement.matches(":focus-visible")),
  };
}

// P34's peek cases: a thread opened from a peek row by Enter or by a click, and a click on a
// project row followed by the pointer leaving, each put the panel away with focus in it.
const PEEK_EXITS = {
  async enter(page) {
    await tabOnto(page, page.locator(ROW).nth(1));
    await page.keyboard.press("Enter");
  },
  async click(page) {
    await page.locator(ROW).nth(1).click();
  },
  async leave(page) {
    await page.locator('[data-slot="sidebar-container"]').getByRole("button", PROJECT).click();
    await page.mouse.move(900, 400, { steps: 3 });
  },
};

// One P34 peek case: focus ends on Toggle sidebar, ringed only when a key moved it.
async function peekExit(browser, theme, [how, exit]) {
  const { context, page } = await openDesk(browser, { theme });
  await peek(page);
  const from = page.url();
  await exit(page);
  const inPanel = await page.evaluate(
    () => document.activeElement.closest('[data-slot="sidebar-container"]') !== null,
  );
  const { focus, ringed } = await focusOnceAway(page);
  const moved = page.url() !== from;
  await context.close();
  return {
    ok:
      inPanel === true &&
      focus === "button Toggle sidebar" &&
      ringed === (how === "enter") &&
      moved === (how !== "leave"),
    note: `${theme} peek ${how}: focus in the panel ${inPanel}, then on ${focus} (ringed ${ringed}), a new thread ${moved}`,
  };
}

// P34's docked case: Enter on a row opens its thread and leaves focus on the row.
async function dockedEnter(browser, theme) {
  const { context, page } = await openDesk(browser, { side: "open", theme });
  const row = page.locator(ROW).nth(1);
  const name = `a ${(await row.textContent()).trim()}`;
  const from = page.url();
  await tabOnto(page, row);
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.href !== from);
  await page.waitForTimeout(SETTLE_MS);
  const focus = await page.evaluate(focusedNow);
  await context.close();
  return { ok: focus === name, note: `${theme} docked Enter on ${name}: focus on ${focus}` };
}

// The workspace lever's checks of where focus goes around the panel, by id.
const focusChecks = {
  // Closing the docked panel by Ctrl/Cmd+B with keyboard focus on a project row or on the
  // resize edge hands focus to Toggle sidebar, never to the page's body.
  async P27(browser) {
    const results = [];
    for (const theme of THEMES) {
      for (const place of HIDDEN_ON_CLOSE) results.push(await closeFrom(browser, theme, place));
    }
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },

  // Keyboard focus on a rail place never holds a peek out (ADR-144): the rail stays either way.
  // Escape from a rail place leaves focus there; from the panel it hands focus to the toggle,
  // since the panel's rows leave with it.
  async P28(browser) {
    const results = [];
    for (const theme of THEMES) {
      results.push(await railFocusReleases(browser, theme), await escapeFrom(browser, theme));
    }
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },

  // A peek that goes away with focus in its panel (a thread opened from a row by Enter or a
  // click, or the pointer leaving after a click on a row) hands focus to Toggle sidebar, never
  // to the page's body; docked, a row keeps focus as its thread opens.
  async P34(browser) {
    const results = [];
    for (const theme of THEMES) {
      for (const exit of Object.entries(PEEK_EXITS)) {
        results.push(await peekExit(browser, theme, exit));
      }
      results.push(await dockedEnter(browser, theme));
    }
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },
};

/**
 * The workspace lever's checks of the projects panel beside the rail, by id: where focus goes,
 * how the rail holds (panel-frame-checks.mjs), where the panel sits (panel-edge-checks.mjs),
 * the line that parts it from the rail (panel-divider-checks.mjs), how its rows and edge move
 * through the toggle (panel-motion-checks.mjs) and what reaches it
 * (panel-reach-checks.mjs).
 * @throws {Error} When two of them name a check with the same id.
 */
export const panelChecks = collect(
  focusChecks,
  panelFrameChecks,
  panelEdgeChecks,
  panelDividerChecks,
  panelMotionChecks,
  panelReachChecks,
);
