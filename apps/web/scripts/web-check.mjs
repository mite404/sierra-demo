#!/usr/bin/env node
// Drive the web app the way a person would and keep the proof: screenshots, the agent's reply
// text, and every console error. Exits 1 on any failed step.
//
//   pnpm dev:web                                   # in one terminal
//   node apps/web/scripts/web-check.mjs [--base http://127.0.0.1:5173] [--out dir]
// oxlint-disable no-await-in-loop, no-console -- a lever steps in order and reports on stdout
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arg, chromium, ROOT } from "./harness.mjs";
import { railOf, RAIL_PLACES } from "./rail-places.mjs";

const BASE = arg("--base", "http://127.0.0.1:5173");
// The gap between lanes, and an arrow key's resize: one step of the canvas's dot grid
// (index.css --canvas-grid, lane-separator.tsx).
const LANE_GAP_PX = 18;
const OUT = arg(
  "--out",
  path.join(ROOT, ".artifacts/web", new Date().toISOString().slice(0, 19).replaceAll(":", "-")),
);
mkdirSync(OUT, { recursive: true });

/** @type {{ step: string, ok: boolean, detail: string }[]} */
const results = [];
const errors = [];
function record(step, ok, detail = "") {
  const passed = Boolean(ok); // a measure's `ok` can be any truthy value
  results.push({ step, ok: passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${step}${detail ? ` · ${detail}` : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));
// A dev server never answers 5xx on purpose; Vite's 504 "Outdated Optimize Dep" is the blank
// first page after a fresh install, so the first load has to be clean, not the second.
page.on("response", (response) => {
  if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
});
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

// Selects the first `count` characters of the main thread's first agent turn, scrolled into
// view as a person would: a highlight a press can then carry. Returns where to press and what
// was selected.
function highlight(count) {
  return page.evaluate((length) => {
    const paragraph = document.querySelector('[role="tabpanel"]:not([inert]) .turn-agent p');
    paragraph.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.setStart(paragraph.firstChild, 0);
    range.setEnd(paragraph.firstChild, length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const box = range.getClientRects()[0];
    return { x: box.left + 12, y: box.top + box.height / 2, text: range.toString() };
  }, count);
}

// Presses at `from`, lifts past the carry's dead zone and lets go at `to` (ADR-091).
async function carryTo(from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

// The main threads a tab's sidebar lists, top to bottom.
const mainTitles = (tab) => tab.locator('[data-thread="main"]').allTextContents();

// A page of its own at `address` (a mock scenario's, ADR-096), with its console errors counted
// among the rest, once a thread is on screen.
// A fresh page at `address`, ready once a thread shows; `seed` asks the dev build to seed its
// device first, as the run's own page is.
async function pageAt(address, { seed } = {}) {
  const opened = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  if (seed !== undefined) {
    await opened.addInitScript((name) => {
      localStorage.setItem("kay.seed", name);
    }, seed);
  }
  opened.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  opened.on("pageerror", (error) => errors.push(String(error)));
  await opened.goto(`${BASE}${address}`, { waitUntil: "load" });
  await opened
    .locator('[role="tabpanel"]:not([inert]) .thread-panel')
    .first()
    .waitFor({ timeout: 20_000 });
  return opened;
}

const tabNames = (on) =>
  on.getByRole("tablist", { name: "Open threads" }).getByRole("tab").allInnerTexts();
const shownPanel = (on) => on.locator('[role="tabpanel"]:not([inert])');

// Clicks a thread's row in the sidebar and waits for its tab to be the one on screen.
async function openRow(on, title) {
  await on.locator('[data-slot="sidebar"]').getByRole("link", { name: title, exact: true }).click();
  await on
    .locator(`[role="tabpanel"]:not([inert])[aria-label="${title}"] .thread-panel`)
    .first()
    .waitFor({ timeout: 10_000 });
}

// A page of its own on a mock scenario (ADR-096), once `ready` is on screen in the tab shown,
// or in `within` on a page with no tab; its console errors count with the rest.
async function openScenario(address, ready, within = '[role="tabpanel"]:not([inert])') {
  const view = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  view.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  view.on("pageerror", (error) => errors.push(String(error)));
  await view.goto(`${BASE}${address}`, { waitUntil: "load" });
  await view.locator(`${within} ${ready}`).first().waitFor({ timeout: 15_000 });
  return view;
}

// Puts `view` in the layout named `name`: pressed only when it is not already, since pressing
// the open side pane again closes it back to the thread (ADR-138), then held until it shows.
// It waits for the tab's own layout first; read before the tab loads, nothing is pressed yet, and
// a press that lands once the tab is already on `name` would close it.
async function chooseLayout(view, name) {
  const group = view.getByRole("group", { name: "Layout" });
  await group.locator('button[aria-pressed="true"]').waitFor({ timeout: 15_000 });
  const button = group.getByRole("button", { name });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await group.locator(`button[aria-label="${name}"][aria-pressed="true"]`).waitFor();
}

// The title bar's control furthest right, named, so a failure says what stood past the bell.
function furthestRight(view) {
  return view
    .locator('header[data-slot="title-bar"]')
    .getByRole("button")
    .evaluateAll((els) =>
      els
        .map((el) => ({
          name: el.getAttribute("aria-label") ?? el.textContent.trim(),
          right: el.getBoundingClientRect().right,
        }))
        .reduce((far, each) => (each.right > far.right ? each : far)),
    ); // → { name, right }
}

// A step on a page of its own at `address`, a mock scenario, so no device data is touched. A
// throw fails that step alone, and the steps after it still run.
async function onOwnPage(step, address, options, measure) {
  const own = await browser.newPage({ viewport: { width: 1280, height: 900 }, ...options });
  own.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  own.on("pageerror", (error) => errors.push(String(error)));
  try {
    await own.goto(`${BASE}${address}`, { waitUntil: "load" });
    const { ok, detail } = await measure(own);
    record(step, ok, detail);
  } catch (error) {
    record(step, false, String(error).split("\n")[0]);
  } finally {
    await own.close();
  }
}

// Whether only `wide` of a workspace's panes is on screen, across most of the width.
const paneAlone = (shown, wide) =>
  Object.entries(shown).every(([name, value]) => (name === wide ? value >= 85 : value === 0));

// The open threads, by the tablist the title bar names.
const tabsOf = (own) => own.getByRole("tablist", { name: "Open threads" }).getByRole("tab");

// The element with focus, as a screen reader would name it: its role, then its name.
const focusOn = (own) =>
  own.evaluate(() => {
    const at = document.activeElement;
    if (at === null || at === document.body) return "body";
    const role = at.getAttribute("role") ?? at.tagName.toLowerCase();
    return `${role} ${at.getAttribute("aria-label") ?? at.textContent.trim()}`;
  });

// Whether the phone drawer's Account button sits in the sheet's lower half, as its foot.
const accountSitsLow = (own) =>
  own.evaluate(() => {
    const sheet = document.querySelector('dialog[data-slot="sidebar"]');
    const button = sheet?.querySelector('[aria-label="Account"]');
    if (sheet === null || button === null || button === undefined) return false;
    const sheetBox = sheet.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    return buttonBox.top > sheetBox.top + sheetBox.height / 2;
  });

// Whether every open menu item's box sits inside a `width`x`height` viewport.
const menuOnScreen = (own, width, height) =>
  own.evaluate(
    ([w, h]) => {
      const items = [...document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')];
      return (
        items.length > 0 &&
        items.every((item) => {
          const rect = item.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= w && rect.top >= 0 && rect.bottom <= h;
        })
      );
    },
    [width, height],
  );

// The dev build seeds this page's device with the Demo store's profit thread, which every device
// held before Home opened on the Live Playground (ADR-159): the run starts there.
await page.addInitScript(() => {
  localStorage.setItem("kay.seed", "demo-store");
});

try {
  await page.goto(`${BASE}/t/profit`, { waitUntil: "load" });
  const title = page.getByRole("heading", { name: "Last week's profit by day" });
  await title.waitFor({ timeout: 15_000 });
  await shot("thread");
  record("thread renders the profit card", true);

  const slider = page.getByRole("slider", { name: "Profit measure" });
  await slider.focus();
  await page.keyboard.press("End");
  const sentence = page.locator(".live-sentence");
  await page.waitForFunction(() =>
    document.querySelector(".live-sentence")?.textContent.includes("Net profit"),
  );
  await shot("thread-net-profit");
  record("slider moves to Net profit", true, (await sentence.textContent()).trim());

  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill("Why is Saturday so high?");
  await page.keyboard.press("Enter");
  const reply = page.locator(".turn-agent").last();
  await page.waitForFunction(
    () => {
      const turns = [...document.querySelectorAll(".turn-agent")];
      const last = turns.at(-1);
      return (
        turns.length >= 2 &&
        last?.textContent.includes("Net profit") === true &&
        !last.querySelector("[data-streaming]")
      );
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(1500);
  await shot("thread-reply");
  const replyText = (await reply.textContent()).trim();
  record(
    "agent reply speaks to the chosen view",
    replyText.includes("Net profit"),
    replyText.slice(0, 120),
  );
  const chip = page.locator(".turn-user").last();
  record(
    "the sent message carries the card choice as a chip",
    (await chip.textContent()).includes("Net profit"),
  );

  // The worker keeps the conversation in the browser's private file system (ADR-081): a fresh
  // load must show the sent message, its chip and the reply again.
  await page.reload({ waitUntil: "load" });
  await title.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await shot("thread-after-reload");
  /** @type {string[]} */
  const turns = await page.locator(".turn-user, .turn-agent").allTextContents();
  record(
    // A reload throws away everything a worker held only in memory, so this already proves the
    // thread is kept on this device, not just in the tab's memory.
    "the conversation survives a reload: threads are kept on this device",
    turns.some((t) => t.includes("Why is Saturday so high?")) &&
      turns.some((t) => t.includes("Answering about Net profit")),
    `${turns.length} turns after reload`,
  );

  // The look is measured, not the attribute: the page, the paper and the ink must all move.
  const surface = () =>
    page.evaluate(() => {
      const panel = document.querySelector(".thread-panel");
      // The main thread is bare (ADR-138), so its paper is the nearest surface behind it.
      let paper = panel;
      while (
        getComputedStyle(paper).backgroundColor === "rgba(0, 0, 0, 0)" &&
        paper.parentElement
      ) {
        paper = paper.parentElement;
      }
      return {
        page: getComputedStyle(document.documentElement).backgroundColor,
        paper: getComputedStyle(paper).backgroundColor,
        ink: getComputedStyle(panel).color,
      };
    });
  // The browser here prefers light, so System, the default, is the light page.
  const light = await surface();
  const accountMenu = page.getByRole("menu");
  const chooseTheme = async (name) => {
    await page.getByRole("button", { name: "Account" }).click();
    await accountMenu.waitFor();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
    // A radio item keeps the menu open, so the choice can be changed again in place.
    await page.keyboard.press("Escape");
    await accountMenu.waitFor({ state: "detached" });
  };
  await page.getByRole("button", { name: "Account" }).click();
  await accountMenu.waitFor();
  const themeChoices = await page
    .getByRole("menuitemradio", { name: /^(Light|Dark|System)$/ })
    .allInnerTexts();
  const checked = await page.getByRole("menuitemradio", { checked: true }).allInnerTexts();
  await page.keyboard.press("Escape");
  await accountMenu.waitFor({ state: "detached" });
  await chooseTheme("Dark");
  await page.waitForTimeout(300);
  await shot("thread-dark");
  const dark = await surface();
  const stored = await page.evaluate(() => localStorage.getItem("theme"));
  await chooseTheme("System");
  const followed = await surface();
  record(
    "the account menu offers Light, Dark and System, System by default, and Dark turns the page, the paper and the ink (ADR-162)",
    themeChoices.join(",") === "Light,Dark,System" &&
      checked.join(", ") === "System, Solid" &&
      stored === "dark" &&
      dark.page !== light.page &&
      dark.paper !== light.paper &&
      dark.ink !== light.ink &&
      followed.paper === light.paper,
    `choices ${themeChoices.join(", ")}; checked ${checked.join(", ")}; paper ${light.paper} → ${dark.paper} → ${followed.paper}`,
  );

  const rail = railOf(page);
  const placesShown = [];
  for (const { role, name } of RAIL_PLACES) {
    if ((await rail.getByRole(role, { name, exact: true }).isVisible()) === true) {
      placesShown.push(name);
    }
  }
  record(
    "the rail shows its places, Home to Lab",
    placesShown.length === RAIL_PLACES.length,
    placesShown.join(", "),
  );

  // A thread opens alone; the layout switch puts its canvas beside it.
  await page
    .getByRole("group", { name: "Layout" })
    .getByRole("button", { name: "Canvas", exact: true })
    .click();
  const canvas = page
    .locator('[role="tabpanel"]:not([inert])')
    .getByRole("region", { name: "Compose canvas" });
  await canvas.waitFor();
  record(
    "the canvas opens empty and invites a drop",
    await canvas.getByText("Drag a text selection or UI card here").isVisible(),
  );

  // A highlight carried out of the thread starts a thread where it lands.
  const picked = await highlight(18);
  const empty = await canvas.getByText("Drag a text selection or UI card here").boundingBox();
  await carryTo(picked, { x: empty.x + empty.width / 2, y: empty.y - 40 });
  const lane = canvas.locator("article").first();
  await lane.locator(".thread-panel").waitFor({ timeout: 10_000 });
  const laneDraft = await lane.locator("textarea").inputValue();
  record(
    "a dropped highlight starts a thread lane with the quote as its draft",
    laneDraft.startsWith(`> ${picked.text}`),
    laneDraft.split("\n")[0],
  );

  // The profit card sits at the top of a thread that has scrolled to its end.
  const heading = page
    .locator('[data-slot="resizable-panel"]')
    .first()
    .locator(".card-heading")
    .first();
  await heading.scrollIntoViewIfNeeded();
  await canvas.getByText("Drag a text selection or UI card here").scrollIntoViewIfNeeded();
  const openSpaceBox = await canvas
    .getByText("Drag a text selection or UI card here")
    .boundingBox();
  const headingBox = await heading.boundingBox();
  await page.mouse.move(headingBox.x + 30, headingBox.y + headingBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(headingBox.x + 60, headingBox.y + 20, { steps: 4 });
  await page.mouse.move(openSpaceBox.x + 20, openSpaceBox.y + 20, { steps: 8 });
  const liftedCards = await page.locator(".card[data-lifted]").count();
  await page.mouse.up();
  await canvas.locator("article").nth(1).locator(".card").waitFor({ timeout: 10_000 });
  await shot("canvas-lanes");
  record(
    "a card dragged by its header opens large in its own lane",
    await canvas.locator("article").nth(1).getByRole("slider").isVisible(),
  );
  record(
    "while a card is dragged out of the thread, the card left behind dims, and comes back after",
    liftedCards === 1 && (await page.locator(".card[data-lifted]").count()) === 0,
    `${liftedCards} dimmed during, ${await page.locator(".card[data-lifted]").count()} after`,
  );

  // With a lane on it the canvas has no right edge: the ground runs a pane past the open space,
  // the scrollbar says so, and the ground itself drags to pan.
  // Headless Chromium hides scrollbars, so the bar itself is not measured here; the overflow
  // it would report is.
  const overflow = await canvas.evaluate((el) => el.scrollWidth - el.clientWidth);
  record(
    "the ground runs a pane past the last lane",
    overflow >= 500,
    `${overflow}px past the pane`,
  );
  const canvasBox = await canvas.boundingBox();
  await page.mouse.move(canvasBox.x + 8, canvasBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 8 - 200, canvasBox.y + 8, { steps: 6 });
  const dragged = await canvas.evaluate((el) => el.scrollLeft);
  await page.mouse.up();
  record("the ground drags to pan the row", dragged > 150, `scrolled ${Math.round(dragged)}px`);
  await canvas.evaluate((el) => {
    el.scrollLeft = 0;
  });

  // The grip fades up within its circle in the middle of a lane's title bar, and stays away at
  // the bar's edge and over the title.
  const firstHeader = canvas.locator("article").first().locator(".thread-header");
  const firstHeaderBox = await firstHeader.boundingBox();
  const barMiddle = firstHeaderBox.y + firstHeaderBox.height / 2;
  await page.mouse.move(firstHeaderBox.x + firstHeaderBox.width * 0.85, barMiddle);
  await page.waitForTimeout(250);
  const gripAtEdge = await firstHeader.evaluate((el) => getComputedStyle(el, "::after").opacity);
  await page.mouse.move(firstHeaderBox.x + firstHeaderBox.width / 2 + 10, barMiddle);
  await page.waitForTimeout(250);
  const gripShown = await firstHeader.evaluate((el) => getComputedStyle(el, "::after").opacity);
  const titleButton = canvas.locator("article").first().locator(".thread-title");
  await titleButton.hover();
  await page.waitForTimeout(250);
  const gripHidden = await firstHeader.evaluate((el) => getComputedStyle(el, "::after").opacity);
  const titleCursor = await titleButton.evaluate((el) => getComputedStyle(el).cursor);
  record(
    "the grip fades up only within its circle, not at the bar's edge or over the title",
    gripShown === "1" && gripAtEdge === "0" && gripHidden === "0" && titleCursor === "text",
    `grip ${gripShown} in the middle, ${gripAtEdge} at the edge, ${gripHidden} over the title; title cursor ${titleCursor}`,
  );
  await page.mouse.move(10, 10);

  // The gap after a lane drags its width; the hint line lights where the pointer is.
  const separator = canvas.getByRole("separator", { name: /^Resize / }).first();
  const separatorBox = await separator.boundingBox();
  const laneWidthBefore = (await lane.boundingBox()).width;
  const hoverY = separatorBox.y + separatorBox.height * 0.3;
  await page.mouse.move(separatorBox.x + separatorBox.width / 2, hoverY);
  // The line fades in over 120ms; read it once it has arrived.
  for (let i = 0; i < 5; i++) {
    const shown = await separator.evaluate(
      (el) => getComputedStyle(el, "::before").opacity === "1",
    );
    if (shown === true) break;
    await page.waitForTimeout(100);
  }
  const hint = await separator.evaluate((el, y) => {
    const style = getComputedStyle(el, "::before");
    return {
      opacity: style.opacity,
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- Number() reads "12px" as NaN
      centre: parseFloat(el.style.getPropertyValue("--hint-y")),
      y,
      image: style.backgroundImage,
    };
  }, hoverY - separatorBox.y);
  // Full ink for 40px either side of the pointer, gone by 70px: the stops appear either as
  // calc() offsets or, once resolved, as px positions around the centre.
  const stops = [...hint.image.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  const stopAt = (n) => stops.some((v) => Math.abs(v - n) < 1);
  const profile =
    (stopAt(20) && stopAt(50)) ||
    [-70, -40, 40, 70].every((offset) => stopAt(hint.centre + offset));
  record(
    "the hint line shows on hover, centred on the pointer, holding 40px and gone by 70px",
    hint.opacity === "1" && Math.abs(hint.centre - hint.y) < 2 && profile,
    `opacity ${hint.opacity}, centre ${Math.round(hint.centre)} for pointer at ${Math.round(hint.y)}; stops ${stops.join(" ")}`,
  );
  await page.mouse.down();
  await page.mouse.move(separatorBox.x + 140, hoverY, { steps: 6 });
  await page.mouse.up();
  const laneWidthAfter = (await lane.boundingBox()).width;
  record(
    "a lane's width drags by the gap after it",
    laneWidthAfter > laneWidthBefore + 100,
    `${Math.round(laneWidthBefore)} → ${Math.round(laneWidthAfter)}px`,
  );
  await page.mouse.move(10, 10);

  // Two lanes outgrow the pane; the row pans by a sideways wheel, and by a vertical one over
  // the ground between and after the lanes.
  const openSpace = canvas.getByText("Drag a text selection or UI card here");
  await openSpace.scrollIntoViewIfNeeded();
  const openBox = await openSpace.boundingBox();
  const leftBefore = await canvas.evaluate((el) => el.scrollLeft);
  await page.mouse.move(openBox.x + openBox.width / 2, openBox.y - 40);
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(100);
  const panned = await canvas.evaluate((el) => el.scrollLeft);
  record(
    "a vertical wheel over the ground pans the row sideways",
    panned - leftBefore >= 100,
    `scrolled ${Math.round(panned - leftBefore)}px`,
  );
  await canvas.evaluate((el) => {
    el.scrollLeft = 0;
  });

  // A third lane, then the first one taken by its title bar and carried to the end of the
  // row: a copy of it floats under the pointer, the lane itself waits dimmed and slides to the
  // slot it would take, and the drop lands it there.
  await openSpace.scrollIntoViewIfNeeded();
  const third = await highlight(20);
  const end = await openSpace.boundingBox();
  await carryTo(third, { x: end.x + end.width / 2, y: end.y - 40 });
  await canvas.locator("article").nth(2).locator(".thread-panel").waitFor({ timeout: 10_000 });
  const labelsBefore = await canvas
    .locator("article")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  const laneWidths = await canvas
    .locator("article")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  await canvas.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const titleBar = canvas.locator("article").first().locator(".thread-header");
  const titleBox = await titleBar.boundingBox();
  const laneBox = await canvas.locator("article").first().boundingBox();
  // The grip, the one place on the bar that shows the hand and takes the lane (the catalog's gripZone.ts).
  const grip = { x: titleBox.x + titleBox.width / 2, y: titleBox.y + titleBox.height / 2 - 2 };
  await page.mouse.move(grip.x, grip.y);
  await page.waitForTimeout(250);
  // The hand is the grip's own (its ::after, clipped to its circle), there once the bar marks
  // the pointer near it.
  const grabHand = await titleBar.evaluate((el) =>
    el.dataset.gripNear === undefined ? "none" : getComputedStyle(el, "::after").cursor,
  );
  await page.mouse.down();
  await page.mouse.move(grip.x + 300, titleBox.y + 30, { steps: 6 });
  await page.waitForTimeout(250);
  const lift = await page.evaluate(
    ([expectedLeft, laneWidth]) => {
      const ghost = document.querySelector("[data-ghost]");
      const lifted = document.querySelector("[data-lifted]");
      if (!ghost || !lifted) return { ghost: Boolean(ghost), lifted: Boolean(lifted) };
      const ghostBox = ghost.getBoundingClientRect();
      return {
        ghost: true,
        lifted: true,
        ghostOpacity: getComputedStyle(ghost).opacity,
        liftedOpacity: getComputedStyle(lifted).opacity,
        ghostFollows: Math.abs(ghostBox.left - expectedLeft) < 2,
        ghostWidth: Math.abs(ghostBox.width - laneWidth) < 1,
        sameTitle: ghost.getAttribute("aria-label") === lifted.getAttribute("aria-label"),
        inPlace: new DOMMatrix(getComputedStyle(lifted).transform).e === 0,
      };
    },
    [laneBox.x + 300, laneWidths[0]],
  );
  await shot("canvas-reorder");
  record(
    "a lane's grip shows a hand, and lifting it floats a copy under the pointer while the lane waits dimmed",
    grabHand === "grab" &&
      lift.ghost === true &&
      lift.lifted === true &&
      lift.ghostOpacity === "0.85" &&
      lift.liftedOpacity === "0.35" &&
      lift.ghostFollows === true &&
      lift.ghostWidth === true &&
      lift.sameTitle === true &&
      lift.inPlace === true,
    `cursor ${grabHand}; ${JSON.stringify(lift)}`,
  );
  await page.mouse.move(grip.x + laneWidths[0] + LANE_GAP_PX + 60, titleBox.y + 30, { steps: 6 });
  await page.waitForTimeout(250);
  const slid = await page.evaluate(
    (expected) =>
      Math.abs(
        new DOMMatrix(getComputedStyle(document.querySelector("[data-lifted]")).transform).e -
          expected,
      ) < 1,
    laneWidths[1] + LANE_GAP_PX,
  );
  record(
    "past a neighbour's centre the dimmed lane slides into the slot it would take",
    slid,
    `expected a slide of ${Math.round(laneWidths[1] + LANE_GAP_PX)}px`,
  );
  await page.mouse.move(grip.x + laneWidths[0] + laneWidths[1] + 32 + 60, titleBox.y + 30, {
    steps: 6,
  });
  await page.mouse.up();
  const labelsAfter = await canvas
    .locator("article")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  record(
    "a lane carried past its neighbours lands at the end of the row, and the copy is gone",
    labelsAfter.join("|") === [labelsBefore[1], labelsBefore[2], labelsBefore[0]].join("|") &&
      (await page.locator("[data-ghost]").count()) === 0,
    labelsAfter.map((label) => label.slice(0, 12)).join(" → "),
  );

  const threadLanes = canvas.locator("article").filter({ has: page.locator(".thread-header") });
  await threadLanes.first().scrollIntoViewIfNeeded();
  const firstBar = await threadLanes.first().locator(".thread-header").boundingBox();
  // The grip, the one place on the bar that takes the lane (the catalog's gripZone.ts).
  const firstGrip = { x: firstBar.x + firstBar.width / 2, y: firstBar.y + firstBar.height / 2 - 2 };
  await page.mouse.move(firstGrip.x, firstGrip.y);
  await page.mouse.down();
  await page.mouse.move(firstGrip.x - 200, firstGrip.y + 30, { steps: 8 });
  await page.waitForTimeout(250);
  const liftedBeforeEscape = await page.locator("[data-lifted]").count();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const heldAfterEscape = await page.locator("[data-ghost], [data-lifted]").count();
  await page.mouse.up();
  await page.waitForTimeout(250);
  const labelsEscaped = await canvas
    .locator("article")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  record(
    "Escape puts a lifted lane back while the button is still down, and letting go moves nothing",
    liftedBeforeEscape === 1 &&
      heldAfterEscape === 0 &&
      labelsEscaped.join("|") === labelsAfter.join("|"),
    `lifted ${liftedBeforeEscape}, still up after Escape ${heldAfterEscape}; ${labelsEscaped.map((label) => label.slice(0, 12)).join(" → ")}`,
  );

  // A card's header inside a thread lane arms a carry, which claims its press with
  // preventDefault and lets it travel on. A stand-in header that claims its press the same way
  // shows whether the lane leaves a claimed press alone, as it must for the card to go alone.
  const claimed = threadLanes.first().locator(".thread-panel");
  await claimed.evaluate((panel) => {
    const standIn = document.createElement("header");
    standIn.className = "card-heading";
    standIn.dataset.claims = "";
    standIn.style.height = "40px";
    standIn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
    panel.prepend(standIn);
  });
  const claimBox = await page.locator("[data-claims]").boundingBox();
  await page.mouse.move(claimBox.x + 40, claimBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(claimBox.x + 200, claimBox.y + 40, { steps: 6 });
  await page.waitForTimeout(250);
  const liftedByClaim = await page.locator("[data-lifted]").count();
  await page.mouse.up();
  await page.locator("[data-claims]").evaluate((el) => el.remove());
  record(
    "a press something in a lane has claimed, as a card's header does, never lifts the lane",
    liftedByClaim === 0,
    `${liftedByClaim} lifted`,
  );

  const handle = page.locator('[data-slot="resizable-handle"]');
  const handleBox = await handle.boundingBox();
  const panel = page.locator('[data-slot="resizable-panel"]').first();
  const widthBefore = (await panel.boundingBox()).width;
  // Grab it a fifth of the way down, not at a handle in the middle.
  const grabY = handleBox.y + handleBox.height * 0.2;
  await page.mouse.move(handleBox.x + handleBox.width / 2, grabY);
  await page.waitForTimeout(250);
  const handleHint = await handle.evaluate(
    (el, y) => ({
      opacity: getComputedStyle(el, "::before").opacity,
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- Number() reads "12px" as NaN
      centre: parseFloat(el.style.getPropertyValue("--hint-y")),
      y,
    }),
    grabY - handleBox.y,
  );
  record(
    "the thread/canvas divider shows the same hint at the pointer's height",
    handleHint.opacity === "1" && Math.abs(handleHint.centre - handleHint.y) < 2,
    `opacity ${handleHint.opacity}, centre ${Math.round(handleHint.centre)} for pointer at ${Math.round(handleHint.y)}`,
  );
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 160, grabY, { steps: 8 });
  await page.mouse.up();
  const widthAfter = (await panel.boundingBox()).width;
  record(
    "the divider drags anywhere along its length",
    widthAfter < widthBefore - 100,
    `${Math.round(widthBefore)} → ${Math.round(widthAfter)}px`,
  );

  await page.reload({ waitUntil: "load" });
  await canvas.locator("article .thread-panel").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const labelsReloaded = await canvas
    .locator("article")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  record(
    "lanes survive a reload in the order they were left, card lanes too",
    labelsReloaded.join("|") === labelsAfter.join("|"),
    labelsReloaded.map((label) => label.slice(0, 12)).join(" → "),
  );
  // A lane's title renames in place, and the main thread's from its tab (ADR-138); both keep the new name.
  const threadLane = canvas.locator("article").filter({ has: page.locator(".thread-title") });
  await threadLane.first().locator(".thread-title").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Weekend margins");
  await page.keyboard.press("Enter");
  // The main tab is in view, so one click on its words opens the field (Ethan).
  await page.getByRole("tab", { name: "Last week's sales" }).locator("[data-tab-title]").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Sales, last week");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "load" });
  await canvas.locator("article .thread-panel").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const laneTitle = await threadLane.first().locator(".thread-header").innerText();
  const mainTitle = (await page.getByRole("tab", { selected: true }).innerText()).trim();
  record(
    "a lane's title and the main thread's rename in place and survive a reload",
    laneTitle === "Weekend margins" && mainTitle === "Sales, last week",
    `${laneTitle} / ${mainTitle}`,
  );

  const open = await canvas.locator("article").count();
  await canvas
    .getByRole("button", { name: /^Close / })
    .first()
    .click();
  await page.reload({ waitUntil: "load" });
  await canvas.locator("article .thread-panel").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const closedOnce = (await canvas.locator("article").count()) === open - 1;
  for (let left = open - 1; left > 0; left--) {
    await canvas
      .getByRole("button", { name: /^Close / })
      .first()
      .click();
  }
  await page.reload({ waitUntil: "load" });
  await canvas.getByText("Drag a text selection or UI card here").waitFor({ timeout: 15_000 });
  record(
    "a closed lane stays closed",
    closedOnce && (await canvas.locator("article").count()) === 0,
  );

  await page.goto(`${BASE}/lab`, { waitUntil: "load" });
  await page.getByText("Useful answers.").waitFor({ timeout: 10_000 });
  await shot("lab");
  record("lab route renders the workbench", true);
  await chooseTheme("Dark");
  await page.waitForTimeout(300);
  await shot("lab-dark");
  await chooseTheme("System");

  // The dev server serves the catalog's own modules, so the fragment comes from the real encoder.
  const fragment = await page.evaluate(async (root) => {
    const share = await import(`/@fs${root}/packages/catalog/src/share.ts`);
    const thread = await import(`/@fs${root}/packages/catalog/src/thread.ts`);
    return share.encodeCard({ v: 1, kind: "interactive", payload: thread.profitCard });
  }, ROOT);
  await page.goto(`${BASE}/share.html#${fragment}`, { waitUntil: "load" });
  await page.getByText("Shared from Kay.").waitFor({ timeout: 10_000 });
  await shot("share");
  record(
    "share.html renders the card from the fragment",
    await page.getByRole("heading", { name: "Last week's profit by day" }).isVisible(),
  );

  await page.goto(`${BASE}/share.html`, { waitUntil: "load" });
  await page.getByText("doesn’t contain a card").waitFor({ timeout: 10_000 });
  record("share.html without a card shows the honest notice", true);

  // The dev server answers an unknown path with a 404 status on purpose; that is not a defect.
  const errorsBeforeNotFound = errors.length;
  await page.goto(`${BASE}/nowhere`, { waitUntil: "load" });
  errors.splice(errorsBeforeNotFound);
  await shot("not-found");
  record(
    "unknown path shows the not-found page",
    await page.getByText("Page not found").isVisible(),
  );

  // A device file that opens but cannot be read ends the start broken with its reason, never a
  // fresh starter over threads that are there. A page of its own, so its device is its own;
  // the pool keeps a 4096-byte header of its own before the database's bytes.
  const device = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await device.goto(`${BASE}/`, { waitUntil: "load" });
  await device.locator(".thread-panel").first().waitFor({ timeout: 20_000 });
  await device.goto(`${BASE}/share.html`, { waitUntil: "load" });
  const spoiled = await device.evaluate(async () => {
    const names = [];
    async function spoil(dir, at) {
      for await (const [name, entry] of dir.entries()) {
        if (entry.kind === "directory") {
          await spoil(entry, `${at}/${name}`);
          continue;
        }
        if ((await entry.getFile()).size <= 8192) continue;
        const writable = await entry.createWritable({ keepExistingData: true });
        await writable.seek(4096);
        await writable.write(new Uint8Array(4096).fill(0x5a));
        await writable.close();
        names.push(`${at}/${name}`);
      }
    }
    await spoil(await navigator.storage.getDirectory(), "");
    return names;
  });
  await device.goto(`${BASE}/`, { waitUntil: "load" });
  const notice = device.getByText("Your threads could not be opened", { exact: true });
  await notice.waitFor({ timeout: 20_000 });
  const reason = await notice.locator("xpath=..").innerText();
  await device.getByRole("main").getByRole("button", { name: "Try again" }).click();
  await notice.waitFor({ timeout: 20_000 });
  await device.screenshot({ path: path.join(OUT, "device-broken.png") });
  record(
    "a device file that cannot be read says why and offers Try again, which tries again",
    spoiled.length === 1 && reason.includes("could not be brought up to date"),
    `${spoiled.length} file spoiled; ${reason.replaceAll(/\s+/g, " ").slice(0, 140)}`,
  );
  await device.close();

  // A tab a visit opened is kept like any other (ADR-105): a switch away neither closes it nor
  // unmounts its draft, and each New thread keeps a tab of its own.
  const visited = await pageAt("/t/t-001?scenario=demo");
  await openRow(visited, "Refund audit");
  const refundDraft = shownPanel(visited)
    .locator('[data-slot="resizable-panel"]')
    .first()
    .getByRole("textbox", { name: "Message" });
  await refundDraft.fill("half-written question");
  await openRow(visited, "Last week's sales");
  await openRow(visited, "Refund audit");
  const keptDraft = await refundDraft.inputValue();
  const newThread = visited
    .locator('header[data-slot="title-bar"]')
    .getByRole("button", { name: "New thread", exact: true });
  for (let made = 0; made < 2; made++) {
    const from = visited.url();
    await newThread.click();
    await visited.waitForURL((url) => url.href !== from, { timeout: 10_000 });
  }
  await openRow(visited, "Last week's sales");
  const visitedTabs = await tabNames(visited);
  record(
    "a tab opened from the sidebar or New thread stays open, draft and all, after a switch",
    keptDraft === "half-written question" &&
      visitedTabs.join("|") ===
        "Last week's sales|Service desk weekly review|Refund audit|New thread|New thread",
    `draft ${JSON.stringify(keptDraft)}; tabs ${visitedTabs.join(" | ")}`,
  );
  await visited.close();

  // Leaving a thread never says it is gone while the next page loads; the notice is for an
  // address no thread has. Each way out starts on a fresh page, so its route is not loaded yet.
  // Home leaves from the device's profit thread for the Live Playground's blank thread (ADR-159);
  // a scenario has no Live Playground, so there Home stays on the tab it resumes.
  const fromDemo = { from: "/t/t-001?scenario=demo" };
  const leaving = {
    "the Lab link": {
      ...fromDemo,
      leave: (on) =>
        railOf(on)
          .getByRole("link", { name: "Lab", exact: true })
          .click()
          .then(() => on.getByText("Useful answers.").waitFor({ timeout: 10_000 })),
    },
    "the Home link": {
      from: "/t/profit",
      seed: "demo-store",
      leave: (on) =>
        railOf(on)
          .getByRole("link", { name: "Home", exact: true })
          .click()
          .then(() =>
            on
              .locator('[role="tabpanel"]:not([inert]) [data-slot="welcome"]')
              .waitFor({ timeout: 10_000 }),
          ),
    },
    "closing the last tab": {
      ...fromDemo,
      leave: async (on) => {
        for (const closing of ["Service desk weekly review", "Last week's sales"]) {
          await on.getByRole("button", { name: `Close ${closing}`, exact: true }).click();
        }
        await on.getByText("Nothing open").waitFor({ timeout: 10_000 });
      },
    },
  };
  const falseNotices = [];
  for (const [way, { from, seed, leave }] of Object.entries(leaving)) {
    const on = await pageAt(from, { seed });
    await on.evaluate(() => {
      window.goneFrames = 0;
      requestAnimationFrame(function tick() {
        if (document.body.innerText.includes("This thread is gone")) window.goneFrames += 1;
        requestAnimationFrame(tick);
      });
    });
    await leave(on);
    await on.waitForTimeout(300);
    falseNotices.push(`${way} ${await on.evaluate(() => window.goneFrames)}`);
    await on.close();
  }
  const nowhere = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await nowhere.goto(`${BASE}/t/t-999?scenario=demo`, { waitUntil: "load" });
  const goneShown = await nowhere
    .getByText("This thread is gone")
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  await nowhere.close();
  record(
    "leaving a thread never flashes 'This thread is gone', which an unknown thread still shows",
    falseNotices.every((each) => each.endsWith(" 0")) && goneShown,
    `frames with the notice: ${falseNotices.join(", ")}; unknown thread shows it: ${goneShown}`,
  );

  // Opening a child whose lane was closed appends the lane again, even when the address
  // already names it: a second click on its row opens it as the first did.
  const reopening = await pageAt("/t/t-001?scenario=demo");
  const reopeningCanvas = shownPanel(reopening).getByRole("region", { name: "Compose canvas" });
  const childTitle = "Saturday leads at every level";
  const childRow = reopening
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: childTitle, exact: true });
  const childLane = reopeningCanvas.locator(`:scope > article[aria-label="${childTitle}"]`);
  await childRow.click();
  // The demo opens this lane already, so only its flash says the click's visit has landed; a
  // close before then is undone when the visit opens the lane.
  await childLane.and(reopening.locator("[data-flash]")).waitFor({ timeout: 10_000 });
  await reopeningCanvas.getByRole("button", { name: `Close ${childTitle}`, exact: true }).click();
  await childLane.waitFor({ state: "detached", timeout: 10_000 });
  await childRow.click();
  const laneBack = await childLane.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  // The lane slides into view before it is measured.
  await reopening.waitForTimeout(800);
  const laneInView =
    laneBack === true &&
    (await childLane.evaluate((reopened) => {
      const edges = reopened.getBoundingClientRect();
      const pane = reopened.parentElement.getBoundingClientRect();
      return edges.left >= pane.left - 1 && edges.right <= pane.right + 1;
    })) === true;
  record(
    "a second click on a child's row brings back the lane closed since, in view",
    laneInView,
    `lane back ${laneBack}, in view ${laneInView}, at ${new URL(reopening.url()).pathname}`,
  );
  await reopening.close();

  // Another query parameter asks for the same data, so the first link, which keeps only
  // ?scenario=, starts no second runtime: a closed tab stays closed and a draft stays typed.
  const tagged = await pageAt("/t/t-001?scenario=demo&ref=mail");
  let started = 0;
  tagged.on("worker", () => {
    started += 1;
  });
  await tagged
    .getByRole("button", { name: "Close Service desk weekly review", exact: true })
    .click();
  const taggedDraft = shownPanel(tagged)
    .locator('[data-slot="resizable-panel"]')
    .first()
    .getByRole("textbox", { name: "Message" });
  await taggedDraft.fill("kept draft");
  await openRow(tagged, "Last week's sales");
  await tagged.waitForTimeout(500);
  const taggedTabs = await tabNames(tagged);
  const taggedKept = await taggedDraft.inputValue();
  record(
    "a query parameter besides ?scenario= never restarts the runtime on the first link",
    started === 0 && taggedTabs.join("|") === "Last week's sales" && taggedKept === "kept draft",
    `${started} workers started; tabs ${taggedTabs.join(" | ")}; draft ${JSON.stringify(taggedKept)}`,
  );
  await tagged.close();

  // A lane title longer than its bar ends in an ellipsis, not a letter cut in half: the box
  // that holds the text is the one that clips it, since only a block draws the ellipsis.
  const long = await openScenario("/t/t-013?scenario=long", "article .thread-title");
  const laneTitles = await long
    .locator('[role="tabpanel"]:not([inert]) article .thread-title')
    .evaluateAll((els) =>
      els.map((el) => {
        const bar = el.closest(".thread-header").getBoundingClientRect();
        return {
          inBar: el.getBoundingClientRect().right <= bar.right,
          cut: el.scrollWidth > el.clientWidth,
          ellipsis: getComputedStyle(el).textOverflow === "ellipsis",
        };
      }),
    );
  await long
    .locator('[role="tabpanel"]:not([inert]) article .thread-header')
    .first()
    .screenshot({ path: path.join(OUT, "lane-title-long.png") });
  await long.close();
  const inBar = laneTitles.filter((each) => each.inBar);
  const cutTitles = laneTitles.filter((each) => each.cut);
  const withEllipsis = cutTitles.filter((each) => each.ellipsis);
  record(
    "a lane title too long for its bar stays in the bar and ends in an ellipsis",
    cutTitles.length > 0 &&
      inBar.length === laneTitles.length &&
      withEllipsis.length === cutTitles.length,
    `${laneTitles.length} titles, ${inBar.length} in their bar, ${cutTitles.length} cut, ${withEllipsis.length} with an ellipsis`,
  );

  // A lane's gap takes the focus, so it says how wide its lane is, as a window splitter does:
  // a value inside its range that follows the lane when an arrow key resizes it.
  const demo = await openScenario("/t/t-001?scenario=demo", "article .thread-panel");
  const gaps = demo
    .locator('[role="tabpanel"]:not([inert])')
    .getByRole("region", { name: "Compose canvas" })
    .getByRole("separator");
  const readGaps = () =>
    gaps.evaluateAll((els) =>
      els.map((el) => {
        const value = (name) => Number(el.getAttribute(`aria-${name}`));
        const width = Math.round(el.previousElementSibling.getBoundingClientRect().width);
        return {
          now: value("valuenow"),
          width,
          ok:
            el.getAttribute("aria-valuenow") !== null &&
            value("valuenow") === width &&
            value("valuemin") <= width &&
            width <= value("valuemax") &&
            el.getAttribute("aria-valuetext") === `${width} pixels wide`,
        };
      }),
    );
  const gapsAtRest = await readGaps();
  await gaps.first().focus();
  await demo.keyboard.press("ArrowRight");
  await demo.waitForTimeout(300);
  const gapsResized = await readGaps();
  await demo.close();
  record(
    "a lane's gap says the lane's width in pixels, within its range, and follows an arrow key",
    gapsAtRest.length > 0 &&
      gapsAtRest.every((gap) => gap.ok) === true &&
      gapsResized.every((gap) => gap.ok) === true &&
      gapsResized[0].now === gapsAtRest[0].width + LANE_GAP_PX,
    `${gapsAtRest.map((gap) => `${gap.now}/${gap.width}`).join(" ")} → ${gapsResized.map((gap) => `${gap.now}/${gap.width}`).join(" ")}`,
  );

  // Closing a lane from the keyboard hands the focus on rather than dropping it to the page:
  // to the next lane's close, else the one before's, else Create blank thread.
  const focusAfterClosing = async (which) => {
    const view = await openScenario("/t/t-001?scenario=demo", "article .thread-panel");
    const closes = view
      .locator('[role="tabpanel"]:not([inert])')
      .getByRole("region", { name: "Compose canvas" })
      .getByRole("button", { name: /^Close / });
    const landed = [];
    for (const pick of which) {
      await (pick === "first" ? closes.first() : closes.last()).focus();
      await view.keyboard.press("Enter");
      await view.waitForTimeout(300);
      const name = await view.evaluate(() => {
        const at = document.activeElement;
        if (at === null || at === document.body) return "the page";
        return at.getAttribute("aria-label") ?? at.textContent.trim();
      });
      landed.push(name);
    }
    await view.close();
    return landed;
  };
  const forward = await focusAfterClosing(["first", "first"]);
  const back = await focusAfterClosing(["last"]);
  record(
    "closing a lane from the keyboard moves the focus to the next lane, the one before, or Create blank thread",
    forward.join("|") === "Close Saturday leads at every level|Create blank thread" &&
      back.join("|") === "Close Last week's profit by day",
    `${forward.join(" → ")}; from the end: ${back.join("")}`,
  );

  // A thread that cannot be opened keeps the frame an open one has: a lane its paper, border and
  // title bar, the main pane its bare pane (ADR-138), with the reason and Try again inside it.
  // The title bar's grip is what takes hold of a lane, so the failed lane still moves along the row.
  const fails = await openScenario("/t/t-002?scenario=thread-fails", 'button:text-is("Try again")');
  const failedTab = fails.locator('[role="tabpanel"]:not([inert])');
  const frames = await failedTab.evaluate((tab) =>
    [...tab.querySelectorAll("button")]
      .filter((button) => button.textContent === "Try again")
      .map((button) => {
        const frame = button.closest(".thread-panel");
        return {
          place: button.closest("article")?.getAttribute("aria-label") ?? "main",
          named: frame?.getAttribute("aria-label") ?? null,
          title: frame?.querySelector(".thread-header h2")?.textContent ?? null,
          paper: frame !== null && getComputedStyle(frame).backgroundColor !== "rgba(0, 0, 0, 0)",
        };
      }),
  );
  await failedTab.screenshot({ path: path.join(OUT, "thread-fails-framed.png") });
  const failedCanvas = failedTab.getByRole("region", { name: "Compose canvas" });
  const failedLanes = () =>
    failedCanvas
      .locator(":scope > article")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  const lanesBefore = await failedLanes();
  const failedBar = failedCanvas.locator("article .thread-header").last();
  const failedBox = (await failedBar.count()) === 0 ? null : await failedBar.boundingBox();
  if (failedBox !== null) {
    // The grip, the one place on the bar that takes the lane (the catalog's gripZone.ts).
    const failedGrip = {
      x: failedBox.x + failedBox.width / 2,
      y: failedBox.y + failedBox.height / 2 - 2,
    };
    await fails.mouse.move(failedGrip.x, failedGrip.y);
    await fails.mouse.down();
    await fails.mouse.move(failedGrip.x - 24, failedGrip.y, { steps: 4 });
    await fails.mouse.move(failedBox.x - 400, failedGrip.y, { steps: 12 });
    await fails.mouse.up();
    await fails.waitForTimeout(400);
  }
  const lanesAfter = await failedLanes();
  await fails.close();
  const framed = frames.filter((frame) =>
    frame.place === "main"
      ? frame.named !== null && frame.title === null
      : frame.paper === true && frame.named === frame.title && frame.place === frame.title,
  );
  record(
    "a thread that cannot be opened keeps its frame and title bar, and its lane still moves",
    frames.length === 2 &&
      framed.length === frames.length &&
      lanesBefore.length === 2 &&
      lanesAfter.join("|") === lanesBefore.toReversed().join("|"),
    `${framed.length} of ${frames.length} framed (${frames.map((frame) => `${frame.place}: ${frame.title}`).join("; ")}); lanes ${lanesBefore.join(" | ")} → ${lanesAfter.join(" | ")}`,
  );

  // Try again keeps the focus in its thread rather than dropping it to the page with the
  // button: when the thread fails again, the focus is on its Try again, in a lane as in the
  // main pane.
  const retried = await openScenario(
    "/t/t-002?scenario=thread-fails",
    'button:text-is("Try again")',
  );
  const retryTab = retried.locator('[role="tabpanel"]:not([inert])');
  const afterRetry = [];
  for (const thread of ["Last week's sales", "Saturday leads at every level"]) {
    await retryTab
      .getByRole("region", { name: thread, exact: true })
      .getByRole("button", { name: "Try again" })
      .focus();
    await retried.keyboard.press("Enter");
    await retried.waitForTimeout(400);
    const at = await retried.evaluate(() => {
      const focused = document.activeElement;
      if (focused === null || focused === document.body) return "the page";
      const frame = focused.closest(".thread-panel")?.getAttribute("aria-label");
      return `${focused.textContent.trim()} in ${frame}`;
    });
    afterRetry.push(at);
  }
  await retried.close();
  record(
    "Try again keeps the focus in its thread, on Try again when it fails again",
    afterRetry.join("|") ===
      "Try again in Last week's sales|Try again in Saturday leads at every level",
    afterRetry.join("; "),
  );

  // Start a thread leaves with the notice it sits in, and hands the focus to the thread it
  // starts rather than dropping it to the page: on the thread's compose box once it opens.
  const home = await openScenario(
    "/?scenario=empty",
    'button:text-is("Start a thread")',
    '[role="main"]',
  );
  await home.getByRole("button", { name: "Start a thread" }).focus();
  await home.keyboard.press("Enter");
  await home.locator('[role="tabpanel"]:not([inert]) .compose-box textarea').waitFor();
  await home.waitForTimeout(300);
  const afterStart = await home.evaluate(() => {
    const focused = document.activeElement;
    if (focused === null || focused === document.body) return "the page";
    const tab = focused.closest('[role="tabpanel"]')?.getAttribute("aria-label");
    return `${focused.getAttribute("aria-label") ?? focused.textContent.trim()} in ${tab}`;
  });
  await home.close();
  record(
    "Start a thread puts the focus on the compose box of the thread it starts",
    afterStart === "Message in New thread",
    afterStart,
  );

  // A carry over the canvas rings it in olive all the way round. The canvas fills the window's
  // rounded corner at the bottom right, so the ring has to follow that curve or be cut off by
  // it: some pixel on the corner's diagonal is the ring's olive, as the straight edge is.
  const ringed = await openScenario("/t/t-001?scenario=demo", "article .thread-panel");
  const ringTab = ringed.locator('[role="tabpanel"]:not([inert])');
  const cardBar = await ringTab
    .locator(".thread-panel")
    .first()
    .locator(".card-heading")
    .last()
    .boundingBox();
  const ringCanvas = await ringTab.getByRole("region", { name: "Compose canvas" }).boundingBox();
  await ringed.mouse.move(cardBar.x + 20, cardBar.y + cardBar.height / 2);
  await ringed.mouse.down();
  await ringed.mouse.move(cardBar.x + 40, cardBar.y + cardBar.height / 2 + 5, { steps: 5 });
  await ringed.mouse.move(ringCanvas.x + 120, ringCanvas.y + 200, { steps: 15 });
  await ringed.waitForTimeout(300);
  const frame = await ringed.locator('[data-slot="window"]').first().boundingBox();
  const cornerClip = { x: frame.x + frame.width - 16, y: frame.y + frame.height - 16 };
  const corner = await ringed.screenshot({ clip: { ...cornerClip, width: 16, height: 16 } });
  await ringed.screenshot({
    path: path.join(OUT, "canvas-ring-corner.png"),
    clip: { x: cornerClip.x - 24, y: cornerClip.y - 24, width: 40, height: 40 },
  });
  // How far each pixel on the diagonal, and one on the bottom edge, is from the olive.
  const fromOlive = await ringed.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${b64}`)).blob(),
    );
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--olive");
    context.fillRect(0, 0, 1, 1);
    const olive = context.getImageData(0, 0, 1, 1).data;
    context.drawImage(bitmap, 0, 0);
    const distance = (x, y) => {
      const pixel = context.getImageData(x, y, 1, 1).data;
      return Math.max(...[0, 1, 2].map((i) => Math.abs(pixel[i] - olive[i])));
    };
    return {
      diagonal: Array.from({ length: bitmap.width }, (_, i) => distance(i, i)),
      edge: distance(0, bitmap.height - 2),
    };
  }, corner.toString("base64"));
  await ringed.keyboard.press("Escape");
  await ringed.mouse.up();
  await ringed.close();
  record(
    "a carry's ring over the canvas follows the window's rounded corner",
    fromOlive.edge <= 8 && Math.min(...fromOlive.diagonal) <= 40,
    `edge ${fromOlive.edge} from the olive; the corner's diagonal ${fromOlive.diagonal.join(" ")}`,
  );

  await onOwnPage(
    "the tab strip holds only tabs, and a tab's close button still closes it",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      const strip = own.getByRole("tablist", { name: "Open threads" });
      await tabsOf(own).first().waitFor({ timeout: 15_000 });
      const strays = await strip.getByRole("button").count();
      await strip.getByRole("tab", { name: "Last week's sales" }).hover();
      await own.waitForTimeout(100);
      const closer = own.getByRole("button", { name: "Close Last week's sales" });
      const shown = await closer.evaluate((el) => getComputedStyle(el).opacity);
      await closer.click();
      await own.waitForTimeout(300);
      const left = await tabsOf(own).allInnerTexts();
      return {
        ok: strays === 0 && shown === "1" && left.join() === "Service desk weekly review",
        detail: `${strays} buttons in the tablist; close shown on hover ${shown}; tabs left ${left.join(", ")}`,
      };
    },
  );

  await onOwnPage(
    "closing a focused tab by key hands focus to the tab that takes its place, then to New thread",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      await tabsOf(own).first().waitFor({ timeout: 15_000 });
      await tabsOf(own).filter({ hasText: "Service desk weekly review" }).focus();
      await own.keyboard.press("Delete");
      await own.waitForURL(/\/t\/t-001/);
      const next = await focusOn(own);
      if (next.startsWith("tab ") === true) {
        await own.keyboard.press("Delete");
        await own.getByText("Nothing open").waitFor();
      }
      const none = await focusOn(own);
      return {
        ok: next === "tab Last week's sales" && none === "button New thread",
        detail: `focus after closing the selected tab: ${next}; after closing the last: ${none}`,
      };
    },
  );

  await onOwnPage(
    "at phone width the bar's top row and its row of views each take a tap, and nothing spills",
    "/t/t-005?scenario=demo",
    { viewport: { width: 390, height: 844 } },
    async (own) => {
      await own.locator('[data-slot="project-name"]').filter({ hasText: /\S/ }).waitFor({
        timeout: 15_000,
      });
      const look = await own.evaluate(() => {
        const bar = document.querySelector('header[data-slot="title-bar"]');
        const width = innerWidth;
        // On screen, and a tap at its centre lands on it: nothing clips or covers it.
        const takesTap = (el) => {
          const rect = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return rect.width > 0 && rect.left >= 0 && rect.right <= width && el.contains(hit);
        };
        // Two rows (ADR-116): the controls that never scroll, then the views. The account
        // moved to the sidebar's foot on a phone, so the bar itself never shows it.
        const top = [
          '[aria-label="Toggle sidebar"]',
          '[aria-label^="Notifications"]',
          // The bar's own "⋯", not the hidden tab strip's (ADR-138).
          '[aria-label="Thread actions"]:not(.chrome-pill *)',
        ].map((selector) => takesTap(bar.querySelector(selector)));
        const views = [...bar.querySelectorAll('[role="group"][aria-label="Layout"] button')].map(
          (el) => takesTap(el),
        );
        return {
          project: bar.querySelector('[data-slot="project-name"]').textContent,
          top,
          views,
          noAccount: bar.querySelector('[aria-label="Account"]') === null,
          height: bar.getBoundingClientRect().height,
          spill: bar.scrollWidth - bar.clientWidth,
        };
      });
      await own.screenshot({ path: path.join(OUT, "title-bar-phone.png") });
      return {
        ok:
          look.project === "Service desk" &&
          look.top.every(Boolean) === true &&
          look.views.length === 3 &&
          look.views.every(Boolean) === true &&
          look.noAccount === true &&
          look.height === 82 &&
          look.spill <= 0,
        detail: JSON.stringify(look),
      };
    },
  );

  await onOwnPage(
    "the rail's places and the projects are two navigation landmarks, Places and Sidebar",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      await tabsOf(own).first().waitFor({ timeout: 15_000 });
      const places = own.getByRole("navigation", { name: "Places" });
      const sidebar = own.getByRole("navigation", { name: "Sidebar" });
      const counts = await Promise.all(
        RAIL_PLACES.map(({ role, name }) => places.getByRole(role, { name, exact: true }).count()),
      );
      const held = Object.fromEntries(RAIL_PLACES.map(({ name }, i) => [name, counts[i]]));
      held["Demo store in Sidebar"] = await sidebar
        .getByRole("button", { name: "Demo store", exact: true })
        .count();
      held["Demo store in Places"] = await places
        .getByRole("button", { name: "Demo store", exact: true })
        .count();
      const apart = await own.evaluate(() => {
        const [a, b] = ["Places", "Sidebar"].map((name) =>
          document.querySelector(`[role="navigation"][aria-label="${name}"]`),
        );
        return a !== null && b !== null && !a.contains(b) && !b.contains(a);
      });
      const once = Object.entries(held).every(([key, n]) =>
        key === "Demo store in Places" ? n === 0 : n === 1,
      );
      return { ok: once && apart, detail: `${JSON.stringify(held)}; apart ${apart}` };
    },
  );

  await onOwnPage(
    "Toggle sidebar says whether the sidebar is expanded, and names what it controls",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      await tabsOf(own).first().waitFor({ timeout: 15_000 });
      const toggle = own.getByRole("button", { name: "Toggle sidebar" });
      const state = () =>
        toggle.evaluate((el) => ({
          expanded: el.getAttribute("aria-expanded"),
          controls:
            document
              .querySelector(`#${CSS.escape(el.getAttribute("aria-controls"))}`)
              ?.getAttribute("aria-label") ?? null,
        }));
      const before = await state();
      await toggle.click();
      const after = await state();
      return {
        ok:
          before.expanded === "true" && after.expanded === "false" && before.controls === "Sidebar",
        detail: `before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`,
      };
    },
  );

  await onOwnPage(
    "on a phone the sidebar pushes the page aside, and a tap on the page or a chosen thread closes it",
    "/t/t-005?scenario=demo",
    { viewport: { width: 390, height: 844 } },
    async (own) => {
      // A phone shows the project's name where a desktop shows tabs (ADR-116).
      await own.locator('[data-slot="project-name"]').filter({ hasText: /\S/ }).waitFor({
        timeout: 15_000,
      });
      const toggle = own.getByRole("button", { name: "Toggle sidebar" });
      await toggle.click();
      await own.waitForTimeout(600);
      // Pushed, not covered (ADR-121): the bar starts where the drawer ends, and still shows.
      const push = await own.evaluate(() => {
        const drawer = document
          .querySelector('dialog[data-slot="sidebar"]')
          .getBoundingClientRect();
        const bar = document.querySelector('header[data-slot="title-bar"]');
        return {
          drawer: Math.round(drawer.right),
          bar: Math.round(bar.getBoundingClientRect().left),
          inert: bar.inert,
          spill: document.documentElement.scrollWidth - innerWidth,
        };
      });
      await own.screenshot({ path: path.join(OUT, "sidebar-phone.png") });
      await own.mouse.click(380, 420);
      await own.waitForTimeout(600);
      const afterTap = await own.getByRole("dialog").count();
      await toggle.click();
      await own.waitForTimeout(600);
      await own.getByRole("dialog").getByRole("link", { name: "Last week's sales" }).click();
      await own.waitForURL(/\/t\/t-001/);
      await own.waitForTimeout(600);
      const afterChoice = await own.getByRole("dialog").count();
      return {
        ok:
          push.drawer > 0 &&
          push.bar === push.drawer &&
          push.bar < 390 &&
          push.inert === true &&
          push.spill <= 0 &&
          afterTap === 0 &&
          afterChoice === 0,
        detail: `${JSON.stringify(push)}; open after a tap on the page ${afterTap}; after choosing a thread ${afterChoice}`,
      };
    },
  );

  await onOwnPage(
    "on a phone the account sits at the foot of the sidebar, and its menu opens there",
    "/t/t-005?scenario=demo",
    { viewport: { width: 390, height: 844 } },
    async (own) => {
      await own.locator('[data-slot="project-name"]').filter({ hasText: /\S/ }).waitFor({
        timeout: 15_000,
      });
      const initialTheme = await own.evaluate(() => document.documentElement.dataset.theme);
      await own.getByRole("button", { name: "Toggle sidebar" }).click();
      await own.waitForTimeout(600);
      const drawer = own.getByRole("dialog");
      const onePage = (await own.getByRole("button", { name: "Account" }).count()) === 1;
      const account = drawer.getByRole("button", { name: "Account" });
      const inDrawer = (await account.count()) === 1;
      const footed = await accountSitsLow(own);
      await account.click();
      await own.getByRole("menu").waitFor();
      const within = await menuOnScreen(own, 390, 844);
      await own.screenshot({ path: path.join(OUT, "account-menu-phone-light.png") });
      await own.getByRole("menuitemradio", { name: "Dark" }).click();
      const darkened = await own.evaluate(() => document.documentElement.dataset.theme);
      await own.screenshot({ path: path.join(OUT, "account-menu-phone-dark.png") });
      await own.getByRole("menuitemradio", { name: "System" }).click();
      const restored = await own.evaluate(() => document.documentElement.dataset.theme);
      await own.keyboard.press("Escape");
      await own.waitForTimeout(200);
      const menuGone = (await own.getByRole("menu").count()) === 0;
      const drawerStillOpen = (await drawer.count()) === 1;
      return {
        ok:
          onePage &&
          inDrawer &&
          footed === true &&
          within === true &&
          darkened === "dark" &&
          restored === initialTheme &&
          menuGone &&
          drawerStillOpen,
        detail: `one Account button on the page ${onePage}; in the drawer ${inDrawer}; low in it ${footed}; every item on screen ${within}; theme light→${darkened}→${restored}; Escape closed the menu ${menuGone}, left the drawer open ${drawerStillOpen}`,
      };
    },
  );

  // A phone has no rail (ADR-144): its drawer is one labelled column, the places as rows with
  // the Lab's name in view, then the projects, then the one account at its foot.
  const drawerIsOneColumn = (width) =>
    onOwnPage(
      `a ${width}px phone has no rail: its drawer lists the places, then the projects, then the account`,
      "/t/t-005?scenario=demo",
      { viewport: { width, height: 844 } },
      async (own) => {
        await own.locator('[data-slot="project-name"]').filter({ hasText: /\S/ }).waitFor({
          timeout: 15_000,
        });
        await own.getByRole("button", { name: "Toggle sidebar" }).click();
        await own.locator('dialog[data-slot="sidebar"][data-state="open"]').waitFor();
        await own.waitForTimeout(400);
        const look = await own.evaluate(() => {
          const drawer = document.querySelector('dialog[data-slot="sidebar"]');
          const lab = drawer.querySelector('a[aria-label="Lab"] span');
          const project = [...drawer.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Demo store",
          );
          const account = drawer.querySelector('[aria-label="Account"]');
          const [d, l, p, a] = [drawer, lab, project, account].map(
            (el) => el?.getBoundingClientRect() ?? null,
          );
          const all = l !== null && p !== null && a !== null;
          return {
            rail: document.querySelector('[data-slot="rail"]') !== null,
            accounts: document.querySelectorAll('[aria-label="Account"]').length,
            labShown: l !== null && l.width > 0 && l.left >= d.left && l.right <= d.right,
            inOrder: all && l.bottom <= p.top && p.bottom <= a.top,
            foot: a === null ? null : Math.round(d.bottom - a.bottom),
          };
        });
        await own.screenshot({ path: path.join(OUT, `drawer-${width}.png`) });
        return {
          ok:
            look.rail === false &&
            look.accounts === 1 &&
            look.labShown === true &&
            look.inOrder === true &&
            look.foot !== null &&
            look.foot <= 16,
          detail: JSON.stringify(look),
        };
      },
    );
  await drawerIsOneColumn(390);
  await drawerIsOneColumn(767);

  await onOwnPage(
    "on desktop the one Account button is at the rail's foot, and the bell is the bar's last control",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      await railOf(own).waitFor({ timeout: 15_000 });
      const all = await own.getByRole("button", { name: "Account" }).count();
      const account = railOf(own).getByRole("button", { name: "Account" });
      const inRail = await account.count();
      const inTitleBar = await own
        .locator('header[data-slot="title-bar"]')
        .getByRole("button", { name: "Account" })
        .count();
      const inNav = await own
        .locator('[role="navigation"]')
        .getByRole("button", { name: "Account" })
        .count();
      const face = await account.boundingBox();
      const railBox = await railOf(own).boundingBox();
      const foot = face.y + face.height >= railBox.y + railBox.height - 16;
      const bell = await own
        .locator('header[data-slot="title-bar"]')
        .getByRole("button", { name: /^Notifications/ })
        .boundingBox();
      const rightmost = await furthestRight(own);
      const bellLast = Math.abs(bell.x + bell.width - rightmost.right) < 1;
      await account.click();
      const opened = await own.getByRole("menu").boundingBox();
      const view = own.viewportSize();
      const onScreen =
        opened !== null &&
        opened.x >= 0 &&
        opened.y >= 0 &&
        opened.x + opened.width <= view.width &&
        opened.y + opened.height <= view.height;
      const upward = opened !== null && opened.y + opened.height <= face.y;
      await own.keyboard.press("Escape");
      return {
        ok:
          all === 1 &&
          inRail === 1 &&
          inTitleBar === 0 &&
          inNav === 0 &&
          foot &&
          bellLast &&
          onScreen &&
          upward,
        detail: `${all} Account button(s) on the page; ${inRail} in the rail, ${inTitleBar} in the bar, ${inNav} inside a navigation landmark; at the rail's foot ${foot}; bell is the bar's last control ${bellLast} (furthest right: ${rightmost.name}); menu on screen ${onScreen}, opening upward ${upward}`,
      };
    },
  );

  await onOwnPage(
    "the rail's icons sit centred in their squares, which hold still with the panel docked",
    "/t/t-005?scenario=demo",
    { viewport: { width: 1024, height: 768 } },
    async (own) => {
      await tabsOf(own).first().waitFor({ timeout: 15_000 });
      // Each place's square, and its glyph's centre minus the square's, x then y.
      const squares = () =>
        railOf(own)
          .locator('[data-sidebar="header"]')
          .evaluate((header) =>
            [...header.querySelectorAll('[data-sidebar="menu-button"]')].map((place) => {
              const square = place.getBoundingClientRect();
              const glyph = place.querySelector("svg").getBoundingClientRect();
              return {
                square: [square.x, square.y, square.width, square.height],
                offset: [
                  glyph.left + glyph.width / 2 - (square.left + square.width / 2),
                  glyph.top + glyph.height / 2 - (square.top + square.height / 2),
                ],
              };
            }),
          );
      const collapsed = await squares();
      await own.getByRole("button", { name: "Toggle sidebar" }).press("Enter");
      await own.locator('[data-slot="sidebar"][data-state="expanded"]').waitFor();
      const docked = await squares();
      const centred = [...collapsed, ...docked]
        .flatMap(({ offset }) => offset)
        .every((each) => Math.abs(each) < 0.5);
      const still =
        JSON.stringify(collapsed.map((place) => place.square)) ===
        JSON.stringify(docked.map((place) => place.square));
      return {
        ok: collapsed.length === RAIL_PLACES.length && centred && still,
        detail: `icon centre minus square centre (x, y): ${collapsed.map((place) => place.offset.join(", ")).join("; ")}; squares the same docked ${still}`,
      };
    },
  );

  await onOwnPage(
    "Toggle sidebar looks the same at rest whether the sidebar is open or not",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      await tabsOf(own).first().waitFor({ timeout: 15_000 });
      const toggle = own.getByRole("button", { name: "Toggle sidebar" });
      const look = async () => {
        await own.mouse.move(900, 600);
        await own.waitForTimeout(250);
        return toggle.evaluate((el) => {
          const style = getComputedStyle(el);
          return `${style.backgroundColor} ${style.color}`;
        });
      };
      const expanded = await look();
      await toggle.click();
      const collapsed = await look();
      return {
        ok: expanded === collapsed,
        detail: `expanded ${expanded}; collapsed ${collapsed}`,
      };
    },
  );

  await onOwnPage(
    "a cut sidebar row shows its whole name on the first hover and on keyboard focus",
    "/t/t-001?scenario=long",
    {},
    async (own) => {
      const rows = own.locator('[data-slot="sidebar"] [data-thread="main"]');
      await rows.first().waitFor({ timeout: 15_000 });
      const tips = own.locator('[data-slot="tooltip-content"]');
      const cut = await rows.evaluateAll((els) =>
        els.slice(0, 2).map((el) => {
          const label = el.querySelector("[data-label]");
          return label.scrollWidth > label.clientWidth;
        }),
      );
      const [first, second] = [await rows.nth(0).innerText(), await rows.nth(1).innerText()];
      await rows.nth(0).hover();
      await own.waitForTimeout(600);
      const onHover = await tips.allInnerTexts();
      await own.mouse.move(900, 450);
      await own.waitForTimeout(400);
      await rows.nth(1).focus();
      await own.keyboard.press("Shift+Tab");
      await own.keyboard.press("Tab");
      await own.waitForTimeout(600);
      const onFocus = await tips.allInnerTexts();
      return {
        ok:
          cut.every(Boolean) === true &&
          onHover.includes(first) === true &&
          onFocus.includes(second) === true,
        detail: `rows cut ${cut.join()}; tooltips on the first hover ${JSON.stringify(onHover)}, on focus ${JSON.stringify(onFocus)}`,
      };
    },
  );

  await onOwnPage(
    "a project's + for a new thread sits at the row's right edge, folded or open",
    "/?scenario=demo",
    {},
    async (own) => {
      const side = own.locator('[data-slot="sidebar"]');
      const project = side.getByRole("button", { name: "Demo store", exact: true });
      await project.waitFor({ timeout: 15_000 });
      const plus = side.getByRole("button", { name: "New thread in Demo store" });
      const look = async () => {
        const [projectBox, plusBox] = await Promise.all([
          project.boundingBox(),
          plus.boundingBox(),
        ]);
        const right = projectBox.x + projectBox.width;
        return {
          visible: Boolean(await plus.isVisible()),
          atRight:
            plusBox.x + plusBox.width <= right + 1 && right - (plusBox.x + plusBox.width) <= 24,
        };
      };
      const openLook = await look();
      await project.click();
      await own.waitForTimeout(200);
      const foldedLook = await look();
      return {
        ok: openLook.visible && openLook.atRight && foldedLook.visible && foldedLook.atRight,
        detail: `open ${JSON.stringify(openLook)}; folded ${JSON.stringify(foldedLook)}`,
      };
    },
  );

  await onOwnPage(
    "a main row with children keeps its fold arrow beside the name and its count at the far right",
    "/?scenario=demo",
    {},
    async (own) => {
      const row = own.locator('[data-slot="sidebar"] [data-slot="thread-row"]').first();
      await row.waitFor({ timeout: 15_000 });
      const label = row.locator("[data-label]");
      const arrow = row.locator("button[aria-expanded]");
      const chevron = row.locator('[data-slot="fold-chevron"]');
      const count = row.locator('[data-slot="thread-count"]');
      const [labelBox, arrowBox, countBox, rowBox] = await Promise.all(
        [label, arrow, count, row].map((each) => each.boundingBox()),
      );
      const gap = arrowBox.x - (labelBox.x + labelBox.width);
      const countRight = rowBox.x + rowBox.width - (countBox.x + countBox.width); // → px
      const countText = await count.innerText();
      await own.mouse.move(900, 450);
      await own.waitForTimeout(200);
      const restOpacity = await chevron.evaluate((el) => getComputedStyle(el).opacity);
      const plain = own
        .locator('[data-slot="sidebar"] a[data-thread="main"]:not([aria-current]) [data-label]')
        .first();
      const [ink, plainInk] = await Promise.all(
        [label, plain].map((each) => each.evaluate((el) => getComputedStyle(el).color)),
      );
      await row.hover();
      await own.waitForTimeout(200);
      const hoverOpacity = await chevron.evaluate((el) => getComputedStyle(el).opacity);
      await arrow.click();
      await own.waitForTimeout(200);
      const foldedExpanded = await arrow.getAttribute("aria-expanded");
      const foldedOpacity = await chevron.evaluate((el) => getComputedStyle(el).opacity);
      // Opened again by a click, which leaves focus on the button: the "v" still fades once the
      // pointer leaves, since only keyboard focus holds it up.
      await arrow.click();
      await own.mouse.move(900, 450);
      await own.waitForTimeout(400);
      const leftOpacity = await chevron.evaluate((el) => getComputedStyle(el).opacity);
      return {
        ok:
          gap >= 0 &&
          gap <= 12 &&
          countText === "2" &&
          countRight === 8 &&
          leftOpacity === "0" &&
          ink === plainInk &&
          restOpacity === "0" &&
          hoverOpacity === "1" &&
          foldedExpanded === "false" &&
          foldedOpacity === "1",
        detail: `gap ${gap.toFixed(1)}px; count ${countText}, ${countRight}px from the right; opacity after a click and leaving ${leftOpacity}; title ${ink} vs a plain row ${plainInk}; chevron opacity at rest ${restOpacity}, on hover ${hoverOpacity}, folded ${foldedOpacity} (expanded ${foldedExpanded})`,
      };
    },
  );

  await onOwnPage(
    "every thread row keeps only 8px at its right, not the room shadcn keeps for an action",
    "/?scenario=demo",
    {},
    async (own) => {
      const side = own.locator('[data-slot="sidebar"]');
      await side.locator('[data-slot="thread-row"]').first().waitFor({ timeout: 15_000 });
      // The element that paints each row's fill: the foldable main's wrapper, else the link.
      const rows = await side
        .locator('[data-slot="thread-row"], a[data-thread]:not([data-slot="thread-row"] a)')
        .evaluateAll((all) =>
          all.map((row) => `${row.textContent.trim()} ${getComputedStyle(row).paddingRight}`),
        ); // → string[]
      return {
        ok: rows.length > 2 && rows.every((row) => row.endsWith(" 8px")),
        detail: rows.join("; "),
      };
    },
  );

  await onOwnPage(
    "a child row stays under the pointer when a click reopens its closed lane",
    "/?scenario=demo",
    {},
    async (own) => {
      const side = own.locator('[data-slot="sidebar"]');
      const children = () => side.locator('a[data-thread="child"] [data-label]').allInnerTexts(); // → string[]
      const composeCanvas = shownPanel(own).getByRole("region", { name: "Compose canvas" });
      // Newest first, as the sidebar lists them.
      const titles = ["Why is Tuesday quiet?", "Saturday leads at every level"];
      // Opens each child's lane from its row, then closes it from the canvas, so both rows sit
      // among the closed children, where a lane-ordered list once reshuffled them on a click.
      for (const kidTitle of titles) {
        const kidLane = composeCanvas.locator(`:scope > article[aria-label="${kidTitle}"]`);
        await side.getByRole("link", { name: kidTitle, exact: true }).click();
        // Saturday's lane is open from the start, so wait for the visit's flash, as above.
        await kidLane.and(own.locator("[data-flash]")).waitFor({ timeout: 10_000 });
        await composeCanvas.getByRole("button", { name: `Close ${kidTitle}`, exact: true }).click();
        await kidLane.waitFor({ state: "detached", timeout: 10_000 });
      }
      const before = await children();
      const row = side.getByRole("link", { name: titles[1], exact: true });
      const yBefore = (await row.boundingBox()).y;
      await row.click();
      await own.waitForTimeout(600);
      const yAfter = (await row.boundingBox()).y;
      const after = await children();
      return {
        ok: yAfter === yBefore && after.join() === before.join() && before.join() === titles.join(),
        detail: `row y ${yBefore} → ${yAfter}; children ${before.join(" | ")} → ${after.join(" | ")}`,
      };
    },
  );

  await onOwnPage(
    "clicking a main row's empty space opens it, and its arrow only folds",
    "/?scenario=demo",
    {},
    async (own) => {
      const side = own.locator('[data-slot="sidebar"]');
      const row = side.locator('[data-slot="thread-row"]').first();
      await row.waitFor({ timeout: 15_000 });
      await side.getByRole("link", { name: "Refund audit", exact: true }).click();
      await own.waitForTimeout(300);
      const away = own.url();
      const rowBox = await row.boundingBox();
      await own.mouse.click(rowBox.x + rowBox.width - 4, rowBox.y + rowBox.height / 2);
      await own.waitForTimeout(300);
      const opened = own.url();
      const arrow = row.locator("button[aria-expanded]");
      const beforeToggle = await arrow.getAttribute("aria-expanded");
      const child = side.getByRole("link", { name: "Saturday leads at every level" });
      const shownBefore = Boolean(await child.isVisible());
      await arrow.click();
      await own.waitForTimeout(200);
      const afterToggle = await arrow.getAttribute("aria-expanded");
      const shownAfter = Boolean(await child.isVisible());
      const stillOpened = own.url();
      return {
        ok:
          opened !== away &&
          /\/t\//.test(opened) &&
          beforeToggle === "true" &&
          shownBefore &&
          afterToggle === "false" &&
          !shownAfter &&
          stillOpened === opened,
        detail: `left ${away} for ${opened} on a click at the row's right edge; fold ${beforeToggle}→${afterToggle} ${stillOpened === opened ? "kept the address" : `moved to ${stillOpened}`}; child shown before ${shownBefore}, after ${shownAfter}`,
      };
    },
  );

  await onOwnPage(
    "a project name with an unbroken word wraps inside its tooltip",
    "/t/t-001?scenario=long",
    {},
    async (own) => {
      const row = own
        .locator('[data-slot="sidebar"] button[aria-expanded]')
        .filter({ hasText: "Supplierinvoice" })
        .first();
      await row.waitFor({ timeout: 15_000 });
      await row.scrollIntoViewIfNeeded();
      await row.hover();
      const tip = own
        .locator('[data-slot="tooltip-content"]')
        .filter({ hasText: "Supplierinvoice" });
      await tip.waitFor({ timeout: 3000 });
      const fit = await tip.evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      await own.screenshot({ path: path.join(OUT, "tooltip-unbroken.png") });
      return { ok: fit.scroll <= fit.client, detail: JSON.stringify(fit) };
    },
  );

  await onOwnPage(
    "New project hands focus to the new thread's row in the sidebar",
    "/?scenario=empty",
    {},
    async (own) => {
      await own.getByRole("button", { name: "New project" }).focus();
      await own.keyboard.press("Enter");
      await own.waitForURL(/\/t\//);
      await own.waitForTimeout(500);
      const at = await own.evaluate(() => ({
        current: document.activeElement.getAttribute("aria-current"),
        sidebar: document.activeElement.closest('[data-slot="sidebar"]') !== null,
      }));
      return {
        ok: at.current === "page" && at.sidebar,
        detail: `focus on ${await focusOn(own)}, current ${at.current}, in the sidebar ${at.sidebar}`,
      };
    },
  );

  await onOwnPage(
    "a thread page and /lab each have exactly one main landmark",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      await tabsOf(own).first().waitFor({ timeout: 15_000 });
      const onThread = await own.getByRole("main").count();
      await own.goto(`${BASE}/lab?scenario=demo`, { waitUntil: "load" });
      await own.getByText("Useful answers.").waitFor({ timeout: 10_000 });
      const onLab = await own.getByRole("main").count();
      return {
        ok: onThread === 1 && onLab === 1,
        detail: `${onThread} on a thread, ${onLab} on /lab`,
      };
    },
  );

  await onOwnPage(
    "the browser's Simulated badge clears 4.5:1 on the address field in either theme, and an OS in dark mode gets the dark page (ADR-162)",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      const badge = own
        .locator('[role="tabpanel"]:not([inert])')
        .getByRole("region", { name: "Browser" })
        .getByText("Simulated", { exact: true });
      const ratio = async (colorScheme) => {
        await own.emulateMedia({ colorScheme });
        await own.reload({ waitUntil: "load" });
        await badge.waitFor({ timeout: 15_000 });
        return badge.evaluate((el) => {
          // Every fill under the badge's centre, painted bottom up onto one pixel, gives the
          // colour its text is read against.
          const rect = el.getBoundingClientRect();
          const under = document.elementsFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          const pixel = document.createElement("canvas").getContext("2d");
          const paint = (color) => {
            pixel.fillStyle = color;
            pixel.fillRect(0, 0, 1, 1);
            return [...pixel.getImageData(0, 0, 1, 1).data];
          };
          for (const node of [...under.toReversed(), el]) {
            paint(getComputedStyle(node).backgroundColor);
          }
          const ground = paint("transparent");
          const ink = paint(getComputedStyle(el).color);
          const [bright, deep] = [ink, ground]
            .map((rgba) => {
              const [r, g, b] = rgba.slice(0, 3).map((c) => {
                const s = c / 255;
                return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
              });
              return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            })
            .toSorted((a, b) => b - a);
          return Math.round(((bright + 0.05) / (deep + 0.05)) * 100) / 100;
        });
      };
      const onLight = await ratio("light");
      const onDark = await ratio("dark");
      const theme = await own.evaluate(() => document.documentElement.dataset.theme);
      return {
        ok: onLight >= 4.5 && onDark >= 4.5 && theme === "dark",
        detail: `OS light ${onLight}:1, OS dark ${onDark}:1, root ${theme}`,
      };
    },
  );

  await onOwnPage(
    "a refused address says why in text the field is described by and a screen reader hears",
    "/t/t-005?scenario=demo",
    {},
    async (own) => {
      const bar = own
        .locator('[role="tabpanel"]:not([inert])')
        .getByRole("region", { name: "Browser" })
        .locator("header");
      const field = bar.getByRole("textbox", { name: "Address" });
      await field.waitFor({ timeout: 15_000 });
      await field.fill("two words");
      await field.press("Enter");
      const said = () =>
        field.evaluate((el) => {
          const notes = (el.getAttribute("aria-describedby") ?? "")
            .split(" ")
            .filter((id) => id !== "")
            .map((id) => document.querySelector(`#${CSS.escape(id)}`))
            .filter((note) => note !== null);
          return {
            invalid: el.getAttribute("aria-invalid"),
            says: notes.map((note) => note.textContent.trim()).join(" "),
            seen: notes.some((note) => note.checkVisibility() === true && note.offsetWidth > 0),
            heard: notes.some((note) => note.closest('[role="alert"], [aria-live]') !== null),
            kept: el.value,
          };
        });
      const refused = await said();
      const strip = await bar.boundingBox();
      await own.screenshot({
        path: path.join(OUT, "address-refused.png"),
        clip: { ...strip, height: strip.height + 40 },
      });
      await field.press("End");
      await own.keyboard.type("s");
      const typing = await said();
      return {
        ok:
          refused.invalid === "true" &&
          refused.says !== "" &&
          refused.seen === true &&
          refused.heard === true &&
          refused.kept === "two words" &&
          typing.says === "",
        detail: `refused ${JSON.stringify(refused)}; typing again ${JSON.stringify(typing)}`,
      };
    },
  );

  await onOwnPage(
    "a long address on the simulated page wraps inside a narrow browser pane",
    "/t/t-005?scenario=demo",
    { viewport: { width: 1024, height: 768 } },
    async (own) => {
      const pane = own
        .locator('[role="tabpanel"]:not([inert])')
        .getByRole("region", { name: "Browser" });
      const field = pane.getByRole("textbox", { name: "Address" });
      await field.waitFor({ timeout: 15_000 });
      await own.getByRole("button", { name: "Toggle sidebar" }).click();
      await field.fill("https://example.com/some/really/long/path/that/goes/on/and/on/forever");
      await field.press("Enter");
      await pane.getByRole("heading", { name: "This page is simulated" }).waitFor();
      const fit = await pane.evaluate((region) => {
        const body = region.querySelector("article").parentElement;
        const text = [...region.querySelectorAll("article *")].map((el) =>
          Math.round(el.getBoundingClientRect().right),
        );
        return {
          scroll: body.scrollWidth,
          client: body.clientWidth,
          right: Math.max(...text),
          edge: Math.round(body.getBoundingClientRect().right),
        };
      });
      await own.screenshot({ path: path.join(OUT, "browser-long-address.png") });
      return {
        ok: fit.scroll <= fit.client && fit.right <= fit.edge,
        detail: JSON.stringify(fit),
      };
    },
  );

  // A second tab on the same device waits for the first rather than open the pool beside it,
  // which sqlite-wasm answers by trying to delete the pool; it says why, and opens the same
  // threads once the first tab closes.
  const tabs = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const firstTab = await tabs.newPage();
  const secondTab = await tabs.newPage();
  for (const tab of [firstTab, secondTab]) {
    tab.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
  }
  await firstTab.goto(`${BASE}/`, { waitUntil: "load" });
  await firstTab.locator(".thread-panel").first().waitFor({ timeout: 20_000 });
  // The Demo's scripted shows list beside the device's own mains; New thread adds one more.
  await firstTab.locator('[data-thread="main"][href="/t/playground"]').waitFor();
  const mainsBefore = await firstTab.locator('[data-thread="main"]').count();
  await firstTab.getByRole("button", { name: "New thread", exact: true }).click();
  await firstTab.waitForFunction(
    (count) => document.querySelectorAll('[data-thread="main"]').length === count,
    mainsBefore + 1,
  );
  const kept = await mainTitles(firstTab);
  await secondTab.goto(`${BASE}/`, { waitUntil: "load" });
  const heldNotice = secondTab.getByText("Your threads are open in another tab", { exact: true });
  const heldShown = await heldNotice
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  await secondTab.screenshot({ path: path.join(OUT, "device-held.png") });
  await firstTab.close();
  await secondTab
    .waitForFunction(
      (count) => document.querySelectorAll('[data-thread="main"]').length === count,
      kept.length,
      { timeout: 20_000 },
    )
    .catch(() => {});
  const handedOver = await mainTitles(secondTab);
  record(
    "a second tab says the threads are open in another tab, and opens them once it closes",
    heldShown === true && handedOver.join("|") === kept.join("|"),
    `held notice ${heldShown}; ${handedOver.join(", ")}`,
  );
  await tabs.close();

  // The lab's brand link keeps the scenario the lab was opened on, as every link the app builds
  // does, so a mock visit never drifts onto the device's threads (ADR-096).
  const mock = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await mock.goto(`${BASE}/lab?scenario=demo`, { waitUntil: "load" });
  await mock.getByText("Useful answers.").waitFor({ timeout: 10_000 });
  await mock.getByRole("link", { name: /Fieldnotes/ }).click();
  await mock.locator('[data-thread="main"]').first().waitFor({ timeout: 20_000 });
  const landed = new URL(mock.url());
  const demoProject = await mock
    .locator('[data-slot="sidebar"]')
    .getByText("Demo store", { exact: true })
    .count();
  record(
    "the lab's brand link keeps the scenario, so a mock visit stays on mock data",
    landed.searchParams.get("scenario") === "demo" && demoProject > 0,
    `${landed.pathname}${landed.search} · Demo store in the sidebar ${demoProject > 0}`,
  );
  await mock.close();

  await onOwnPage(
    "a tab closed under the pointer comes back at rest: no close and no cut title once inactive",
    "/t/t-001?scenario=demo",
    {},
    async (own) => {
      const reopened = "Service desk weekly review";
      const tab = tabsOf(own).filter({ hasText: reopened });
      const closer = own.getByRole("button", { name: `Close ${reopened}`, exact: true });
      await tab.waitFor({ timeout: 15_000 });
      // Closes the tab under the pointer, leaves the strip straight down so the pointer crosses
      // no other tab, opens the thread again from the sidebar, then goes back to the first tab
      // by keyboard, and reads the reopened tab.
      const cycle = async (close) => {
        await tab.hover();
        const at = await close(); // → the box the pointer closed it from
        await tab.waitFor({ state: "detached" });
        await own.mouse.move(at.x + at.width / 2, 600, { steps: 4 });
        await openRow(own, reopened);
        await tab.focus();
        await own.keyboard.press("ArrowLeft");
        await own.keyboard.press("Enter");
        await own.waitForURL(/\/t\/t-001\?/);
        const hovered = await tab.evaluate((el) => el.dataset.hovered !== undefined);
        const shown = await closer.evaluate((el) => getComputedStyle(el).opacity);
        return `hovered ${hovered}, close ${shown}`;
      };
      const byClose = await cycle(async () => {
        const from = await closer.boundingBox();
        await closer.click();
        return from;
      });
      const byMiddle = await cycle(async () => {
        const from = await tab.boundingBox();
        await tab.click({ button: "middle" });
        return from;
      });
      const rest = "hovered false, close 0";
      return {
        ok: byClose === rest && byMiddle === rest,
        detail: `after its close: ${byClose}; after a middle click: ${byMiddle}`,
      };
    },
  );

  await onOwnPage(
    "a thread opened from the Lab never draws over it, and a tab click still shows its tab at once",
    "/lab?scenario=demo",
    {},
    async (own) => {
      await own.getByText("Useful answers.").waitFor({ timeout: 15_000 });
      await own.evaluate(() => {
        window.painted = [];
        document.addEventListener(
          "pointerdown",
          () => {
            window.pressedAt = window.painted.length;
          },
          { capture: true },
        );
        requestAnimationFrame(function tick() {
          window.painted.push({
            lab: document.body.innerText.includes("Useful answers."),
            tab:
              document
                .querySelector('[role="tabpanel"]:not([inert])')
                ?.getAttribute("aria-label") ?? null,
          });
          requestAnimationFrame(tick);
        });
      });
      const sincePress = () => own.evaluate(() => window.painted.slice(window.pressedAt));
      await openRow(own, "Refund audit");
      await own.waitForTimeout(300);
      const fromLab = await sincePress();
      await tabsOf(own).filter({ hasText: "Last week's sales" }).click();
      await own.waitForTimeout(300);
      const fromTab = await sincePress();
      const overLab = fromLab.filter((paint) => paint.lab === true && paint.tab !== null).length;
      const tabAfter = fromTab.findIndex((paint) => paint.tab === "Last week's sales");
      return {
        ok:
          overLab === 0 && fromLab.at(-1)?.tab === "Refund audit" && tabAfter >= 0 && tabAfter <= 1,
        detail: `${overLab} frames drew the thread over the Lab; the tab clicked showed ${tabAfter} frames after the press`,
      };
    },
  );

  await onOwnPage(
    "each visit to a child brings its lane into view and flashes it once, panned away or closed",
    "/t/t-002?scenario=demo",
    {},
    async (own) => {
      const saturday = "Saturday leads at every level";
      const region = own
        .locator('[role="tabpanel"]:not([inert])')
        .getByRole("region", { name: "Compose canvas" });
      const saturdayLane = region.locator(`:scope > article[aria-label="${saturday}"]`);
      const saturdayRow = own
        .locator('[data-slot="sidebar"]')
        .getByRole("link", { name: saturday, exact: true });
      await saturdayLane.waitFor({ timeout: 15_000 });
      // The arrival's own flash ends before the count starts.
      await own.waitForTimeout(1500);
      await region.evaluate((row) => {
        window.flashes = 0;
        new MutationObserver((records) => {
          window.flashes += records.filter(
            (each) => each.target.dataset.flash !== undefined,
          ).length;
        }).observe(row, { subtree: true, attributeFilter: ["data-flash"] });
      });
      // Clicks the child's row, lets the lane slide in and its flash end, then reads whether the
      // lane sits whole in the canvas and how often a lane flashed since the last visit.
      const visit = async () => {
        await saturdayRow.click();
        await saturdayLane.waitFor({ timeout: 5_000 });
        await own.waitForTimeout(1500);
        return region.evaluate((row, name) => {
          const edges = row
            .querySelector(`:scope > article[aria-label="${name}"]`)
            .getBoundingClientRect();
          const pane = row.getBoundingClientRect();
          const inView = edges.left >= pane.left - 1 && edges.right <= pane.right + 1;
          const seen = `in view ${inView}, flashed ${window.flashes}`;
          window.flashes = 0;
          return seen;
        }, saturday);
      };
      await region.evaluate((row) => {
        row.scrollLeft = row.scrollWidth;
      });
      const pannedAway = await visit();
      await region.getByRole("button", { name: `Close ${saturday}`, exact: true }).click();
      await saturdayLane.waitFor({ state: "detached", timeout: 10_000 });
      const closed = await visit();
      const once = "in view true, flashed 1";
      return {
        ok: pannedAway === once && closed === once,
        detail: `after panning it away: ${pannedAway}; after closing it: ${closed}`,
      };
    },
  );

  await onOwnPage(
    "on a phone a lane's title bar does not lift it, the grip is not shown, and the row still scrolls sideways",
    "/t/t-001?scenario=demo",
    { viewport: { width: 390, height: 844 } },
    async (own) => {
      await chooseLayout(own, "Canvas");
      const region = own
        .locator('[role="tabpanel"]:not([inert])')
        .getByRole("region", { name: "Compose canvas" });
      await region.locator(":scope > article").nth(1).waitFor({ timeout: 15_000 });
      const header = region.locator(".thread-header").first();
      await header.scrollIntoViewIfNeeded();
      const headerBox = await header.boundingBox();
      await own.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
      await own.mouse.down();
      await own.mouse.move(headerBox.x + headerBox.width / 2 + 40, headerBox.y + 30, {
        steps: 6,
      });
      await own.waitForTimeout(150);
      const liftedNothing = await own.evaluate(
        () =>
          document.querySelector("[data-ghost]") === null &&
          document.documentElement.dataset.dragging === undefined,
      );
      await own.mouse.up();
      await header.hover();
      await own.waitForTimeout(250);
      const affordance = await header.evaluate((el) => ({
        cursor: getComputedStyle(el).cursor,
        dots: getComputedStyle(el, "::after").content,
      }));
      const noGrip = affordance.cursor !== "grab" && affordance.dots === "none";
      const noCardCarry = (await region.locator("[data-carry]").count()) === 0;
      const scroll = await region.evaluate((el) => ({
        before: el.scrollWidth > el.clientWidth,
        moved: ((el.scrollLeft = 40), el.scrollLeft),
      }));
      return {
        ok:
          liftedNothing === true &&
          noGrip &&
          noCardCarry &&
          scroll.before === true &&
          scroll.moved === 40,
        detail: `nothing lifted ${liftedNothing}; grip on hover: cursor ${affordance.cursor}, dots ${affordance.dots}; no data-carry in the canvas ${noCardCarry}; row scrollable ${scroll.before}, scrollLeft moved to ${scroll.moved}`,
      };
    },
  );

  // On a phone the workspace shows one pane at a time, the one the Layout switch names, across
  // the whole width; the others stay mounted but inert, so a draft or a reply survives a switch.
  await onOwnPage(
    "on a touch screen an open fold shows its arrow with no hover, a project's and a main's",
    "/t/t-001?scenario=demo",
    { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    async (own) => {
      const noHover = await own.evaluate(() => matchMedia("(hover: none)").matches);
      await own.getByRole("button", { name: "Toggle sidebar" }).first().tap();
      const side = own.locator('[data-slot="sidebar"]');
      const project = side.getByRole("button", { name: "Demo store", exact: true });
      const main = side.locator('[data-slot="thread-row"]').first();
      await main.waitFor({ timeout: 15_000 });
      await own.waitForTimeout(300);
      const [projectArrow, mainArrow] = await Promise.all(
        [project, main].map((row) =>
          row.locator('[data-slot="fold-chevron"]').evaluate((el) => getComputedStyle(el).opacity),
        ),
      ); // → string[]
      return {
        ok: noHover === true && projectArrow === "1" && mainArrow === "1",
        detail: `hover: none ${noHover}; project arrow ${projectArrow}, main arrow ${mainArrow}`,
      };
    },
  );

  await onOwnPage(
    "on a phone the Layout switch shows one pane at a time, across the whole width",
    "/t/t-001?scenario=demo",
    { viewport: { width: 390, height: 844 } },
    async (own) => {
      await own.locator('[role="tabpanel"]:not([inert]) [aria-label="Compose canvas"]').waitFor();
      const shares = () =>
        own.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const onTab = document.querySelector('[role="tabpanel"]:not([inert])');
          const share = (el) => {
            if (el === null || el.closest("[inert]") !== null) return 0;
            const rect = el.getBoundingClientRect();
            const seen = Math.min(rect.right, width) - Math.max(rect.left, 0);
            return Math.round((Math.max(seen, 0) / width) * 100);
          };
          return {
            thread: share(onTab.querySelector(".thread-panel")),
            browser: share(onTab.querySelector('[aria-label="Browser"]')),
            canvas: share(onTab.querySelector('[aria-label="Compose canvas"]')),
          };
        });
      const seen = {};
      for (const pane of ["Canvas", "Thread", "Browser"]) {
        await chooseLayout(own, pane);
        await own.waitForTimeout(400);
        seen[pane] = await shares();
      }
      await own.screenshot({ path: path.join(OUT, "phone-browser.png") });
      return {
        ok:
          paneAlone(seen.Canvas, "canvas") &&
          paneAlone(seen.Thread, "thread") &&
          paneAlone(seen.Browser, "browser"),
        detail: JSON.stringify(seen),
      };
    },
  );
} catch (error) {
  record("run", false, String(error));
  await shot("failure");
} finally {
  await browser.close();
}

record("no console errors", errors.length === 0, errors.join(" | ").slice(0, 300));
writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, errors }, null, 2));
console.log(`artifacts: ${OUT}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
