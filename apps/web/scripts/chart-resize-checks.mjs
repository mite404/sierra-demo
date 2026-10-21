// Checks that a thread's charts follow their box as a pane is dragged, and that the slider card
// still eases its bars between stops: the cut-off bars Ethan recorded in September invoices.
import { BASE } from "./lever.mjs";

const SHOWN = '[role="tabpanel"]:not([inert])';
const STEPS = 60; // pointer moves in the drag
const STEP_PX = 5;

// Runs in the page: every frame, how far each chart's furthest bar reaches past the chart's own
// right edge, until the returned stop is called.
function sampleOverrun(shown) {
  const overruns = [];
  let sampling = true;
  const tick = () => {
    for (const chart of document.querySelectorAll(`${shown} .chart`)) {
      const bars = [...chart.querySelectorAll(".recharts-bar-rectangle path")];
      if (bars.length === 0) continue;
      const right = Math.max(...bars.map((bar) => bar.getBoundingClientRect().right));
      overruns.push(Math.round(right - chart.getBoundingClientRect().right));
    }
    if (sampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.stopOverrun = () => {
    sampling = false;
    return overruns;
  };
}

// Runs in the page: the slider card's bars' summed height on every frame for `ms`.
const sampleHeights = ({ shown, ms }) =>
  new Promise((done) => {
    const heights = [];
    const until = performance.now() + ms;
    const tick = () => {
      const bars = document.querySelectorAll(
        `${shown} .interactive-card .recharts-bar-rectangle path`,
      );
      heights.push(
        Math.round([...bars].reduce((sum, bar) => sum + bar.getBoundingClientRect().height, 0)),
      );
      if (performance.now() < until) requestAnimationFrame(tick);
      else done(heights);
    };
    requestAnimationFrame(tick);
  });

// What a drag's samples say: how many frames a bar spilled past its chart, and by how much.
const overrunOf = (samples) => ({
  frames: samples.length,
  spilled: samples.filter((px) => px > 0).length,
  worst: Math.max(0, ...samples),
});

// Runs in the page: the slider card's chart width, to show the drag reached it.
const sliderChartWidth = (shown) =>
  Math.round(
    document.querySelector(`${shown} .interactive-card .chart`).getBoundingClientRect().width,
  );

// Whether a run of heights eased: more than two distinct values before it settled.
const eased = (heights) => new Set(heights).size > 2;

// Opens September invoices with a sub-thread's lane beside it, so the slider card and a lane's
// chart are both on screen. Motion stays on, unlike the lever's other pages: the bug was an
// animation, and under reduced motion the card never eases at all.
async function openInvoices(browser) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    reducedMotion: "no-preference",
  });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  const side = page.locator('[data-slot="sidebar"]');
  await side.getByRole("link", { name: "September invoices", exact: true }).click();
  await page.locator(`${SHOWN} .interactive-card .recharts-bar-rectangle`).first().waitFor();
  await side.locator('[data-thread="child"]', { hasText: "Central depot" }).click();
  await page.waitForTimeout(800);
  return page;
}

// Drags the thread's divider slowly narrower, `STEPS` moves of `STEP_PX`.
async function dragNarrower(page) {
  const divider = page.locator(
    `${SHOWN} [role="separator"][aria-label="Resize the thread and the pane beside it"]`,
  );
  const box = await divider.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + 300];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= STEPS; i++) {
    // oxlint-disable-next-line no-await-in-loop -- a drag is one pointer step after another
    await page.mouse.move(x - i * STEP_PX, y);
    // oxlint-disable-next-line no-await-in-loop -- each step gets a frame to paint
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** The workspace lever's checks of charts under a resize, by id. */
export const chartResizeChecks = {
  // Dragging the thread's divider narrower keeps every chart's bars inside the chart on every
  // frame (Ethan); the slider card still eases its bars when the stop changes.
  async P38(browser) {
    const page = await openInvoices(browser);
    const before = await page.evaluate(sliderChartWidth, SHOWN);
    await page.evaluate(sampleOverrun, SHOWN);
    await dragNarrower(page);
    const after = await page.evaluate(sliderChartWidth, SHOWN);
    const drag = overrunOf(await page.evaluate(() => window.stopOverrun()));
    const card = page.locator(`${SHOWN} .interactive-card`);
    await card.getByRole("button", { name: "Delivered" }).click({ force: true });
    const heights = await page.evaluate(sampleHeights, { shown: SHOWN, ms: 600 });
    return {
      ok: before - after >= STEPS * STEP_PX * 0.5 && drag.spilled === 0 && eased(heights),
      detail: `the slider chart went ${before}px to ${after}px; ${drag.spilled} of ${drag.frames} frames spilled, worst ${drag.worst}px; a stop change eased through ${new Set(heights).size} heights`,
    };
  },
};
