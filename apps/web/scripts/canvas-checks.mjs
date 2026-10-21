// Checks for the lane title bar, the rename field, the carry and the Disclosure primitive.
import { BASE, luminance, openApp, shotPath, STORYBOOK } from "./lever.mjs";

const LONG_TITLE = "Here's last week's profit by day, net of refunds";

// What is on screen: the active tab's workspace once the deck exists, else the whole page.
export const onScreen = (page) =>
  page.locator(':is([role="tabpanel"]:not([inert]), body:not(:has([role="tabpanel"])))');
export const canvasOf = (page) => onScreen(page).getByRole("region", { name: "Compose canvas" });
export const mainPanel = (page) => onScreen(page).locator(".thread-panel").first();

// Selects the first `length` characters of the main thread's first agent turn, once it has
// drawn: the thread panel can be on screen before its turns, as on a cold dev server.
export async function selectReply(page, length) {
  await page.locator(".turn-agent p").first().waitFor({ timeout: 20_000 });
  return page.evaluate((count) => {
    const paragraph =
      document.querySelector('[role="tabpanel"]:not([inert]) .turn-agent p') ??
      document.querySelector(".turn-agent p");
    const text = paragraph.firstChild;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, count);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const box = range.getClientRects()[0];
    return { x: box.left + 12, y: box.top + box.height / 2, text: range.toString() };
  }, length);
}

// Carries whatever is under (x, y) to (toX, toY) with the mouse, sampling the page on the way.
export async function carry(page, from, to, sample) {
  const samples = [];
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 8, { steps: 3 });
  for (const [i, point] of to.entries()) {
    await page.mouse.move(point.x, point.y, { steps: 8 });
    await page.waitForTimeout(120);
    if (sample) samples.push({ at: i, ...(await sample(point)) });
  }
  return samples;
}

// What the page shows under the pointer while something is carried.
export function underPointer(page) {
  return (point) =>
    page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        cursor: el ? getComputedStyle(el).cursor : "none",
        dragging: document.documentElement.dataset.dragging ?? "",
      };
    }, point);
}

// The canvas's own look, which a drop state has to change where the eye is: the whole pane, not
// the open space at the far end of the row.
function canvasLook(page) {
  return canvasOf(page).evaluate((el) => {
    const style = getComputedStyle(el);
    const veil = getComputedStyle(el, "::after");
    return [
      style.backgroundColor,
      style.backgroundImage,
      style.boxShadow,
      style.outlineStyle,
      veil.content === "none" ? "" : `${veil.opacity} ${veil.backgroundColor} ${veil.boxShadow}`,
    ].join(" | ");
  });
}

export function laneCount(page) {
  return canvasOf(page).locator(":scope > article").count();
}

export function laneTitles(page) {
  return canvasOf(page)
    .locator(":scope > article")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
}

// Drops `text` on the canvas the way another window's drag would arrive.
function dropText(page, text) {
  return canvasOf(page).evaluate((el, dropped) => {
    const data = new DataTransfer();
    data.setData("text/plain", dropped);
    for (const type of ["dragover", "drop"])
      el.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }),
      );
  }, text);
}

// A lane titled `title`: a blank thread renamed in place, or a dropped line of text where a
// blank thread has no title to click.
export async function makeLane(page, title) {
  const before = await laneCount(page);
  await canvasOf(page).getByRole("button", { name: "Create blank thread" }).click();
  const lane = canvasOf(page).locator(":scope > article").nth(before);
  await lane.locator(".thread-panel").waitFor({ timeout: 10_000 });
  const named = await lane.locator(".thread-title").evaluate((el) => el.offsetWidth > 0);
  if (!named) {
    await canvasOf(page)
      .getByRole("button", { name: /^Close/ })
      .nth(before)
      .click();
    await dropText(page, title);
    await canvasOf(page).locator(":scope > article").nth(before).locator(".thread-panel").waitFor();
    return canvasOf(page).locator(":scope > article").nth(before);
  }
  await lane.locator(".thread-title").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  return lane;
}

// Puts the canvas beside the open thread by the layout switch: a thread opens alone until it
// asks for one, and the tab keeps the choice across a reload.
async function showCanvas(page) {
  const layout = page.getByRole("group", { name: "Layout" });
  await layout
    .getByRole("radio", { name: "Canvas" })
    .or(layout.getByRole("button", { name: "Canvas" }))
    .first()
    .click();
  await canvasOf(page).waitFor();
  return page;
}

/**
 * The app with its canvas on screen: Home opens the Live Playground's blank main thread
 * (ADR-159), shown here beside its canvas.
 */
export async function openCanvas(browser, { theme } = {}) {
  const { page } = await openApp(browser, undefined, { theme });
  return showCanvas(page);
}

/**
 * "Last week's sales" as every device held it before the Live Playground, on a device the dev
 * build seeds, so it survives a reload: the profit card in its thread and the canvas beside it
 * with no lanes.
 */
export async function openProfit(browser) {
  const { page } = await openApp(browser, `${BASE}/t/profit`, { seed: "demo-store" });
  return showCanvas(page);
}

// Counts native drags, which hand the cursor to the browser.
async function countNativeDrags(page) {
  await page.evaluate(() => {
    window.nativeDragCount = 0;
    document.addEventListener("dragstart", () => (window.nativeDragCount += 1), true);
  });
  return () => page.evaluate(() => window.nativeDragCount);
}

/** The lane title bar, the rename field, the carry and the Disclosure (P1 to P3h, P8). */
export const canvasChecks = {
  async P1(browser) {
    const page = await openCanvas(browser);
    const lane = await makeLane(page, LONG_TITLE);
    const header = lane.locator(".thread-header");
    const title = lane.locator(".thread-title");
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    const rest = await title.evaluate((el) => {
      const bar = el.closest(".thread-header");
      const barBox = bar.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const clip = el.closest("h2");
      const gripX = barBox.left + bar.clientLeft + bar.clientWidth / 2;
      return {
        whole: el.textContent,
        shown: clip.scrollWidth <= clip.clientWidth + 1,
        pastMiddle: box.right > gripX + 20,
        gripX,
        textY: box.top + box.height / 2,
      };
    });
    const beside = (dx) => ({ x: rest.gripX + dx, y: rest.textY - 6, width: 6, height: 12 });
    const ink = async () => {
      const [left, right] = [await luminance(page, beside(-15)), await luminance(page, beside(9))];
      return { min: Math.min(left.min, right.min) };
    };
    const restInk = await ink();
    // The dots wake only within the grip's circle, never at the bar's edge (Ethan).
    const bar = await header.boundingBox();
    await page.mouse.move(bar.x + bar.width - 30, bar.y + bar.height / 2);
    await page.waitForTimeout(350);
    const atEdge = await header.evaluate((el) => getComputedStyle(el, "::after").opacity);
    await page.mouse.move(bar.x + bar.width / 2 + 10, bar.y + bar.height / 2);
    await page.waitForTimeout(350);
    const hoverInk = await ink();
    const grip = await header.evaluate((el) => getComputedStyle(el, "::after").opacity);
    await header.screenshot({ path: shotPath("P1-bar-hover") });
    await title.hover({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(350);
    const overTitle = await header.evaluate((el) => getComputedStyle(el, "::after").opacity);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(350);
    await header.screenshot({ path: shotPath("P1-bar-rest") });
    const ok =
      rest.whole === LONG_TITLE &&
      rest.shown &&
      rest.pastMiddle &&
      restInk.min < 140 &&
      hoverInk.min - restInk.min >= 60 &&
      grip === "1" &&
      atEdge === "0" &&
      overTitle === "0";
    return {
      ok,
      detail: `whole title shown ${rest.shown}, runs past the middle ${rest.pastMiddle}; ink beside the grip ${restInk.min} at rest, ${hoverInk.min} on hover; grip ${grip} by the grip, ${atEdge} at the edge, ${overTitle} over the title`,
    };
  },

  async P2(browser) {
    const page = await openCanvas(browser);
    const lane = await makeLane(page, LONG_TITLE);
    // At its start: a long title runs under the grip's veil mid-bar, which takes the press.
    await lane.locator(".thread-title").click({ position: { x: 8, y: 8 } });
    const field = lane.locator(".thread-rename");
    await field.waitFor();
    const look = await field.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        rule: style.borderBottomWidth,
        decoration: style.textDecorationLine,
        focused: document.activeElement === el,
      };
    });
    await lane.locator(".thread-header").screenshot({ path: shotPath("P2-editing") });
    await page.keyboard.press("Escape");
    return {
      ok: look.rule === "0px" && look.decoration === "none" && look.focused,
      detail: `rule ${look.rule}, decoration ${look.decoration}, focused ${look.focused}`,
    };
  },

  async P3(browser) {
    const page = await openProfit(browser);
    await makeLane(page, "First lane");
    await makeLane(page, "Second lane");
    await canvasOf(page).evaluate((el) => (el.scrollLeft = 0));
    const nativeDrags = await countNativeDrags(page);
    const rest = await canvasLook(page);
    const heading = mainPanel(page).locator(".card-heading").first();
    await heading.scrollIntoViewIfNeeded();
    const hb = await heading.boundingBox();
    const lanes = canvasOf(page).locator(":scope > article");
    const first = await lanes.nth(0).boundingBox();
    const gap = { x: first.x + first.width + 8, y: first.y + first.height / 2 };
    const overLane = { x: first.x + first.width / 2, y: first.y + first.height / 2 };
    const inThread = { x: hb.x + 80, y: hb.y + 140 };
    const samples = await carry(
      page,
      { x: hb.x + 30, y: hb.y + hb.height / 2 },
      [inThread, overLane, gap],
      async (point) => ({ ...(await underPointer(page)(point)), look: await canvasLook(page) }),
    );
    await page.screenshot({ path: shotPath("P3-carry-over-gap") });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const titles = await laneTitles(page);
    const grabbing = samples.every((s) => s.cursor === "grabbing");
    const lit = samples.slice(1).every((s) => s.look !== rest);
    const landed = titles.length === 3 && titles[1] === "Last week's profit by day";
    const drags = await nativeDrags();

    const escapeFrom = await heading.boundingBox();
    await carry(page, { x: escapeFrom.x + 30, y: escapeFrom.y + escapeFrom.height / 2 }, [
      overLane,
    ]);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const afterEscape = await canvasLook(page);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const escaped = (await laneCount(page)) === 3 && afterEscape === rest;
    return {
      ok: drags === 0 && grabbing && lit && landed && escaped,
      detail: `native drags ${drags}; cursors ${samples.map((s) => s.cursor).join("/")}; canvas lit ${lit}; lanes ${titles.map((t) => t?.slice(0, 14)).join(" | ")}; Escape cancels ${escaped}`,
    };
  },

  async P3h(browser) {
    const page = await openProfit(browser);
    const nativeDrags = await countNativeDrags(page);
    const picked = await selectReply(page, 33);
    const open = canvasOf(page).getByRole("button", { name: "Create blank thread" });
    const target = await open.boundingBox();
    const samples = await carry(
      page,
      picked,
      [{ x: target.x + target.width / 2, y: target.y - 60 }],
      underPointer(page),
    );
    await page.mouse.up();
    await page.waitForTimeout(800);
    const lane = canvasOf(page).locator(":scope > article").first();
    const draft = (await lane.count()) ? await lane.locator("textarea").inputValue() : "";
    const drags = await nativeDrags();
    return {
      ok:
        drags === 0 &&
        samples.every((s) => s.cursor === "grabbing") &&
        draft.startsWith(`> ${picked.text}`),
      detail: `native drags ${drags}; cursor ${samples.map((s) => s.cursor).join("/")}; draft ${JSON.stringify(draft.slice(0, 40))}`,
    };
  },

  async P8(browser) {
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
    await page.goto(`${STORYBOOK}/iframe.html?id=foundations-disclosure--open&viewMode=story`);
    const header = page.locator(".disclosure-header");
    await header.waitFor({ timeout: 20_000 });
    const inset = await header.evaluate((el) => {
      const card = el.closest(".disclosure").parentElement.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        left: Math.round(box.left - card.left - 1),
        right: Math.round(card.right - 1 - box.right),
      };
    });
    await header.hover();
    await page.waitForTimeout(200);
    await page.locator(".disclosure").screenshot({ path: shotPath("P8-disclosure-hover") });
    return {
      ok: inset.left === 4 && inset.right === 4,
      detail: `hover fill inset ${inset.left}px left, ${inset.right}px right`,
    };
  },
};
