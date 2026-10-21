// oxlint-disable no-await-in-loop -- a check drives one browser step at a time, in order
/* oxlint-disable unicorn/consistent-function-scoping -- the two page callbacks are serialized
   into the page, so their helpers have to live inside them */
// A new thread's welcome and its debug switch for the painting (ADR-135, ADR-136, ADR-138) on
// the real app's demo scenario: where the switch shows, what each look paints, what waits for
// its assets, how the switch is driven, whether the words stay legible over each painting, and
// whether its buttons keep the site's corners.
// Every check opens its own browser context, so none sees another's data or stored look.
import { BASE, shotPath, sidebarDrawn } from "./lever.mjs";

/** The looks that have their assets, in the switch's order; Bonsai is listed and waits. */
export const LOOKS = ["landscape", "abstract", "vitruvian"];
const THEMES = ["light", "dark"];
// WCAG AA for body text: the words against the worst pixel of the painting behind them.
const AA = 4.5;

/** The tab panel on screen; the others are kept, inert. */
export const panelOf = (page) => page.locator('[role="tabpanel"]:not([inert])');
const switchOf = (page) => panelOf(page).locator('[data-slot="splash-switch"]');
const menuOf = (page) => page.getByRole("menu");
const layoutButton = (page, name) =>
  page.getByRole("group", { name: "Layout" }).getByRole("button", { name, exact: true });
const labelOf = (look) => look[0].toUpperCase() + look.slice(1);

/**
 * The demo at a desktop size in a fresh context. `turn` is where the splash cycle stands before
 * the app boots (`kay.splash.turn`, null for a first visit), `retired` is what the retired
 * `kay.splash` key holds, `query` is added to the address, `motion` is the page's reduced-motion
 * preference, and `prepare` gets the context before the page opens.
 */
export async function openDemo(
  browser,
  {
    theme = "light",
    query = "",
    turn = null,
    retired = null,
    motion = "reduce",
    prepare = async () => {},
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: motion,
    colorScheme: theme,
  });
  await prepare(context);
  await context.addInitScript(
    ([before, look]) => {
      // Runs in every frame, and a sandboxed one has no storage to write to. Only before the
      // first load: a reload must see what the app itself wrote.
      try {
        if (sessionStorage.getItem("lever.seeded") !== null) return;
        sessionStorage.setItem("lever.seeded", "1");
        if (before !== null) localStorage.setItem("kay.splash.turn", String(before));
        if (look !== null) localStorage.setItem("kay.splash", look);
      } catch {
        // Nothing to seed there.
      }
    },
    [turn, retired],
  );
  const errors = [];
  context.on("weberror", (failure) => errors.push(String(failure.error())));
  context.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/?scenario=demo${query === "" ? "" : `&${query}`}`, {
    waitUntil: "load",
  });
  await sidebarDrawn(page);
  await page.locator(".thread-panel").first().waitFor({ timeout: 20_000 });
  return { page, context, errors };
}

/** Starts a new thread from the sidebar and waits for its welcome. */
export async function startThread(page) {
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("button", { name: "New thread in Demo store" })
    .click();
  await panelOf(page).locator(".welcome").waitFor({ timeout: 10_000 });
}

// Pressed only when it is not already: pressing the open side pane again closes it back to the
// thread (ADR-138).
async function chooseLayout(page, name) {
  await page.locator('[role="group"][aria-label="Layout"] button[aria-pressed="true"]').waitFor();
  if ((await layoutButton(page, name).getAttribute("aria-pressed")) !== "true") {
    await layoutButton(page, name).click();
  }
  await page
    .locator('[role="group"][aria-label="Layout"] button[aria-pressed="true"]', { hasText: name })
    .waitFor();
}

// Opens the switch's menu and picks a look by its label.
async function pickLook(page, look) {
  await switchOf(page).click();
  await page.getByRole("menuitemradio", { name: labelOf(look) }).click();
  await menuOf(page).waitFor({ state: "detached" });
}

// What the shown welcome paints, as the page reports it: the attribute on <html>, the painting
// the art layer draws, and the pieces of the Vitruvian sheet.
function paintOf(page) {
  return panelOf(page).evaluate((panel) => {
    const art = panel.querySelector(".welcome-art");
    const sheet = panel.querySelector('[data-slot="welcome-splash"]');
    const has = (selector) => sheet !== null && sheet.querySelector(selector) !== null;
    const maskOf = (selector) =>
      has(selector) ? getComputedStyle(sheet.querySelector(selector)).maskImage : "";
    return {
      attr: document.documentElement.dataset.splash,
      painting:
        art === null
          ? null
          : (/\/splash\/([a-z]+)\.webp/.exec(getComputedStyle(art).backgroundImage)?.[1] ?? null),
      sheet: sheet !== null,
      figure: maskOf('[data-slot="welcome-figure"]').includes("atlas.webp"),
      lines: maskOf(".splash-lines").includes("atlas-lines.svg"),
      dots: has(".splash-dots"),
      clearing: has(".splash-clearing"),
      label: panel.querySelector('[data-slot="splash-switch"]')?.textContent ?? null,
    };
  });
}

// A picture of the welcome with the switch taken out, repeated until two in a row agree: the
// painting is a CSS image, which nothing waits for.
async function settledPicture(page) {
  const style = await page.addStyleTag({
    content: '[data-slot="splash-switch"]{visibility:hidden!important}',
  });
  let last = await panelOf(page).screenshot({ animations: "disabled" });
  for (let tries = 0; tries < 12; tries += 1) {
    await page.waitForTimeout(150);
    const next = await panelOf(page).screenshot({ animations: "disabled" });
    if (Buffer.compare(last, next) === 0) break;
    last = next;
  }
  await style.evaluate((node) => {
    node.remove();
  });
  return last;
}

// Runs in the page: every visible text in the shown welcome with its colour and the rectangle
// its glyphs fill. Disabled controls are exempt from contrast, as WCAG has it.
function inksOfWelcome() {
  const root = document.querySelector('[role="tabpanel"]:not([inert]) .welcome');
  const found = [];
  const shownEl = (el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    for (let at = el; at !== null; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.display === "none" || style.visibility !== "visible") return false;
    }
    return el.closest("button:disabled") === null;
  };
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!shownEl(el)) continue;
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || node.textContent.trim() === "") continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      found.push({
        label: node.textContent.trim().slice(0, 28),
        colour: getComputedStyle(el).color,
        rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
    }
  }
  return found;
}

// Runs in the page: the lowest contrast of each ink's colour against any pixel of a picture
// taken with the words removed, under the glyphs' rectangle.
async function lowestUnder({ b64, inks }) {
  const bitmap = await createImageBitmap(
    await (await fetch(`data:image/png;base64,${b64}`)).blob(),
  );
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  const linear = (value) => {
    const share = value / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const rgb = (css) => {
    const numbers = css
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
    return css.startsWith("color(srgb") ? numbers.map((each) => each * 255) : numbers;
  };
  return inks.map(({ label, colour, rect }) => {
    const ink = luminance(...rgb(colour));
    const { data } = context.getImageData(
      Math.max(0, Math.floor(rect.x)),
      Math.max(0, Math.floor(rect.y)),
      Math.max(1, Math.ceil(rect.width)),
      Math.max(1, Math.ceil(rect.height)),
    );
    let lowest = Infinity;
    for (let i = 0; i < data.length; i += 4) {
      const ground = luminance(data[i], data[i + 1], data[i + 2]);
      lowest = Math.min(lowest, (Math.max(ground, ink) + 0.05) / (Math.min(ground, ink) + 0.05));
    }
    return { label, ratio: Math.round(lowest * 100) / 100 };
  });
}

// The lowest contrast of any word in the shown welcome against the painting behind it.
async function lowestWord(page) {
  // The buttons ease their fills, even under reduced motion; a fill caught mid-way is not theirs.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((each) => each instanceof CSSTransition)
        .map((each) => each.finished.catch(() => {})),
    ),
  );
  const inks = await page.evaluate(inksOfWelcome);
  const style = await page.addStyleTag({
    content:
      '[role="tabpanel"]:not([inert]) .welcome,[role="tabpanel"]:not([inert]) .welcome *{color:transparent!important;-webkit-text-fill-color:transparent!important}[role="tabpanel"]:not([inert]) .welcome svg{visibility:hidden!important}',
  });
  const png = await page.screenshot({ animations: "disabled" });
  await style.evaluate((node) => {
    node.remove();
  });
  const rows = await page.evaluate(lowestUnder, { b64: png.toString("base64"), inks });
  return { ...rows.reduce((low, row) => (row.ratio < low.ratio ? row : low)), words: rows.length };
}

// Runs in the page: a button's computed corners, the site's button corners it should have (the
// catalog's --btn-radius, 4px, which tokens.test.ts guards), and the state it was read in.
function cornersOf(button) {
  return {
    radius: getComputedStyle(button).borderRadius,
    site: getComputedStyle(document.documentElement).getPropertyValue("--btn-radius").trim(),
    hover: button.matches(":hover"),
    focus: button.matches(":focus-visible"),
  };
}

// Runs in the page: every button in the shown welcome drawn with square corners.
function squareButtons() {
  const root = document.querySelector('[role="tabpanel"]:not([inert]) .welcome');
  return [...root.querySelectorAll("button")]
    .filter((button) => getComputedStyle(button).borderRadius === "0px")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent.trim());
}

// One look in one theme: a new thread painted so, and its lowest word.
async function wordsOver(browser, { theme, look }) {
  const { page, context } = await openDemo(browser, { theme, query: `splash=${look}` });
  await startThread(page);
  await settledPicture(page);
  const low = await lowestWord(page);
  await context.close();
  return { theme, look, ...low };
}

export const welcomeChecks = {
  // W1: the switch shows on a new thread in the Thread layout and nowhere else.
  async W1(browser) {
    const { page, context } = await openDemo(browser);
    const seen = { turns: await switchOf(page).count() };
    await chooseLayout(page, "Canvas");
    seen.turnsOnCanvas = await switchOf(page).count();
    await chooseLayout(page, "Thread");
    await startThread(page);
    seen.newThread = await switchOf(page).count();
    await page.screenshot({ path: shotPath("W1-new-thread") });
    await chooseLayout(page, "Canvas");
    seen.canvas = await switchOf(page).count();
    await page.screenshot({ path: shotPath("W1-canvas") });
    await chooseLayout(page, "Browser");
    seen.browser = await switchOf(page).count();
    await chooseLayout(page, "Thread");
    seen.back = await switchOf(page).count();
    await page.goto(`${BASE}/lab?scenario=demo`, { waitUntil: "load" });
    await page.locator('[data-slot="window"]').waitFor();
    await page.waitForTimeout(500);
    seen.lab = await page.locator('[data-slot="splash-switch"]').count();
    await context.close();
    const expected = {
      turns: 0,
      turnsOnCanvas: 0,
      newThread: 1,
      canvas: 0,
      browser: 0,
      back: 1,
      lab: 0,
    };
    return {
      ok: JSON.stringify(seen) === JSON.stringify(expected),
      detail: `switches ${JSON.stringify(seen)}, wanted ${JSON.stringify(expected)}`,
    };
  },

  // W2: a first visit opens on the abstract painting; each available look sets <html
  // data-splash>, draws its own painting or sheet, changes the picture and labels the button;
  // the next visit opens on landscape, the cycle's next look, whatever the switch picked.
  async W2(browser) {
    const { page, context, errors } = await openDemo(browser);
    await startThread(page);
    const first = await paintOf(page);
    const pictures = [await settledPicture(page)];
    const notes = [`start ${first.attr}/${first.label}`];
    let ok = first.attr === "abstract" && first.painting === "abstract" && !first.sheet;
    for (const look of ["landscape", "vitruvian", "abstract"]) {
      await pickLook(page, look);
      const paint = await paintOf(page);
      const drawn =
        look === "vitruvian"
          ? paint.sheet &&
            paint.figure &&
            paint.lines &&
            paint.dots &&
            paint.clearing &&
            paint.painting === null
          : paint.painting === look && !paint.sheet;
      pictures.push(await settledPicture(page));
      ok &&= paint.attr === look && paint.label === `Splash · ${labelOf(look)}` && drawn;
      notes.push(`${look}: attr ${paint.attr}, art ${paint.painting}, sheet ${paint.sheet}`);
    }
    // Abstract, landscape, Vitruvian, then abstract again: the first and last agree, the rest differ.
    const [a, b, v, again] = pictures;
    const differ =
      Buffer.compare(a, b) !== 0 && Buffer.compare(a, v) !== 0 && Buffer.compare(b, v) !== 0;
    const returns = Buffer.compare(a, again) === 0;
    await pickLook(page, "vitruvian");
    await page.screenshot({ path: shotPath("W2-vitruvian") });
    const turned = await page.evaluate(() => localStorage.getItem("kay.splash.turn"));
    await page.reload({ waitUntil: "load" });
    await sidebarDrawn(page);
    await startThread(page);
    const drawn = await paintOf(page);
    await context.close();
    ok &&= differ && returns && turned === "1" && drawn.attr === "landscape";
    ok &&= errors.length === 0;
    return {
      ok,
      detail: `${notes.join("; ")}; pictures differ ${differ}, abstract returns ${returns}; turn ${turned}; after a reload ${drawn.attr}; errors ${JSON.stringify(errors).slice(0, 300)}`,
    };
  },

  // W3: Bonsai is listed and disabled, after the cycle's looks in its order; an unknown or
  // unavailable look in the address falls back to where the cycle stands (abstract, landscape,
  // Vitruvian), a look the address names wins, and a look the switch kept in an earlier build no
  // longer stands in for the cycle.
  async W3(browser) {
    const { page, context } = await openDemo(browser);
    await startThread(page);
    await switchOf(page).click();
    await menuOf(page).waitFor();
    const bonsai = page.getByRole("menuitemradio", { name: /^Bonsai/ });
    const listed = await page.getByRole("menuitemradio").allInnerTexts();
    const disabled = (await bonsai.getAttribute("aria-disabled")) === "true";
    const hint = (await bonsai.innerText()).includes("Coming soon");
    await bonsai.click({ force: true });
    const after = await paintOf(page);
    await context.close();
    const cases = [
      { query: "splash=bonsai", turn: null, retired: null, want: "abstract" },
      { query: "splash=nonsense", turn: 1, retired: null, want: "landscape" },
      { query: "", turn: 2, retired: "abstract", want: "vitruvian" },
      { query: "splash=vitruvian", turn: 0, retired: null, want: "vitruvian" },
      { query: "splash=abstract", turn: 2, retired: null, want: "abstract" },
    ];
    const got = [];
    for (const { query, turn, retired } of cases) {
      const other = await openDemo(browser, { query, turn, retired });
      got.push(await other.page.evaluate(() => document.documentElement.dataset.splash));
      await other.context.close();
    }
    const fallbacks = cases.every((each, i) => got[i] === each.want);
    return {
      ok:
        listed.length === 4 &&
        listed.map((text) => text.replace(/\s*Coming soon/, "")).join("|") ===
          "Abstract|Landscape|Vitruvian|Bonsai" &&
        disabled &&
        hint &&
        after.attr === "abstract" &&
        fallbacks,
      detail: `menu ${JSON.stringify(listed)}; Bonsai aria-disabled ${disabled}, hint ${hint}, look after a press ${after.attr}; fallbacks ${JSON.stringify(got)} for ${JSON.stringify(cases.map((each) => each.want))}`,
    };
  },

  // W4: the button is reached and opened by keyboard, Esc closes the menu and hands the focus
  // back, nothing covers the button or the menu's items, and the button clears the compose box.
  async W4(browser) {
    const { page, context } = await openDemo(browser);
    await startThread(page);
    const button = switchOf(page);
    await button.focus();
    await page.keyboard.press("Enter");
    await menuOf(page).waitFor();
    const opened = await menuOf(page).isVisible();
    const covered = await page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitemradio"]:not([aria-disabled="true"])')]
        .filter((item) => {
          const box = item.getBoundingClientRect();
          return !item.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        })
        .map((item) => item.textContent),
    );
    await page.keyboard.press("Escape");
    await menuOf(page).waitFor({ state: "detached" });
    const focusBack = await button.evaluate((el) => el === document.activeElement);
    const clear = await page.evaluate(() => {
      const panel = document.querySelector('[role="tabpanel"]:not([inert])');
      const box = panel.querySelector('[data-slot="splash-switch"]').getBoundingClientRect();
      const compose = panel.querySelector(".compose-box").getBoundingClientRect();
      const pane = panel.querySelector(".welcome").getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return {
        hit: hit?.closest('[data-slot="splash-switch"]') !== null,
        apart: box.bottom <= compose.top,
        inside: box.right <= pane.right && box.top >= pane.top,
        corner: pane.right - box.right,
      };
    });
    await context.close();
    return {
      ok: opened && covered.length === 0 && focusBack && clear.hit && clear.apart && clear.inside,
      detail: `Enter opens ${opened}; items under something ${JSON.stringify(covered)}; Esc closes and focus back on the button ${focusBack}; button hit ${clear.hit}, above the compose box ${clear.apart}, inside the pane ${clear.inside} (${Math.round(clear.corner)}px from its edge)`,
    };
  },

  // W5: the words are legible over every painting in both themes: 4.5:1 against the worst pixel
  // behind any of them, measured with the words taken out of the picture.
  async W5(browser) {
    const cases = THEMES.flatMap((theme) => LOOKS.map((look) => ({ theme, look })));
    const rows = await Promise.all(cases.map((each) => wordsOver(browser, each)));
    return {
      ok: rows.every((row) => row.ratio >= AA),
      detail: rows
        .map((row) => `${row.look}/${row.theme} ${row.ratio} ("${row.label}", ${row.words} words)`)
        .join("; "),
    };
  },

  // W6: the projects' "+" has the site's 4px button corners (design pillars rule 8) at rest, on
  // hover and under keyboard focus, so its hover fill and focus ring are not square, and no
  // button on the welcome keeps the vendored button's square default.
  async W6(browser) {
    const { page, context } = await openDemo(browser);
    await startThread(page);
    const plus = panelOf(page).getByRole("button", { name: "New project" });
    const rest = await plus.evaluate(cornersOf);
    await plus.hover();
    const hover = await plus.evaluate(cornersOf);
    await page.mouse.move(0, 0);
    // A key press first, so the focus that follows is keyboard focus and shows its ring.
    await page.keyboard.press("Shift");
    await plus.focus();
    const focus = await plus.evaluate(cornersOf);
    const square = await page.evaluate(squareButtons);
    // Padded, since the focus ring draws a pixel outside the button's own box.
    const box = await plus.boundingBox();
    await page.screenshot({
      path: shotPath("W6-plus-focus"),
      clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
    });
    await context.close();
    const states = [rest, hover, focus];
    return {
      ok:
        rest.site === "4px" &&
        states.every((state) => state.radius === rest.site) &&
        hover.hover === true &&
        focus.focus === true &&
        square.length === 0,
      detail: `site corners ${rest.site}; + at rest ${rest.radius}, hover ${hover.radius} (hovered ${hover.hover}), focus-visible ${focus.radius} (shown ${focus.focus}); square welcome buttons ${JSON.stringify(square)}`,
    };
  },
};
