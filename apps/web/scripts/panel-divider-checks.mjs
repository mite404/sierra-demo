// Checks the line that parts the rail from the projects panel (ADR-144), on a desktop window:
// docked by the toggle, closed and peeking, and through a pin and an unpin, in both themes.
import { openDesk, peek, PIN_MS } from "./sidebar-checks.mjs";

// The instants of a pin or an unpin the line is read at, in ms from its first frame.
const HELD_MS = [0, PIN_MS / 2, PIN_MS - 1];

// Runs in the page: the line at the rail's right edge, as its shadow, and the hairline token it
// should draw in.
function dividerNow() {
  const rail = document.querySelector('[data-slot="rail"]');
  const probe = document.createElement("div");
  probe.style.color = "var(--hairline)";
  document.body.append(probe);
  const hairline = getComputedStyle(probe).color;
  probe.remove();
  return { shadow: getComputedStyle(rail).boxShadow, hairline };
}

// Runs in the page: catches a pin's or an unpin's slide as it starts, holds every running
// transition at each of `at` and reads the rail's shadow there, then lets them finish.
const heldThrough = (page, at) =>
  page.evaluate(
    (instants) =>
      new Promise((done) => {
        const rail = document.querySelector('[data-slot="rail"]');
        const tick = () => {
          const running = document.getAnimations().filter((a) => a.timeline === document.timeline);
          if (!running.some((a) => a.transitionProperty === "left")) {
            requestAnimationFrame(tick);
            return;
          }
          const shadows = instants.map((ms) => {
            for (const a of running) a.currentTime = ms;
            return getComputedStyle(rail).boxShadow;
          });
          done(shadows);
        };
        tick();
      }),
    at,
  );

// A pin and an unpin by a click on the toggle, the line held at each of HELD_MS, then an unpin
// by Ctrl+B, which has no slide, read on its next frame.
async function throughToggle(browser, theme) {
  const { context, page } = await openDesk(browser, { theme });
  const toggle = page.getByRole("button", { name: "Toggle sidebar" });
  const pinned = heldThrough(page, HELD_MS);
  await toggle.click();
  const pin = await pinned;
  await page.waitForTimeout(PIN_MS + 150);
  const unpinned = heldThrough(page, HELD_MS);
  await toggle.click();
  const unpin = await unpinned;
  await page.waitForTimeout(PIN_MS + 150);
  const home = (await page.evaluate(dividerNow)).shadow;
  await toggle.click();
  await page.waitForTimeout(PIN_MS + 150);
  await page.mouse.move(900, 500);
  await page.keyboard.press("Control+b");
  const keyed = await page.evaluate(
    () =>
      new Promise((done) => {
        requestAnimationFrame(() => {
          done(getComputedStyle(document.querySelector('[data-slot="rail"]')).boxShadow);
        });
      }),
  );
  await context.close();
  return { pin, unpin, home, keyed };
}

// P35 in one theme: the divider docked, closed and while peeking, and through the toggle.
async function dividerIn(browser, theme) {
  const docked = await openDesk(browser, { side: "open", theme });
  const onDock = await docked.page.evaluate(dividerNow);
  await docked.context.close();
  const closed = await openDesk(browser, { theme });
  const onClose = await closed.page.evaluate(dividerNow);
  await peek(closed.page);
  const onPeek = await closed.page.evaluate(dividerNow);
  await closed.context.close();
  const line = `${onDock.hairline} -1px 0px 0px 0px inset`;
  const toggled = await throughToggle(browser, theme);
  const ok =
    onDock.shadow === line &&
    onClose.shadow === "none" &&
    onPeek.shadow === "none" &&
    toggled.pin.every((shadow) => shadow === line) === true &&
    toggled.unpin.every((shadow) => shadow === line) === true &&
    toggled.home === "none" &&
    toggled.keyed === "none";
  return {
    ok,
    note: `${theme}: docked ${onDock.shadow} (hairline ${onDock.hairline}), closed ${onClose.shadow}, peeking ${onPeek.shadow}; pin at ${HELD_MS.join("/")}ms [${toggled.pin.join(" | ")}]; unpin [${toggled.unpin.join(" | ")}], then ${toggled.home}; Ctrl+B unpin ${toggled.keyed}`,
  };
}

/** The workspace lever's checks of the panel's divider, by id; panel-checks.mjs registers them. */
export const panelDividerChecks = {
  // Docked by the toggle, a hint of a line parts the rail from the panel, the workspace's own
  // hairline at the rail's right edge, as in Kay's app (Ethan); closed or peeking, none. It is
  // drawn from a pin's first frame, as the panel starts out from behind it (Ethan), and holds
  // through an unpin's slide until the panel is home; an unpin by a key, with no slide, takes it
  // away on the next frame.
  async P35(browser) {
    const results = [await dividerIn(browser, "light")];
    return {
      ok: results.every((r) => r.ok),
      detail: results.map((r) => r.note).join("; "),
    };
  },
};
