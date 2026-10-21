// Checks for sub-threads, the project rows, persistence, the mock scenarios, the tabs, the
// simulated browser, the title bar and the rail.
import { writeFileSync } from "node:fs";
import { canvasOf, carry, laneTitles, mainPanel, makeLane, openProfit } from "./canvas-checks.mjs";
import { BASE, openApp, shotPath, sidebarDrawn } from "./lever.mjs";
import { railOf, RAIL_PLACES, readPlaces } from "./rail-places.mjs";

// Kay's mark, the bonsai (ADR-094, amended): three pills of the working glyph on a 12-unit grid,
// as x, y, width, height and corner radius.
const BONSAI_PILLS = "2 1 7 3 1.5|5 5 7 3 1.5|0 9 12 3 1.5";
const SCENARIOS = ["demo", "long", "empty", "loading", "failure", "thread-fails"];

const sidebarOf = (page) => page.locator('[data-slot="sidebar"]');
const titleBar = (page) => page.locator('header[data-slot="title-bar"]');
const tabsOf = (page) => page.getByRole("tablist", { name: "Open threads" }).getByRole("tab");
const layoutButton = (page, name) =>
  page.getByRole("group", { name: "Layout" }).getByRole("button", { name, exact: true });
const pathOf = (page) => new URL(page.url()).pathname;

// Two edges that meet, give or take a pixel of rounding.
const near = (a, b) => Math.abs(a - b) <= 1;

// The box of a locator, or null when it is not on screen.
const boxOf = (locator) => locator.boundingBox().catch(() => null);

// The widths below the window's frame (ADR-111) where the bar must still fit (ADR-116).
const NARROW = [390, 520, 767];
// About ten characters of the project's name at 14px.
const LEGIBLE_PX = 64;
// The phone bar's two rows (ADR-116): 44px of controls, then the views' 32px and a 6px foot.
const PHONE_BAR = 82;

// Runs in the page: the top row's controls left to right, whether any two overlap, leave the bar
// or fall out of the top row, how much of the project's name shows, and the views below it.
function barLayout() {
  const bar = document.querySelector('header[data-slot="title-bar"]');
  const edge = bar.getBoundingClientRect();
  const drawn = (selector) =>
    [...bar.querySelectorAll(selector)].find((el) => el.getClientRects().length > 0);
  const controls = [
    ["toggle", drawn('[aria-label="Toggle sidebar"]')],
    ["project", drawn('[data-slot="project-name"]')],
    ["lanes", drawn('[data-slot="collapse-all"]')],
    ["bell", drawn('[aria-label^="Notifications"]')],
    ["account", drawn('[aria-label="Account"]')],
    ["more", drawn('[aria-label="Thread actions"]')],
  ]
    .filter(([, el]) => el !== undefined && el !== null)
    .map(([name, el]) => [name, el.getBoundingClientRect()]);
  const overlaps = controls
    .slice(1)
    .filter(([, box], i) => box.x < controls[i][1].right - 0.5)
    .map(([name], i) => `${controls[i][0]}>${name}`);
  const outside = controls
    .filter(
      ([, box]) =>
        box.x < edge.x - 0.5 || box.right > edge.right + 0.5 || box.bottom > edge.y + 44.5,
    )
    .map(([name]) => name);
  const name = bar.querySelector('[data-slot="project-name"]');
  const views = [...bar.querySelectorAll('[role="group"][aria-label="Layout"] button')];
  const below = views.every((view) => {
    const box = view.getBoundingClientRect();
    return box.y >= edge.y + 44 - 0.5 && box.x >= edge.x && box.right <= edge.right + 0.5;
  });
  return {
    height: Math.round(edge.height),
    scroll: [bar.scrollWidth, bar.clientWidth],
    page: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    names: controls.map(([each]) => each),
    overlaps,
    outside,
    namePx: Math.round(name.getBoundingClientRect().width),
    nameFull: name.scrollWidth,
    views: views.map((view) => view.textContent.trim()),
    below,
  };
}

// One width in one theme: the bar's two rows, their picture, and a tap on the Canvas view.
async function narrowBar(browser, { theme, width }) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
    colorScheme: theme,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/?scenario=demo`, { waitUntil: "load" });
  await page.locator('[data-slot="project-name"]').filter({ hasText: /\S/ }).waitFor({
    timeout: 20_000,
  });
  await page.evaluate(() => document.fonts.ready);
  const m = await page.evaluate(barLayout);
  const fits =
    m.height === PHONE_BAR &&
    m.scroll[0] === m.scroll[1] &&
    m.page[0] === m.page[1] &&
    m.names.join("|") === "toggle|project|lanes|bell|more" &&
    m.overlaps.length === 0 &&
    m.outside.length === 0 &&
    m.namePx >= Math.min(m.nameFull, LEGIBLE_PX) &&
    m.views.join("|") === "Thread|Canvas|Browser" &&
    m.below;
  await titleBar(page).screenshot({ path: shotPath(`P13-bar-${width}-${theme}`) });
  await layoutButton(page, "Canvas").click();
  await page
    .locator('[role="tabpanel"]:not([inert]) [aria-label="Compose canvas"]')
    .waitFor({ timeout: 10_000 });
  const pressed = await layoutButton(page, "Canvas").getAttribute("aria-pressed");
  await context.close();
  return {
    ok: fits && pressed === "true",
    note: `${theme} ${width}: ${m.height}px; bar ${m.scroll.join("/")}; page ${m.page.join("/")}; top row [${m.names}]; overlaps [${m.overlaps}]; outside [${m.outside}]; name ${m.namePx}/${m.nameFull}px; views ${m.views.join("|")} below ${m.below}; canvas pressed ${pressed}`,
  };
}

async function onThreadPage(browser) {
  const opened = await openApp(browser);
  await opened.page.waitForURL(/\/t\//, { timeout: 20_000 });
  return opened;
}

// A thread's tab, by the thread's id.
const tabOf = (page, id) =>
  page.getByRole("tablist", { name: "Open threads" }).locator(`[role="tab"]#tab-${id}`);

function selectedTabId(page) {
  return page
    .getByRole("tablist", { name: "Open threads" })
    .getByRole("tab", { selected: true })
    .getAttribute("id")
    .catch(() => "");
}

function selectedTab(page) {
  return page
    .getByRole("tablist", { name: "Open threads" })
    .getByRole("tab", { selected: true })
    .innerText()
    .catch(() => "");
}

async function scenarioLook(browser, name) {
  const { page } = await openApp(browser, `${BASE}/?scenario=${name}`, { ready: null });
  await sidebarDrawn(page).catch(async (error) => {
    // Which scenario never drew its sidebar, and what the page held instead, so a timeout under
    // load says where it stalled.
    const held = await page.evaluate(() => document.body.innerText.slice(0, 160));
    throw new Error(`${name}: sidebar not drawn (${String(error).split("\n")[0]}); page: ${held}`);
  });
  await page.waitForTimeout(1500);
  const png = await page.screenshot();
  const look = {
    projects: await sidebarOf(page).locator("[aria-expanded]").count(),
    tabs: await tabsOf(page).count(),
    skeletons: await page.locator('[data-sidebar="menu-skeleton"]').count(),
    tryAgain: await page.getByRole("button", { name: "Try again" }).count(),
    noProjects: await page.getByText("No projects yet").count(),
    url: page.url(),
  };
  await page.close();
  return { png, look };
}

// What each scenario must show besides being mock and deterministic.
const EXPECT = {
  demo: (l) => l.projects >= 2 && l.tabs === 2,
  long: (l) => l.projects >= 12 && l.tabs >= 12,
  empty: (l) => l.noProjects === 1 && l.tabs === 0,
  loading: (l) => l.skeletons >= 3 && l.tabs <= 1,
  failure: (l) => l.tryAgain >= 1,
  "thread-fails": (l) => l.projects >= 1 && l.tryAgain >= 1,
};

export const shellChecks = {
  async P4(browser) {
    const page = await openProfit(browser);
    const home = pathOf(page);
    const side = sidebarOf(page);
    await side.getByRole("button", { name: "Demo store", exact: true }).waitFor();
    // The Demo's scripted shows list their children above, so rows are read under Demo store.
    const project = side
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: "Demo store", exact: true }) });
    const children = project.locator('[data-thread="child"]');
    const before = await children.count();
    await canvasOf(page).getByRole("button", { name: "Create blank thread" }).click();
    // The new child, which the sidebar lists first, newest created first (ADR-125).
    await children.nth(before).waitFor({ timeout: 10_000 });
    const child = children.first();
    const childText = await child.innerText();
    const branch = await child.locator('[data-slot="child-icon"] svg').count();
    await child.click();
    await page.waitForURL((url) => url.pathname !== home, { timeout: 10_000 });
    const childPath = pathOf(page);
    const mainTitle = await mainPanel(page).getAttribute("aria-label");
    const lane = canvasOf(page).locator(':scope > article[aria-label="New thread"]');
    const laneShown = await lane.isVisible();
    await side.getByRole("link", { name: "Last week's sales" }).click();
    await page.waitForURL((url) => url.pathname === home, { timeout: 10_000 });
    const laneStill = await lane.isVisible();
    await side.getByRole("button", { name: "New thread in Demo store" }).click();
    await page.waitForURL((url) => ![home, childPath].includes(url.pathname), { timeout: 10_000 });
    const mains = await project.locator('[data-thread="main"]').count();
    await page.screenshot({ path: shotPath("P4-sidebar") });
    return {
      ok:
        branch === 1 &&
        childText.includes("New thread") &&
        mainTitle === "Last week's sales" &&
        laneShown &&
        laneStill &&
        mains >= 2,
      detail: `child row ${JSON.stringify(childText)} with ${branch} branch icon opens ${childPath} with main "${mainTitle}" and its lane ${laneShown}; main row keeps the lane ${laneStill}; mains in the project ${mains}`,
    };
  },

  async P5(browser) {
    const page = await openProfit(browser);
    const project = sidebarOf(page).getByRole("button", { name: "Demo store", exact: true });
    const chevron = project.locator('[data-slot="fold-chevron"]');
    const plusVisible = async () =>
      Boolean(
        await sidebarOf(page).getByRole("button", { name: "New thread in Demo store" }).isVisible(),
      );
    const look = async () => ({
      expanded: await project.getAttribute("aria-expanded"),
      chevron: await chevron.evaluate((el) => getComputedStyle(el).opacity),
    });
    await page.mouse.move(900, 450);
    await page.waitForTimeout(250);
    const openRest = await look();
    const plusOpen = await plusVisible();
    await project.hover();
    await page.waitForTimeout(250);
    const openHover = await look();
    await project.screenshot({ path: shotPath("P5-open-hover") });
    await project.click();
    await page.mouse.move(900, 450);
    await page.waitForTimeout(250);
    const folded = await look();
    await project.screenshot({ path: shotPath("P5-folded") });
    const threadsHidden = !(await sidebarOf(page)
      .getByRole("link", { name: "Last week's sales" })
      .isVisible());
    const plusFolded = await plusVisible();
    // Opened again by a click, which leaves focus on the row: the "v" still fades once the
    // pointer leaves, since only keyboard focus holds it up.
    await project.click();
    await page.mouse.move(900, 450);
    await page.waitForTimeout(250);
    const reopened = await look();
    return {
      ok:
        openRest.expanded === "true" &&
        openRest.chevron === "0" &&
        openHover.chevron === "1" &&
        folded.expanded === "false" &&
        folded.chevron === "1" &&
        reopened.expanded === "true" &&
        reopened.chevron === "0" &&
        threadsHidden &&
        plusOpen &&
        plusFolded,
      detail: `open at rest ${JSON.stringify(openRest)}, on hover ${JSON.stringify(openHover)}, folded ${JSON.stringify(folded)}, opened by a click and left ${JSON.stringify(reopened)}; threads hidden when folded ${threadsHidden}; + shown open ${plusOpen} folded ${plusFolded}`,
    };
  },

  async P6(browser) {
    const page = await openProfit(browser);
    await makeLane(page, "Weekend margins");
    await makeLane(page, "Sunday");
    // Naming the second lane scrolls the row to it; the carry aims at the first lane's gap, as P3 does.
    await canvasOf(page).evaluate((el) => (el.scrollLeft = 0));
    const heading = mainPanel(page).locator(".card-heading").first();
    await heading.scrollIntoViewIfNeeded();
    const hb = await heading.boundingBox();
    const first = await canvasOf(page).locator(":scope > article").first().boundingBox();
    await carry(page, { x: hb.x + 30, y: hb.y + hb.height / 2 }, [
      { x: first.x - 6, y: first.y + first.height / 2 },
    ]);
    await page.mouse.up();
    await page.waitForTimeout(600);
    await canvasOf(page).getByRole("button", { name: "Close Sunday" }).click();
    const gap = canvasOf(page).getByRole("separator", { name: "Resize or move Weekend margins" });
    await gap.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const width = async () =>
      Math.round(
        (
          await canvasOf(page)
            .locator(':scope > article[aria-label="Weekend margins"]')
            .boundingBox()
        ).width,
      );
    const before = { titles: await laneTitles(page), width: await width() };
    await page.reload({ waitUntil: "load" });
    // The lane the reload has to bring back, not any lane: under load the row can still be
    // drawing its first one when a fixed wait runs out.
    await canvasOf(page)
      .locator(':scope > article[aria-label="Weekend margins"]')
      .waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const after = { titles: await laneTitles(page), width: await width() };
    const children = await sidebarOf(page).locator('[data-thread="child"]').allInnerTexts();
    return {
      ok:
        JSON.stringify(before.titles) === JSON.stringify(after.titles) &&
        after.titles[0] === "Last week's profit by day" &&
        !after.titles.includes("Sunday") &&
        before.width === after.width &&
        children.some((t) => t.includes("Sunday")) &&
        children.some((t) => t.includes("Weekend margins")),
      detail: `lanes ${before.titles.join(" | ")} → ${after.titles.join(" | ")}; width ${before.width} → ${after.width}; sidebar children ${children.join(" / ")}`,
    };
  },

  async P7(browser) {
    const results = [];
    for (const name of SCENARIOS) {
      const a = await scenarioLook(browser, name);
      const b = await scenarioLook(browser, name);
      writeFileSync(shotPath(`P7-${name}`), a.png);
      results.push({
        name,
        same: Buffer.compare(a.png, b.png) === 0,
        shows: EXPECT[name](a.look),
        kept: a.look.url.includes(`scenario=${name}`),
        look: a.look,
      });
    }
    return {
      ok: results.every((r) => r.same && r.shows && r.kept),
      detail: results
        .map((r) => `${r.name}: same ${r.same}, shows ${r.shows}, kept ${r.kept}`)
        .join("; "),
    };
  },

  async P9(browser) {
    const page = await openProfit(browser);
    // The device keeps the Live Playground's tab open too, so a tab is found by its thread.
    const opened = await tabsOf(page).count();
    const compose = mainPanel(page).getByRole("textbox", { name: "Message" });
    await compose.fill("draft kept");
    await sidebarOf(page).getByRole("button", { name: "New thread in Demo store" }).click();
    await page.waitForFunction(() => location.pathname !== "/t/profit");
    const fresh = pathOf(page).split("/").at(-1);
    await layoutButton(page, "Browser").click();
    const browserShown = await page.getByRole("region", { name: "Browser" }).isVisible();
    await tabOf(page, "profit").click();
    const canvasBack = await canvasOf(page).isVisible();
    const draft = await mainPanel(page).getByRole("textbox", { name: "Message" }).inputValue();
    await tabOf(page, fresh).click();
    const browserBack = await page.getByRole("region", { name: "Browser" }).isVisible();
    await page.reload({ waitUntil: "load" });
    await tabsOf(page).first().waitFor({ timeout: 20_000 });
    const afterReload = {
      tabs: await tabsOf(page).count(),
      active: await selectedTab(page),
      activeId: await selectedTabId(page),
      browser: await page.getByRole("region", { name: "Browser" }).isVisible(),
    };
    await tabOf(page, "profit").click();
    const canvasAfter = await canvasOf(page).isVisible();
    await layoutButton(page, "Thread").click();
    await page.waitForTimeout(300);
    const alone = await page.locator('[role="tabpanel"]:not([inert])').evaluate((tab) => {
      const thread = tab.querySelector('[data-slot="resizable-panel"]');
      const share = thread.getBoundingClientRect().width / tab.getBoundingClientRect().width;
      return Math.round(share * 100);
    });
    await titleBar(page).screenshot({ path: shotPath("P9-title-bar") });
    return {
      ok:
        alone === 100 &&
        browserShown &&
        canvasBack &&
        draft === "draft kept" &&
        browserBack &&
        afterReload.tabs === opened + 1 &&
        afterReload.active.includes("New thread") &&
        afterReload.activeId === `tab-${fresh}` &&
        afterReload.browser &&
        canvasAfter,
      detail: `browser ${browserShown}; back to canvas ${canvasBack} with draft ${JSON.stringify(draft)}; browser again ${browserBack}; after reload ${JSON.stringify(afterReload)}, canvas ${canvasAfter}; the thread alone fills ${alone}% of its tab`,
    };
  },

  // The layout switch closes a side pane pressed again: Canvas or Browser, by the pointer or by
  // Space, goes back to the thread alone, filling its tab; the thread pressed again stays.
  async P9b(browser) {
    const { page } = await onThreadPage(browser);
    const pressed = () =>
      page
        .getByRole("group", { name: "Layout" })
        .locator('button[aria-pressed="true"]')
        .getAttribute("aria-label");
    const threadShare = () =>
      page.locator('[role="tabpanel"]:not([inert])').evaluate((tab) => {
        const thread = tab.querySelector('[data-slot="resizable-panel"]');
        return Math.round(
          (thread.getBoundingClientRect().width / tab.getBoundingClientRect().width) * 100,
        );
      });
    // The demo's thread opens beside its canvas; start from the thread alone.
    await layoutButton(page, "Thread").click();
    const steps = [];
    const step = async (label, act) => {
      await act();
      await page.waitForTimeout(300);
      steps.push({ label, pressed: await pressed(), share: await threadShare() });
    };
    await step("Canvas", () => layoutButton(page, "Canvas").click());
    await step("Canvas again", () => layoutButton(page, "Canvas").click());
    await step("Browser", () => layoutButton(page, "Browser").click());
    await step("Browser again", () => layoutButton(page, "Browser").click());
    await step("Thread again", () => layoutButton(page, "Thread").click());
    await layoutButton(page, "Canvas").focus();
    await step("Space on Canvas", () => page.keyboard.press("Space"));
    await step("Space on Canvas again", () => page.keyboard.press("Space"));
    const want = [
      ["Canvas", false],
      ["Thread", true],
      ["Browser", false],
      ["Thread", true],
      ["Thread", true],
      ["Canvas", false],
      ["Thread", true],
    ];
    const ok = steps.every(
      (each, i) => each.pressed === want[i][0] && (each.share === 100) === want[i][1],
    );
    return {
      ok,
      detail: steps.map((each) => `${each.label}: ${each.pressed} (${each.share}%)`).join("; "),
    };
  },

  async P10(browser) {
    const { page } = await onThreadPage(browser);
    await layoutButton(page, "Browser").click();
    const pane = page.getByRole("region", { name: "Browser" });
    const address = pane.getByRole("textbox", { name: "Address" });
    const start = await address.inputValue();
    await address.fill("weather.example/radar");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const went = await address.inputValue();
    await pane.getByRole("button", { name: "Back" }).click();
    const back = await address.inputValue();
    await pane.getByRole("button", { name: "Forward" }).click();
    const forward = await address.inputValue();
    await pane.getByRole("button", { name: "Reload" }).click();
    await pane.screenshot({ path: shotPath("P10-browser") });
    await page.reload({ waitUntil: "load" });
    await page.getByRole("region", { name: "Browser" }).waitFor({ timeout: 20_000 });
    const kept = await page
      .getByRole("region", { name: "Browser" })
      .getByRole("textbox", { name: "Address" })
      .inputValue();
    return {
      ok:
        start !== "" &&
        went.includes("weather.example/radar") &&
        back === start &&
        forward === went &&
        kept === went,
      detail: `start ${start}; went ${went}; back ${back}; forward ${forward}; after reload ${kept}`,
    };
  },

  async P11(browser) {
    const { page } = await onThreadPage(browser);
    const win = await boxOf(page.locator('[data-slot="window"]'));
    const radius = await page
      .locator('[data-slot="window"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    const bar = titleBar(page);
    const barBox = await boxOf(bar);
    const lights = bar.locator('[data-slot="traffic-lights"]');
    const lightsBox = await boxOf(lights);
    const lightsHidden = await lights.getAttribute("aria-hidden");
    const toggle = await boxOf(bar.getByRole("button", { name: "Toggle sidebar" }));
    const strip = await boxOf(bar.getByRole("tablist", { name: "Open threads" }));
    const bell = await boxOf(bar.getByRole("button", { name: "Notifications" }));
    const accountsInBar = await bar.getByRole("button", { name: "Account" }).count();
    const rightmost = await bar
      .getByRole("button")
      .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
    const side = await boxOf(page.locator('[data-slot="sidebar-container"]'));
    await page.screenshot({ path: shotPath("P11-window") });
    await page.setViewportSize({ width: 700, height: 900 });
    await page.waitForTimeout(300);
    const narrow = await boxOf(page.locator('[data-slot="window"]'));
    const ok =
      win !== null &&
      win.x >= 6 &&
      win.y >= 6 &&
      radius >= 10 &&
      near(barBox.x, win.x) &&
      near(barBox.x + barBox.width, win.x + win.width) &&
      near(barBox.y, win.y) &&
      lightsHidden === "true" &&
      lightsBox.x + lightsBox.width <= toggle.x &&
      toggle.x + toggle.width <= strip.x &&
      accountsInBar === 0 &&
      near(bell.x + bell.width, rightmost) &&
      side.y >= barBox.y + barBox.height - 1 &&
      narrow.x === 0;
    return {
      ok,
      detail: `window ${JSON.stringify(win)} radius ${radius}; bar ${JSON.stringify(barBox)}; lights before toggle ${lightsBox.x + lightsBox.width <= toggle.x}; toggle before tabs ${toggle.x + toggle.width <= strip.x}; accounts in the bar ${accountsInBar}; bell rightmost ${near(bell.x + bell.width, rightmost)}; sidebar under bar ${side.y >= barBox.y + barBox.height - 1}; full-bleed at 700px ${narrow.x === 0}`,
    };
  },

  // The rail's places, top to bottom, by name, role and glyph (ADR-094, amended): Home with
  // Kay's bonsai mark, the places not built yet, the documentation link, and the Lab last, each
  // one below the one before.
  async P12(browser) {
    const { page } = await onThreadPage(browser);
    const home = page.getByRole("link", { name: "Home", exact: true });
    const pills = await home
      .locator("svg rect")
      .evaluateAll((rects) =>
        rects.map((r) =>
          ["x", "y", "width", "height", "rx"].map((a) => r.getAttribute(a)).join(" "),
        ),
      );
    const places = await railOf(page).locator('[data-sidebar="header"]').evaluate(readPlaces);
    const exact = pills.join("|") === BONSAI_PILLS;
    const want = RAIL_PLACES.map(({ name, role, icon }) => [name, role, icon]);
    const got = places.map(({ name, role, icon }) => [name, role, icon]);
    const inOrder = JSON.stringify(got) === JSON.stringify(want);
    const stacked = places.every((place, i) => i === 0 || place.glyph[1] > places[i - 1].glyph[1]);
    await page.locator('[data-slot="sidebar-header"]').screenshot({ path: shotPath("P12-rail") });
    return {
      ok: exact && inOrder && stacked,
      detail: `mark ${pills.length} pills${exact ? ", exact" : ` ${JSON.stringify(pills)}`}; places ${inOrder ? "in order" : JSON.stringify(got)}; each below the last ${stacked}`,
    };
  },

  async P13(browser) {
    const cases = ["light", "dark"].flatMap((theme) => NARROW.map((width) => ({ theme, width })));
    const results = await Promise.all(cases.map((each) => narrowBar(browser, each)));
    return {
      ok: results.every((each) => each.ok),
      detail: results.map((each) => each.note).join("; "),
    };
  },
};
