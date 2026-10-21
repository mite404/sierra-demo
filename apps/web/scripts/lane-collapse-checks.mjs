// Checks for collapsible lanes (ADR-133): the strip's look in both themes, the drag by any part
// of it, the state kept across a reload, and the keyboard and screen reader's way in.
import { canvasOf, laneTitles, makeLane } from "./canvas-checks.mjs";
import {
  dragStrip,
  laneNamed,
  LONG_TITLE,
  near,
  NO_INK,
  openThemed,
  pad,
  STRIP_PX,
  stripLook,
  toggleClearance,
} from "./lane-collapse-look.mjs";
import { luminance, shotPath } from "./lever.mjs";

// The collapse's fill, in the title bar and in the strip alike (lane.tsx `CollapseToggle`).
const TOGGLE_PX = 20;

// One theme's strip: a long-titled lane collapsed, measured at rest with the pointer away.
async function stripIn(browser, theme) {
  const { page, close } = await openThemed(browser, theme);
  await makeLane(page, LONG_TITLE);
  const lane = laneNamed(page, LONG_TITLE);
  // Open, the toggle sits in the thread's own title bar, before its title.
  const inHeader = await lane.locator(".thread-header [data-lane-toggle]").count();
  const barToggle = await lane.locator(".thread-header [data-lane-toggle]").boundingBox();
  await lane.getByRole("button", { name: "Collapse lane" }).click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  const look = await stripLook(lane);
  const clear = await toggleClearance(lane);
  const gripInk = look.gripBox === null ? NO_INK : await luminance(page, pad(look.gripBox));
  const titleInk =
    look.titleBox === null
      ? NO_INK
      : await luminance(page, { ...look.titleBox, height: Math.min(look.titleBox.height, 120) });
  await lane.screenshot({ path: shotPath(`P14-strip-${theme}`) });
  await page.screenshot({ path: shotPath(`P14-canvas-${theme}`) });
  await close();
  // Ink against the strip: dark marks on light paper, light marks on dark paper.
  const marked = (ink) => (theme === "light" ? ink.mean - ink.min >= 60 : ink.max - ink.mean >= 60);
  const ok =
    near(look.width, STRIP_PX) &&
    near(look.stripWidth, STRIP_PX) &&
    near(look.stripTop, 0) &&
    look.stripBottom <= 1 &&
    look.text === LONG_TITLE &&
    look.writing === "vertical-rl" &&
    look.overflow === "ellipsis" &&
    look.clipped &&
    look.tall &&
    look.gripOpacity === "1" &&
    marked(gripInk) &&
    marked(titleInk) &&
    !look.contentShown &&
    // The expand at the strip's head and the lane's close at its foot (db80f60).
    JSON.stringify(look.buttons) === JSON.stringify(["Expand lane", `Close ${LONG_TITLE}`]) &&
    look.toggleInStrip &&
    inHeader === 1 &&
    near(barToggle.width, TOGGLE_PX) &&
    near(clear.size, TOGGLE_PX) &&
    clear.fill >= 5 &&
    clear.ring >= 3;
  return {
    ok,
    note: `${theme}: lane ${Math.round(look.width)}px, strip ${Math.round(look.stripWidth)}px from ${Math.round(look.stripTop)}px to ${Math.round(look.stripBottom)}px off the foot; title ${look.writing} ${look.overflow} clipped ${look.clipped}; grip opacity ${look.gripOpacity} ink ${JSON.stringify(gripInk)}; title ink ${JSON.stringify(titleInk)}; content shown ${look.contentShown}; buttons ${look.buttons.join("|")}; toggle in the header ${inHeader === 1} at ${barToggle.width}px, in the strip ${look.toggleInStrip} at ${clear.size}px, its hover fill ${clear.fill.toFixed(1)}px and focus ring ${clear.ring.toFixed(1)}px from the strip's edge`,
  };
}

/** Collapsible lanes (P14 to P18). */
export const laneCollapseChecks = {
  async P14(browser) {
    const results = await Promise.all(["light", "dark"].map((theme) => stripIn(browser, theme)));
    return {
      ok: results.every((each) => each.ok),
      detail: results.map((each) => each.note).join("; "),
    };
  },

  async P15(browser) {
    const { page, close } = await openThemed(browser);
    await makeLane(page, "First");
    await makeLane(page, "Second");
    await canvasOf(page).evaluate((el) => (el.scrollLeft = 0));
    const card = laneNamed(page, "First");
    await card.getByRole("button", { name: "Collapse lane" }).click();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    const strip = await card.boundingBox();
    const second = await laneNamed(page, "Second").boundingBox();
    const before = await laneTitles(page);
    // A press on the title, the part that renames in an open lane, still takes the strip.
    const title = await card.locator("[data-lane-strip-title]").boundingBox();
    const during = await dragStrip(
      page,
      { x: title.x + title.width / 2, y: title.y + 40 },
      { x: second.x + second.width - 20, y: strip.y + strip.height / 2 },
    );
    const moved = await laneTitles(page);
    // And a press low on the strip, where there is nothing but the strip itself.
    const low = await card.boundingBox();
    const first = await laneNamed(page, "Second").boundingBox();
    await dragStrip(
      page,
      { x: low.x + low.width / 2, y: low.y + low.height - 30 },
      { x: first.x + 20, y: low.y + low.height / 2 },
    );
    const back = await laneTitles(page);
    // The expand button keeps its job: a click opens the lane and moves nothing.
    await card.getByRole("button", { name: "Expand lane" }).click();
    await page.waitForTimeout(300);
    const expanded = await card.getByRole("button", { name: "Collapse lane" }).count();
    const afterClick = await laneTitles(page);
    await close();
    const ok =
      during.dragging === "lane" &&
      during.lifted === "First" &&
      near(during.ghostWidth, STRIP_PX) &&
      during.ghostShadow.includes("drop-shadow") &&
      during.ghostGrip > 0 &&
      JSON.stringify(moved) === JSON.stringify(before.toReversed()) &&
      JSON.stringify(back) === JSON.stringify(before) &&
      expanded === 1 &&
      JSON.stringify(afterClick) === JSON.stringify(before);
    return {
      ok,
      detail: `while carried: ${JSON.stringify(during)}; by the title ${before.join(" | ")} → ${moved.join(" | ")}; by the foot → ${back.join(" | ")}; expand click opens ${expanded === 1}, order ${afterClick.join(" | ")}`,
    };
  },

  async P16(browser) {
    const { page, close } = await openThemed(browser);
    await makeLane(page, "Folded too");
    await makeLane(page, "Kept narrow");
    const lane = laneNamed(page, "Kept narrow");
    const gap = canvasOf(page).getByRole("separator", { name: "Resize or move Kept narrow" });
    await gap.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    const open = Math.round((await lane.boundingBox()).width);
    await lane.getByRole("button", { name: "Collapse lane" }).click();
    await laneNamed(page, "Folded too").getByRole("button", { name: "Collapse lane" }).click();
    await page.waitForTimeout(300);
    const collapsed = () => canvasOf(page).getByRole("button", { name: "Expand lane" }).count();
    const before = await collapsed();
    await page.reload({ waitUntil: "load" });
    await lane.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const after = await collapsed();
    const stripWidth = Math.round((await lane.boundingBox()).width);
    await lane.getByRole("button", { name: "Expand lane" }).click();
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "load" });
    await lane.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const reopened = Math.round((await lane.boundingBox()).width);
    const stillCollapsed = await collapsed();
    await close();
    return {
      ok:
        before === 2 &&
        after === 2 &&
        near(stripWidth, STRIP_PX) &&
        reopened === open &&
        stillCollapsed === 1,
      detail: `collapsed ${before} → ${after} after a reload, strip ${stripWidth}px; expanded and reloaded at ${reopened}px (was ${open}px) with ${stillCollapsed} still collapsed`,
    };
  },

  async P17(browser) {
    const { page, close } = await openThemed(browser);
    await makeLane(page, "Before it");
    await makeLane(page, "By keyboard");
    const lane = laneNamed(page, "By keyboard");
    const focusedName = () =>
      page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    await lane.getByRole("button", { name: "Collapse lane" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const afterEnter = await focusedName();
    /** @type {string} */
    const tree = await lane.ariaSnapshot();
    const gap = canvasOf(page).getByRole("separator", { name: "Move By keyboard" });
    const gapShown = await gap.count();
    const titles = await laneTitles(page);
    await gap.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await page.waitForTimeout(400);
    const moved = await laneTitles(page);
    const widthAfterArrow = Math.round((await lane.boundingBox()).width);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    const stripAfterArrow = Math.round((await lane.boundingBox()).width);
    await lane.getByRole("button", { name: "Expand lane" }).focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    const afterSpace = await focusedName();
    await close();
    const ok =
      afterEnter === "Expand lane" &&
      tree.includes('article "By keyboard"') &&
      tree.includes('button "Expand lane"') &&
      tree.includes("By keyboard") &&
      gapShown === 1 &&
      moved.indexOf("By keyboard") === titles.indexOf("By keyboard") - 1 &&
      near(widthAfterArrow, STRIP_PX) &&
      near(stripAfterArrow, STRIP_PX) &&
      afterSpace === "Collapse lane";
    return {
      ok,
      detail: `focus after Enter "${afterEnter}", after Space "${afterSpace}"; tree ${JSON.stringify(tree.replaceAll(/\s+/g, " ").slice(0, 120))}; gap named "Move By keyboard" ${gapShown === 1}; Shift+ArrowLeft ${titles.join(" | ")} → ${moved.join(" | ")}; ArrowRight leaves the strip ${stripAfterArrow}px`,
    };
  },
  async P18(browser) {
    const { page, close } = await openThemed(browser);
    await makeLane(page, "One");
    await makeLane(page, "Two");
    const bar = page.locator('header[data-slot="title-bar"]');
    const inBar = (name) => bar.getByRole("button", { name, exact: true });
    const strips = () => canvasOf(page).getByRole("button", { name: "Expand lane" }).count();
    await laneNamed(page, "One").getByRole("button", { name: "Collapse lane" }).click();
    await page.waitForTimeout(300);
    const one = await strips();
    // One lane still open: the bar offers to collapse the rest.
    await inBar("Collapse all lanes").click();
    await page.waitForTimeout(300);
    const all = await strips();
    const offersExpand = await inBar("Expand all lanes").count();
    await bar.screenshot({ path: shotPath("P18-bar-all-collapsed") });
    await page.screenshot({ path: shotPath("P18-all-collapsed") });
    await page.reload({ waitUntil: "load" });
    await laneNamed(page, "Two").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const kept = await strips();
    await inBar("Expand all lanes").click();
    await page.waitForTimeout(300);
    const none = await strips();
    const offersCollapse = await inBar("Collapse all lanes").count();
    // Beside the thread alone the canvas is off screen, and the bar's button waits for it.
    await page
      .getByRole("group", { name: "Layout" })
      .getByRole("button", { name: "Thread", exact: true })
      .click();
    await page.waitForTimeout(300);
    const offScreen = await inBar("Collapse all lanes").isDisabled();
    await close();
    return {
      ok:
        one === 1 &&
        all === 2 &&
        offersExpand === 1 &&
        kept === 2 &&
        none === 0 &&
        offersCollapse === 1 &&
        offScreen,
      detail: `collapsed ${one} → ${all} by the bar, then offered Expand all ${offersExpand === 1}; ${kept} after a reload; ${none} after Expand all; disabled with the canvas off screen ${offScreen}`,
    };
  },
};
