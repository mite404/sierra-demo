// Checks for the title bar's decorative traffic lights, on a desktop window.
import { shotPath } from "./lever.mjs";
import { openDesk } from "./sidebar-checks.mjs";

// The traffic lights against the title bar, as [x, y, width, height] from its top left (ADR-094,
// amended): 14px each, grown about the centres they had at 12px (22px down the 44px bar, 20px
// apart from 22px in), in the 76px group they had, with the sidebar toggle 8px after it.
const LIGHTS_AT = {
  lights: [
    [15, 15, 14, 14],
    [35, 15, 14, 14],
    [55, 15, 14, 14],
  ],
  group: [0, 16, 76, 12],
  toggle: 84,
};

// Runs in the page: the lights, their group and the toggle's left, against the title bar.
function lightsLayout() {
  const bar = document.querySelector('header[data-slot="title-bar"]').getBoundingClientRect();
  const group = document.querySelector('[data-slot="traffic-lights"]');
  const at = (el) => {
    const box = el.getBoundingClientRect();
    return [box.x - bar.x, box.y - bar.y, box.width, box.height];
  };
  return {
    lights: [...group.children].map((light) => at(light)),
    group: at(group),
    toggle: at(document.querySelector('header [data-sidebar="trigger"]'))[0],
  };
}

// One window with the sidebar open or collapsed: where the lights sit, and their picture.
async function lightsWith(browser, side) {
  const { context, page } = await openDesk(browser, { side });
  await page.mouse.move(900, 400);
  const layout = await page.evaluate(lightsLayout);
  const bar = await page.locator('header[data-slot="title-bar"]').boundingBox();
  await page.screenshot({
    path: shotPath(`P26-lights-${side}`),
    clip: { x: bar.x, y: bar.y, width: 160, height: bar.height },
  });
  await context.close();
  return { side, layout };
}

/** The workspace lever's checks of the traffic lights, by id. */
export const lightsChecks = {
  // The traffic lights are 14px, each grown about the centre it had at 12px (ADR-094, amended):
  // their boxes, their group's and the toggle's left sit where LIGHTS_AT says against the bar,
  // with the sidebar open and collapsed.
  async P26(browser) {
    const want = JSON.stringify(LIGHTS_AT);
    const seen = [await lightsWith(browser, "open"), await lightsWith(browser, "closed")];
    return {
      ok: seen.every(({ layout }) => JSON.stringify(layout) === want),
      detail: seen
        .map(({ side, layout }) => `${side} ${JSON.stringify(layout)}`)
        .concat(`want ${want}`)
        .join("; "),
    };
  },
};
