// Checks what the keyboard and assistive technology reach around the projects panel (ADR-144),
// on a desktop window: the closed panel out of reach, and the Tab order through the rail and the
// panel.
// oxlint-disable no-await-in-loop -- one keyboard drives one page, so each step waits for the last
import { placeOf, RAIL_PLACES } from "./rail-places.mjs";
import { openDesk } from "./sidebar-checks.mjs";

const THEMES = ["light", "dark"];
// The rail's stops top to bottom: its places, then the account at its foot.
const RAIL_STOPS = [...RAIL_PLACES.map((place) => place.name), "Account"];
// How many Tabs a walk from the toggle takes before it gives up.
const TABS = 60;
// What the closed panel must hide: a thread's row and the resize edge, by their accessibility
// role and name.
const HIDDEN = [
  { role: "link", name: "Refund audit" },
  { role: "separator", name: "Resize the sidebar" },
];

// Runs in the page: whether keyboard focus is inside the panel.
const focusInPanel = () =>
  (document.activeElement?.closest('[data-slot="sidebar-container"]') ?? null) !== null;

// Tabs from the toggle up to TABS times; whether any stop was inside the panel.
async function tabsIntoPanel(page) {
  await page.getByRole("button", { name: "Toggle sidebar" }).focus();
  for (let step = 0; step < TABS; step++) {
    await page.keyboard.press("Tab");
    if ((await page.evaluate(focusInPanel)) === true) return true;
  }
  return false;
}

// Which of HIDDEN the accessibility tree offers, unignored, as the browser builds it for a
// screen reader.
async function exposed(page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  await cdp.detach();
  const offered = (want) =>
    nodes.some(
      (node) =>
        node.ignored !== true && node.role?.value === want.role && node.name?.value === want.name,
    ) === true;
  return HIDDEN.filter((want) => offered(want)).map((want) => want.name);
}

// The panel's reach now: Tab, inert and the accessibility tree.
const reachOf = async (page) => ({
  tabbed: await tabsIntoPanel(page),
  inert: await page.locator('[data-slot="sidebar-container"]').evaluate((el) => el.inert),
  exposed: await exposed(page),
});

// P32 in one theme: closed at rest, then docked by Ctrl/Cmd+B.
async function outOfReach(browser, theme) {
  const { context, page } = await openDesk(browser, { theme });
  await page.mouse.move(900, 500);
  const away = await reachOf(page);
  await page.keyboard.press("ControlOrMeta+b");
  await page.waitForTimeout(200);
  const docked = await reachOf(page);
  await context.close();
  return {
    ok:
      !away.tabbed &&
      away.inert === true &&
      away.exposed.length === 0 &&
      docked.tabbed &&
      docked.inert === false &&
      docked.exposed.length === HIDDEN.length,
    note: `${theme} closed: Tab into it ${away.tabbed}, inert ${away.inert}, exposed [${away.exposed.join(", ")}]; docked: Tab into it ${docked.tabbed}, inert ${docked.inert}, exposed [${docked.exposed.join(", ")}]`,
  };
}

// Runs in the page: the focused element's name and where it sits: the title bar, the rail, the
// panel, the workspace's main, or elsewhere.
function stopNow() {
  const at = document.activeElement;
  const inside = (selector) => at.closest(selector) !== null;
  const where = [
    ["bar", 'header[data-slot="title-bar"]'],
    ["rail", '[data-slot="rail"]'],
    ["panel", '[data-slot="sidebar-container"]'],
    ["main", '[role="main"]'],
  ].find(([, selector]) => inside(selector));
  return {
    name: at.getAttribute("aria-label") ?? at.textContent.trim().slice(0, 40),
    where: where === undefined ? "elsewhere" : where[0],
  };
}

// The Tab stops from Kay until one lands in the workspace, and the stop just before Kay.
async function stopsFromKay(page) {
  await placeOf(page, RAIL_PLACES[0]).focus();
  await page.keyboard.press("Shift+Tab");
  const before = await page.evaluate(stopNow);
  await page.keyboard.press("Tab");
  const stops = [await page.evaluate(stopNow)];
  while (stops.at(-1).where !== "main" && stops.length < TABS) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(stopNow));
  }
  return { before, stops };
}

// Some stops' names, joined; whether they all sit in one place; a walk written out.
const namesOf = (stops) => stops.map((stop) => stop.name).join("|");
const allIn = (stops, where) => stops.every((stop) => stop.where === where) === true;
const describeWalk = ({ before, stops }) =>
  `${before.where} > ${stops.map((stop) => `${stop.where}:${stop.name}`).join(" > ")}`;

// Whether a walk crossed the rail in its order and then, docked, the panel from its first
// project to its resize edge, before the workspace.
function walkedInOrder({ before, stops }, docked) {
  const rail = stops.slice(0, RAIL_STOPS.length);
  const rest = stops.slice(RAIL_STOPS.length, -1);
  const railInOrder = allIn(rail, "rail") && namesOf(rail) === RAIL_STOPS.join("|");
  const panel =
    docked === true
      ? rest.length > 2 &&
        allIn(rest, "panel") &&
        rest[0].name === "Demo store" &&
        rest.at(-1).name === "Resize the sidebar"
      : rest.length === 0;
  return before.where === "bar" && railInOrder && panel && stops.at(-1).where === "main";
}

// P33 in one theme: the walk with the panel docked and closed.
async function tabOrder(browser, theme) {
  const walks = {};
  for (const side of ["open", "closed"]) {
    const { context, page } = await openDesk(browser, { side, theme });
    walks[side] = await stopsFromKay(page);
    await context.close();
  }
  const [open, closed] = [walks.open.stops, walks.closed.stops].map((stops) =>
    namesOf(stops.slice(0, RAIL_STOPS.length)),
  );
  const same = open === closed;
  return {
    ok: walkedInOrder(walks.open, true) && walkedInOrder(walks.closed, false) && same,
    note: `${theme} docked ${describeWalk(walks.open)}; closed ${describeWalk(walks.closed)}; the rail's stops the same ${same}`,
  };
}

/** The workspace lever's checks of what reaches the panel, by id; panel-checks.mjs registers them. */
export const panelReachChecks = {
  // The closed panel is out of reach (ADR-144): inert, never a stop in 60 Tabs from the toggle,
  // and no row or resize edge in the accessibility tree (Playwright's role queries do not treat
  // inert as hidden, so the tree is read from the browser itself); docked, all three come back.
  async P32(browser) {
    const results = [];
    for (const theme of THEMES) results.push(await outOfReach(browser, theme));
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },

  // Tab reads the columns in order (ADR-144): after the title bar, the rail's eight places and
  // then its account; docked, the panel from Demo store to its resize edge; then the workspace.
  // Closed, the workspace follows the account. The rail's stops are the same either way.
  async P33(browser) {
    const results = [];
    for (const theme of THEMES) results.push(await tabOrder(browser, theme));
    return { ok: results.every((r) => r.ok), detail: results.map((r) => r.note).join("; ") };
  },
};
