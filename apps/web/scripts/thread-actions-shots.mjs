// oxlint-disable no-await-in-loop -- pictures are taken one step at a time, in order
// The thread menu's pictures (ADR-126 to ADR-131), a desktop and a 390px phone.
// Each context first stages every mark the menu can leave: Refund audit archived, Last week's
// sales pinned, the service desk review snoozed and then made public for a day, so the rows,
// the title bar and the Share submenu all show them.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { openSharing } from "./share-checks.mjs";
import { menuButtonOf, openThread, pick } from "./thread-actions-checks.mjs";

const THEMES = ["light", "dark"];
const PHONE = { width: 390, height: 844 };
const SERVICE_DESK = "Service desk weekly review";
const PINNED = "Last week's sales";

// A fresh context on the demo, with the share server stood in and the clipboard open, once the
// sidebar's rows and the page's fonts are in.
async function openThemed(browser, theme) {
  const { context, page } = await openSharing(browser, { theme });
  await page.locator('[data-slot="sidebar"] [data-thread]').first().waitFor({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

// Waits out every toast, so a picture shows the window and not its last word.
const quiet = (page) =>
  page.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 20_000 });

// Waits for the open menus' own animations to end, so a menu is shot opaque, not mid-fade. The
// page's endless ones (the radar's sweep) are not the menus', so they are not waited on.
const still = (page) =>
  page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('[role="menu"]')]
        .flatMap((menu) => menu.getAnimations({ subtree: true }))
        .map((each) => each.finished),
    ),
  );

// Opens the shown thread's Share submenu.
async function openShare(page) {
  await menuButtonOf(page).click();
  await page.getByRole("menuitem", { name: /^Share thread/ }).hover();
  await page.getByRole("menuitem", { name: "1 hour" }).waitFor();
  await still(page);
}

// Archives, pins, snoozes (picturing the card on the way when `card` is given) and shares, the
// service desk review left on screen; returns its public link.
async function stage(page, card) {
  await openThread(page, "Refund audit");
  await pick(page, "Archive");
  await openThread(page, PINNED);
  await pick(page, "Pin thread");
  await openThread(page, SERVICE_DESK);
  await pick(page, "Snooze");
  const asked = page.locator('[role="tabpanel"]:not([inert])').getByRole("region", {
    name: "Snooze",
  });
  await asked.waitFor();
  if (card !== undefined) await page.screenshot({ path: card });
  await asked.getByRole("radio", { name: /Tomorrow/ }).click();
  await asked.getByRole("button", { name: "Submit" }).click();
  await asked.waitFor({ state: "detached" });
  await openShare(page);
  await page.getByRole("menuitem", { name: "1 day" }).click();
  await page.getByText(/^Public until .* Link copied\.$/).waitFor();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  await quiet(page);
  return link;
}

// The desktop: the snooze card, the window with every mark, the pinned thread's title bar, the
// menu, the Share submenu while public, and the public page a reader opens.
async function desktop(browser, theme, file) {
  const { context, page } = await openThemed(browser, theme);
  const link = await stage(page, file(`desktop-snooze-card-${theme}`));
  await page.screenshot({ path: file(`desktop-${theme}`) });
  await openShare(page);
  await page.screenshot({ path: file(`desktop-share-${theme}`) });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await openThread(page, PINNED);
  await quiet(page);
  await page
    .locator('[data-slot="title-bar"]')
    .screenshot({ path: file(`desktop-tabbar-${theme}`) });
  await menuButtonOf(page).click();
  await page.getByRole("menu").waitFor();
  await still(page);
  await page.screenshot({ path: file(`desktop-menu-${theme}`) });
  await page.keyboard.press("Escape");

  const reader = await context.newPage();
  await reader.goto(link);
  await reader.getByText(/^Shared from Kay until/).waitFor();
  await reader.evaluate(() => document.fonts.ready);
  await reader.screenshot({ path: file(`shared-page-${theme}`) });
  await context.close();
}

// The phone: its bar with the one "⋯", that menu open, and its sidebar with the marks.
async function phone(browser, theme, file) {
  const { context, page } = await openThemed(browser, theme);
  await stage(page);
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file(`phone-${theme}`) });
  await page
    .locator('header[data-slot="title-bar"]')
    .getByRole("button", { name: "Thread actions" })
    .click();
  await page.getByRole("menu").waitFor();
  await still(page);
  await page.screenshot({ path: file(`phone-menu-${theme}`) });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: file(`phone-sidebar-${theme}`) });
  await context.close();
}

/** Saves the thread menu's pictures into `dir`, desktop and phone. */
export async function shots(browser, dir) {
  mkdirSync(dir, { recursive: true });
  const file = (name) => path.join(dir, `${name}.png`);
  for (const theme of THEMES) {
    await desktop(browser, theme, file);
    await phone(browser, theme, file);
  }
}
