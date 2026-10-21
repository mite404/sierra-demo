// Checks for the rail's places, on a desktop window with motion on, and for the places as the
// phone drawer lists them; their name pills' checks (pill-checks.mjs) join them here.
// oxlint-disable no-await-in-loop -- one pointer drives one page, so each step waits for the last
import { BASE, collect, shotPath } from "./lever.mjs";
import { pillChecks } from "./pill-checks.mjs";
import { placeOf, railOf, RAIL_PLACES, readOutOfScopeRows, readPlaces } from "./rail-places.mjs";
import {
  CLOSE_MS,
  contrast,
  OPEN_MS,
  openDesk,
  peek,
  phaseOf,
  round,
  SLIDE_MS,
} from "./sidebar-checks.mjs";

// What a place outside the demo's scope says to a screen reader, and beside its name in the
// drawer's row.
const OUT_OF_SCOPE = "Out of demo scope";
const OUT_OF_SCOPE_PLACES = RAIL_PLACES.filter((place) => place.outOfScope);
// The tab order from Kay: every place before the Lab.
const WALK = RAIL_PLACES.slice(1, -1).map((place) => place.name);
// A phone (ADR-121), whose drawer lists the places as rows, and a row's gap and side padding
// (rail-places.tsx).
const PHONE = { width: 390, height: 844 };
const PLACE_GAP = 12;
const PLACE_PAD = 10;
// The places the rail draws, top to bottom.
const placesIn = (page) => railOf(page).locator('[data-sidebar="header"]').evaluate(readPlaces);
const glyphsOf = (places) => JSON.stringify(places.map((place) => place.glyph));

// P25's layout half: the rail's places at rest, while the panel peeks, and with it docked.
async function placesEverywhere(browser, theme) {
  const rail = await openDesk(browser, { theme });
  await rail.page.mouse.move(900, 400);
  const collapsed = await placesIn(rail.page);
  await peek(rail.page);
  const peeking = await placesIn(rail.page);
  await rail.context.close();
  const open = await openDesk(browser, { side: "open", theme });
  const docked = await placesIn(open.page);
  await open.context.close();
  return { collapsed, peeking, docked };
}

// P25's verdict on where the places are: in order by name, role and glyph, the places outside the
// demo announced as unavailable and linking nowhere, every glyph on one pixel in all three views.
function placesVerdict({ collapsed, peeking, docked }) {
  const want = JSON.stringify(RAIL_PLACES.map(({ name, role, icon }) => [name, role, icon]));
  const got = JSON.stringify(collapsed.map(({ name, role, icon }) => [name, role, icon]));
  const announced = collapsed.every((place, i) =>
    RAIL_PLACES.at(i)?.outOfScope === true
      ? place.disabled === "true" && place.href === null && place.description === OUT_OF_SCOPE
      : place.disabled === null,
  );
  const views = [peeking, docked].map((view) => glyphsOf(view));
  const oneSpot =
    collapsed.length === RAIL_PLACES.length && views.every((view) => view === glyphsOf(collapsed));
  return {
    ok: got === want && announced === true && oneSpot,
    note: `order ${got === want}${got === want ? "" : ` ${got}`}; announced ${announced}; glyphs on one pixel collapsed, peeking and docked ${oneSpot}`,
  };
}

// A place's fill, its glyph's ink, its cursor and the rail behind it.
const lookOf = (locator) =>
  locator.evaluate((el) => {
    const style = getComputedStyle(el);
    const rail = document.querySelector('[data-slot="rail"]');
    return {
      fill: style.backgroundColor,
      ink: getComputedStyle(el.querySelector("svg")).color,
      cursor: style.cursor,
      shell: getComputedStyle(rail).backgroundColor,
    };
  });

// P25's pointer half: resting on a place outside the demo, long past the peek's open delay, keeps
// it as it was (no fill, no step to ink, the arrow cursor) and keeps the panel away. A place the
// rail lacks is noted as missing.
async function restOnOutOfScope(page) {
  const seen = [];
  for (const place of OUT_OF_SCOPE_PLACES) {
    const target = placeOf(page, place);
    if ((await target.count()) === 0) {
      seen.push({ name: place.name, missing: true });
      continue;
    }
    await page.mouse.move(900, 400);
    await page.waitForTimeout(CLOSE_MS);
    const rest = await lookOf(target);
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
    await page.waitForTimeout(OPEN_MS * 3 + SLIDE_MS);
    seen.push({ name: place.name, rest, hover: await lookOf(target), phase: await phaseOf(page) });
  }
  return seen;
}

// Whether resting changed nothing, and the faint ink clears text's 4.5:1 on the rail.
const restsQuietly = ({ missing, rest, hover, phase }) =>
  missing !== true &&
  rest.fill === "rgba(0, 0, 0, 0)" &&
  hover.fill === rest.fill &&
  hover.ink === rest.ink &&
  hover.cursor === "default" &&
  phase === "away" &&
  contrast(rest.ink, rest.shell) >= 4.5;

// P25's keyboard and press half: Tab walks from Kay through the places outside the demo to the
// documentation link, and a click, Enter or Space on each opens nothing: the address, the open
// pages and the absence of any menu or dialog all hold.
async function pressOutOfScope(context, page) {
  const before = page.url();
  await placeOf(page, RAIL_PLACES[0]).focus();
  const walked = [];
  for (let step = 1; step < RAIL_PLACES.length - 1; step++) {
    await page.keyboard.press("Tab");
    walked.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")));
  }
  let pressed = 0;
  for (const place of OUT_OF_SCOPE_PLACES) {
    const target = placeOf(page, place);
    if ((await target.count()) === 0) continue;
    await target.click({ force: true });
    await target.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    pressed += 1;
  }
  await page.waitForTimeout(300);
  return {
    walked,
    pressed,
    stayed: page.url() === before,
    pages: context.pages().length,
    popups: await page.locator('[role="menu"], [role="dialog"]').count(),
  };
}

// Whether Tab walked the places in order and no press went anywhere.
const pressesInert = (presses) =>
  presses.walked.join("|") === WALK.join("|") &&
  presses.pressed === OUT_OF_SCOPE_PLACES.length &&
  presses.stayed === true &&
  presses.pages === 1 &&
  presses.popups === 0;

// P25's row half, on a phone: in the drawer's rows, each place outside the demo shows its whole
// name and "Out of demo scope" after it, clear of the name by the row's gap and inside its padding, both in
// faint ink at 4.5:1 or more.
async function outOfScopeRows(browser, theme) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();
  // A thread's own address: "/" moves on to a thread, and that arrival would close the drawer.
  await page.goto(`${BASE}/t/t-005?scenario=demo`);
  await page
    .locator('[data-slot="project-name"]')
    .filter({ hasText: /\S/ })
    .waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await page.locator('dialog[data-slot="sidebar"][data-state="open"]').waitFor();
  // The drawer's slide (300ms, window.tsx) ends before its rows are measured.
  await page.waitForTimeout(400);
  const header = page.locator('dialog[data-slot="sidebar"] [data-sidebar="header"]');
  const rows = await header.evaluate(readOutOfScopeRows);
  const box = await header.boundingBox();
  await page.screenshot({ path: shotPath(`P25-drawer-rows-${theme}`), clip: box });
  await context.close();
  return rows;
}

// Whether a row shows its name whole and its hint beside it, legibly.
const rowReads = (row) =>
  row.whole === true &&
  row.tag === OUT_OF_SCOPE &&
  row.shown === true &&
  row.tagBox.left >= row.label.right + PLACE_GAP - 0.5 &&
  row.tagBox.right <= row.button.right - PLACE_PAD + 0.5 &&
  contrast(row.labelInk, row.shell) >= 4.5 &&
  contrast(row.tagInk, row.shell) >= 4.5;

// The workspace lever's checks of the rail's places, by id.
const placeChecks = {
  // The rail's places in order under Kay (ADR-094, amended), and the five outside the demo's scope:
  // named ("Memory", dimmed, "Out of demo scope" to a screen reader), in the tab order, and inert.
  // Resting on one names it and neither fills it nor peeks; a click, Enter or Space opens nothing;
  // in the phone drawer's rows each says "Out of demo scope" beside its whole name; faint ink
  // clears 4.5:1 in either theme; and every place's glyph sits on one pixel with the panel closed,
  // peeking and docked.
  async P25(browser) {
    const notes = [];
    let ok = true;
    for (const theme of ["light", "dark"]) {
      const places = placesVerdict(await placesEverywhere(browser, theme));
      const { context, page } = await openDesk(browser, { theme });
      const rests = await restOnOutOfScope(page);
      const presses = await pressOutOfScope(context, page);
      await context.close();
      const rows = await outOfScopeRows(browser, theme);
      const quiet = rests.every((rest) => restsQuietly(rest));
      const inert = pressesInert(presses);
      const readable =
        rows.length === OUT_OF_SCOPE_PLACES.length && rows.every((row) => rowReads(row));
      ok &&= places.ok && quiet && inert && readable;
      const inks = rests
        .filter((r) => r.missing !== true)
        .map((r) => round(contrast(r.rest.ink, r.rest.shell)));
      notes.push(
        `${theme}: ${places.note}; resting quiet ${quiet} (ink ${inks.length === 0 ? "none" : `${Math.min(...inks)}:1`}, peek ${rests.map((r) => r.phase ?? "missing").join(",")}); Tab ${presses.walked.join(" > ")}; ${presses.pressed} pressed, stay ${presses.stayed}, pages ${presses.pages}, popups ${presses.popups}; drawer rows ${readable} (${rows.map((r) => `${r.name} ${round(r.tagBox.left - r.label.right)}px ${r.tag}`).join(", ")})`,
      );
    }
    return { ok, detail: notes.join("; ") };
  },
};

/**
 * The workspace lever's checks of the rail, by id: its places, and their name pills.
 * @throws {Error} When the two name a check with the same id.
 */
export const railChecks = collect(placeChecks, pillChecks);
