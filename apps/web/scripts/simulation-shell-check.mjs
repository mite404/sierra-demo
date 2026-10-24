import assert from "node:assert/strict";

/**
 * Checks the rendered frame and reachable scroll regions without scrolling the document.
 * @throws When the rendered lesson violates its frame or accessibility contract.
 */
export async function verifyShell(page) {
  const facts = await page.evaluate(() => {
    const frame = document.querySelector('[data-slot="window"]');
    if (!frame) return null;
    const chrome = frame.querySelector('[data-slot="title-bar"]');
    const main = [...frame.querySelectorAll("main")].filter((node) => node.checkVisibility());
    // Browser evaluation cannot access helpers in the Node process.
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const rect = (node) => {
      const { x, y, width, height, bottom, right } = node.getBoundingClientRect();
      return { x, y, width, height, bottom, right };
    };
    const lights = frame.querySelector('[data-slot="traffic-lights"]');
    const visible = (selector) =>
      [...frame.querySelectorAll(selector)].filter((node) => node.checkVisibility());
    return {
      frame: rect(frame),
      chrome: rect(chrome),
      mains: main.map(rect),
      lights: lights.checkVisibility(),
      lightCount: lights.children.length,
      decorative:
        lights.getAttribute("aria-hidden") === "true" &&
        lights.querySelectorAll("button, a, [tabindex]").length === 0,
      regions: visible(".thread-panel, .lab-pinned-summary, .lab-run-scroll").map(rect),
      scroll: { x: scrollX, y: scrollY, width: document.documentElement.scrollWidth },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert.ok(facts, "The lesson has a desktop window, including during recovery");
  const { width, height } = facts.viewport;
  const desktop = width >= 768;
  const inset = desktop ? 16 : 0;
  assert.deepEqual(
    facts.frame,
    {
      x: inset,
      y: inset,
      width: width - 2 * inset,
      height: height - 2 * inset,
      bottom: height - inset,
      right: width - inset,
    },
    `Frame geometry at ${width}×${height}`,
  );
  assert.equal(facts.chrome.height, 44, "Title bar does not shrink");
  assert.equal(facts.lights, desktop, "Traffic lights appear only on the desktop frame");
  assert.equal(facts.lightCount, 3);
  assert.equal(facts.decorative, true, "Traffic lights have no actions or focus stops");
  assert.equal(facts.mains.length, 1, "Only the current main landmark is visible");
  for (const main of facts.mains) {
    assert.equal(main.y, facts.chrome.bottom, "Every screen starts below the title bar");
    assert.equal(
      main.bottom,
      height - inset - (desktop ? 1 : 0),
      "The lesson uses frame height, not viewport height",
    );
  }
  assert.deepEqual(facts.scroll, { x: 0, y: 0, width }, "Focus cannot scroll the desk");
  if (desktop && width > 800) {
    for (const region of facts.regions) {
      assert.ok(
        region.height > 0 && region.y >= facts.chrome.bottom && region.bottom <= facts.frame.bottom,
        "Conversation and summary fit inside the frame",
      );
    }
  }
}

/**
 * Sweeps both themes and both sides of layout breakpoints, then restores the screen.
 * @throws When any generated viewport violates the shell contract.
 */
export async function verifyShellSizes(page) {
  const original = page.viewportSize();
  const originalScheme = await page.evaluate(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  try {
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      for (const width of [390, 767, 768, 769, 799, 800, 801, 1024, 1280, 1440]) {
        for (const height of [720, 900]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          await verifyShell(page);
        }
      }
    }
  } finally {
    await page.emulateMedia({ colorScheme: originalScheme });
    await page.setViewportSize(original);
  }
}
