// What the collapsible lane checks (ADR-133) measure with: the app in a context of its own,
// a collapsed lane's look, and a drag by its strip.
import { canvasOf, openCanvas } from "./canvas-checks.mjs";
import { shotPath } from "./lever.mjs";

// Long enough to outgrow a strip down a 900px window, so its end has to give way to an ellipsis.
export const LONG_TITLE =
  "Why supplier invoices and deliveries disagree at the northern warehouse, week by week, since June, and what the stores could do about it before the quarter closes";
export const STRIP_PX = 36;

export const near = (a, b) => Math.abs(a - b) <= 1;
// A box grown by 2px each way, so a measure of its ink takes in the paper around it.
export const pad = (box) => ({
  x: box.x - 2,
  y: box.y - 2,
  width: box.width + 4,
  height: box.height + 4,
});
export const NO_INK = { min: 255, max: 0, mean: 0 };
export const laneNamed = (page, title) =>
  canvasOf(page).locator(`:scope > article[aria-label="${title.replaceAll('"', '\\"')}"]`);

// The app in a fresh context with the Live Playground's canvas on screen. The context is the
// page's own, so a reload keeps what the device stored and nothing else sees it.
export async function openThemed(browser, theme = "light") {
  const page = await openCanvas(browser, { theme });
  return { page, close: () => page.context().close() };
}

/**
 * @typedef {{ x: number; y: number; width: number; height: number }} Box
 * @typedef {{
 *   width: number; stripTop: number; stripBottom: number; stripWidth: number;
 *   text: string; writing: string; overflow: string; clipped: boolean; tall: boolean;
 *   gripOpacity: string; gripBox: Box | null; titleBox: Box | null;
 *   toggleInStrip: boolean; contentShown: boolean; buttons: string[];
 * }} StripLook
 */

/**
 * What a collapsed lane shows, measured: the strip's box against the lane's, the title's
 * writing mode and clip, the grip's opacity, the buttons it offers and what it hides.
 * @returns {Promise<StripLook>}
 */
export function stripLook(lane) {
  return lane.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const strip = el.querySelector("[data-lane-strip]");
    const title = el.querySelector("[data-lane-strip-title]");
    const grip = el.querySelector("[data-lane-strip-grip]");
    const stripBox = strip?.getBoundingClientRect();
    const titleStyle = title === null ? null : getComputedStyle(title);
    const buttons = [...el.querySelectorAll("button")]
      .filter((button) => button.offsetWidth > 0)
      .map((button) => button.getAttribute("aria-label") ?? button.textContent.trim());
    return {
      width: box.width,
      stripTop: stripBox === undefined ? -1 : stripBox.top - box.top,
      stripBottom: stripBox === undefined ? -1 : box.bottom - stripBox.bottom,
      stripWidth: stripBox?.width ?? 0,
      text: title?.textContent ?? "",
      writing: titleStyle?.writingMode ?? "",
      overflow: titleStyle?.textOverflow ?? "",
      clipped: title !== null && title.scrollHeight > title.clientHeight + 1,
      tall:
        title !== null &&
        title.getBoundingClientRect().height > title.getBoundingClientRect().width,
      gripOpacity: grip === null ? "" : getComputedStyle(grip).opacity,
      gripBox: grip?.getBoundingClientRect().toJSON() ?? null,
      titleBox: title?.getBoundingClientRect().toJSON() ?? null,
      toggleInStrip: strip?.querySelector("[data-lane-toggle]") !== null,
      contentShown: [...el.querySelectorAll(".thread-panel, .card")].some(
        (part) => part.offsetWidth > 0,
      ),
      buttons,
    };
  });
}

// A rect (x, y, width, height) grown by `by` on every side, `by` negative to shrink it.
const grown = (rect, by) => ({
  x: rect.x - by,
  y: rect.y - by,
  width: rect.width + 2 * by,
  height: rect.height + 2 * by,
});

// How far inside a rounded box a point is from its edge: the negated signed distance to it.
function depthIn(point, box, radius) {
  const qx = Math.abs(point.x - box.x - box.width / 2) - (box.width / 2 - radius);
  const qy = Math.abs(point.y - box.y - box.height / 2) - (box.height / 2 - radius);
  return radius - Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - Math.min(Math.max(qx, qy), 0);
}

// 65 points along each side and each corner arc of a rounded box.
function outline(box, radius) {
  const steps = Array.from({ length: 65 }, (_, i) => i / 64);
  const sides = steps.flatMap((t) => [
    { x: box.x + radius + t * (box.width - 2 * radius), y: box.y },
    { x: box.x + radius + t * (box.width - 2 * radius), y: box.y + box.height },
    { x: box.x, y: box.y + radius + t * (box.height - 2 * radius) },
    { x: box.x + box.width, y: box.y + radius + t * (box.height - 2 * radius) },
  ]);
  const corners = steps.flatMap((t) =>
    [0, 1, 2, 3].map((k) => ({
      x:
        (k === 0 || k === 3 ? box.x + box.width - radius : box.x + radius) +
        radius * Math.cos(((k + t) * Math.PI) / 2),
      y:
        (k < 2 ? box.y + box.height - radius : box.y + radius) +
        radius * Math.sin(((k + t) * Math.PI) / 2),
    })),
  );
  return [...sides, ...corners];
}

/**
 * How the strip's expand sits in the strip's head, measured: its size, and the least distance, in
 * px, from its hover fill (the padding box, 1px in, with 3px corners) and from its focus ring (the
 * border box grown by 1px) to the strip's inner edge (the padding box, 13px corners), over every
 * point of their outlines. The strip's corner arc curves in under the fill's top corners, so the
 * sides alone would not show a fill touching it.
 * @returns {Promise<{ size: number; fill: number; ring: number }>}
 */
export async function toggleClearance(lane) {
  const seen = await lane.evaluate((el) => {
    const strip = el.querySelector("[data-lane-strip]");
    const toggle = strip.querySelector("[data-lane-toggle]");
    return {
      strip: strip.getBoundingClientRect().toJSON(),
      stripRadius: Number(getComputedStyle(strip).borderTopLeftRadius.replace("px", "")),
      toggle: toggle.getBoundingClientRect().toJSON(),
      toggleRadius: Number(getComputedStyle(toggle).borderTopLeftRadius.replace("px", "")),
    };
  });
  const edge = grown(seen.strip, -1);
  const least = (box, radius) =>
    Math.min(...outline(box, radius).map((point) => depthIn(point, edge, seen.stripRadius - 1)));
  return {
    size: seen.toggle.width,
    fill: least(grown(seen.toggle, -1), seen.toggleRadius - 1),
    ring: least(grown(seen.toggle, 1), seen.toggleRadius + 1),
  };
}

/**
 * Presses at `from`, travels to `to` in steps, and reports what the page showed on the way.
 * @returns {Promise<{ dragging: string; ghostWidth: number; ghostShadow: string;
 *   ghostGrip: number; lifted: string }>}
 */
export async function dragStrip(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 4, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(150);
  const during = await page.evaluate(() => {
    const ghost = document.querySelector(".lane-ghost");
    return {
      dragging: document.documentElement.dataset.dragging ?? "",
      ghostWidth: ghost === null ? 0 : Math.round(ghost.getBoundingClientRect().width),
      ghostShadow: ghost === null ? "none" : getComputedStyle(ghost).filter,
      ghostGrip: ghost?.querySelector("[data-lane-strip-grip]")?.offsetWidth ?? 0,
      lifted: document.querySelector("article[data-lifted]")?.getAttribute("aria-label") ?? "",
    };
  });
  await page.screenshot({ path: shotPath("P15-carrying") });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return during;
}
