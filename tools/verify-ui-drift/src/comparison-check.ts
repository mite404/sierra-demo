import assert from "node:assert/strict";
import path from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import type { Browser, Locator, Page } from "playwright";
import { PNG } from "pngjs";
import { openStory, screenshot } from "./capture.ts";
import { comparePng } from "./pixels.ts";
import type { RenderedCell, ReviewState } from "./report.ts";
import { ROOT, serveBuild } from "./workspace.ts";

function fixture(width: number, color: number[]) {
  const image = new PNG({ width, height: 180 });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([245, 242, 235, 255], offset);
  }
  for (let y = 30; y < 100; y++) {
    for (let x = 40; x < 160; x++) {
      image.data.set(color, (y * width + x) * 4);
    }
  }
  return PNG.sync.write(image);
}

function samplePixel(element: Element) {
  if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected pixel canvas");
  const context = element.getContext("2d");
  if (!context) throw new Error("Expected drawing context");
  return Array.from(context.getImageData(96, 56, 1, 1).data);
}

async function measuredWidth(element: Locator) {
  const bounds = await element.boundingBox();
  assert.ok(bounds, "measurement requires a visible element");
  return bounds.width;
}

async function waitForCoordinate(page: Page, axis: "X" | "Y", value: string) {
  await page.waitForFunction(
    (target) =>
      document.querySelector<HTMLInputElement>(`input[aria-label="Inspect ${target.axis}"]`)
        ?.value === target.value,
    { axis, value },
    { timeout: 5000 },
  );
}

/** Exercises image comparison through the review UI with asymmetric, known pixels. */
export async function checkComparison(page: Page, state: ReviewState) {
  assert.ok(state.report);
  const captured = state.report.cells.find((cell) => cell.kind === "rendered");
  assert.ok(captured?.kind === "rendered");
  const baseline = fixture(320, [32, 64, 48, 255]);
  const current = fixture(400, [188, 96, 64, 255]);
  let cell: RenderedCell = {
    ...captured,
    current: { ...captured.current, path: "fixture-current.png" },
    pixels: {
      kind: "changed",
      baseline: { path: "fixture-baseline.png", sha256: "a".repeat(64) },
      diff: { path: "fixture-diff.png", sha256: "b".repeat(64) },
      delta: { changedPixels: 8400, totalPixels: 72000, resized: true },
    },
  };
  await page.route("**/api/state*", (route) =>
    route.fulfill({ json: { ...state, stale: false, report: { ...state.report, cells: [cell] } } }),
  );
  await page.route("**/fixture-*.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: route.request().url().endsWith("fixture-baseline.png") ? baseline : current,
    }),
  );
  await page.reload();
  const slider = page.getByRole("slider", { name: "Before and after split" });
  const plane = page.locator(".comparison-plane");
  await slider.waitFor({ timeout: 5000 });
  assert.equal(
    await page.locator(".wipe-divider svg").count(),
    1,
    "the wipe handle renders a real SVG glyph, not a font-dependent arrow",
  );
  assert.equal(
    await page.locator(".comparison-plane .image-tag").count(),
    0,
    "baseline/current labels must not sit inside the pixel plane",
  );
  assert.equal(
    await page.locator(".comparison-labels .image-tag").count(),
    2,
    "baseline/current labels render outside the image, in their own row",
  );
  await slider.focus();
  await slider.press("Home");
  assert.equal(await slider.inputValue(), "0");
  await slider.press("End");
  assert.equal(await slider.inputValue(), "100");
  await slider.press("ArrowLeft");
  assert.equal(await slider.inputValue(), "99");
  const bounds = await slider.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + 20 + (bounds.width - 40) * 0.99, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 20 + (bounds.width - 40) * 0.3, bounds.y + bounds.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  assert.ok(
    Math.abs(Number(await slider.inputValue()) - 30) < 4,
    "dragging from the visible handle moves the divider",
  );
  await page.getByLabel("Image zoom").selectOption("1");
  assert.equal(await measuredWidth(plane), 400, "shared plane keeps the larger width");
  assert.equal(
    await measuredWidth(page.getByAltText("Baseline capture")),
    320,
    "a smaller reference must not stretch to match the current image",
  );
  const planeBounds = await plane.boundingBox();
  assert.ok(planeBounds);
  await page.mouse.move(planeBounds.x + 300, planeBounds.y + 90);
  await page.mouse.down();
  const dragStartX = await page.getByLabel("Inspect X").inputValue();
  const dragStartY = await page.getByLabel("Inspect Y").inputValue();
  await page.mouse.move(planeBounds.x + 250, planeBounds.y + 60, { steps: 4 });
  assert.notEqual(
    `${await page.getByLabel("Inspect X").inputValue()},${await page.getByLabel("Inspect Y").inputValue()}`,
    `${dragStartX},${dragStartY}`,
    "dragging mid-gesture (away from the handle) updates the inspection point live",
  );
  await page.mouse.move(planeBounds.x + 250, planeBounds.y + planeBounds.height * 4, {
    steps: 4,
  });
  await waitForCoordinate(page, "Y", "179");
  assert.equal(
    await page.getByLabel("Inspect Y").inputValue(),
    "179",
    "pointer capture keeps inspecting past the plane's bottom edge, clamped to the frame",
  );
  await page.mouse.up();
  assert.ok(
    Math.abs(Number(await slider.inputValue()) - 30) < 4,
    "dragging away from the handle must not move the wipe split",
  );
  const afterReleaseX = await page.getByLabel("Inspect X").inputValue();
  await page.mouse.move(planeBounds.x + 350, planeBounds.y + 150);
  assert.equal(
    await page.getByLabel("Inspect X").inputValue(),
    afterReleaseX,
    "hovering without a pressed button leaves the inspection point untouched",
  );
  for (const [key, expected] of [
    ["Home", [188, 96, 64, 255]],
    ["End", [32, 64, 48, 255]],
  ] as const) {
    await slider.press(key);
    const rendered = PNG.sync.read(await plane.screenshot({ animations: "disabled" }));
    const offset = (100 * rendered.width + 160) * 4;
    assert.deepEqual(
      Array.from(rendered.data.subarray(offset, offset + 4)),
      [...expected],
      `${key} reveals the correct image layer`,
    );
  }
  await plane.click({ position: { x: 40, y: 30 } });
  assert.ok(Math.abs(Number(await page.getByLabel("Inspect X").inputValue()) - 40) <= 1);
  assert.ok(Math.abs(Number(await page.getByLabel("Inspect Y").inputValue()) - 30) <= 1);
  assert.equal(
    await slider.inputValue(),
    "100",
    "clicking the image away from the handle must not move the wipe split",
  );
  await page.getByLabel("Inspect X").fill("40");
  await page.getByLabel("Inspect Y").fill("30");
  for (const [label, expected] of [
    ["Baseline pixels", [32, 64, 48, 255]],
    ["Current pixels", [188, 96, 64, 255]],
  ] as const) {
    const pixel = await page.getByRole("img", { name: label, exact: true }).evaluate(samplePixel);
    assert.deepEqual(pixel, [...expected], `${label} samples the selected source coordinate`);
  }
  await page.getByLabel("Inspect X").fill("350");
  await page.getByLabel("Inspect Y").fill("30");
  const outside = await page
    .getByRole("img", { name: "Baseline pixels", exact: true })
    .evaluate(samplePixel);
  assert.deepEqual(
    outside,
    [0, 0, 0, 0],
    "pixels outside a smaller reference remain absent, not stretched",
  );
  const target = page.getByRole("button", { name: "Inspect capture pixels.", exact: false });
  await target.focus();
  await target.press("ArrowRight");
  await target.press("Shift+ArrowUp");
  assert.equal(await page.getByLabel("Inspect X").inputValue(), "351");
  assert.equal(await page.getByLabel("Inspect Y").inputValue(), "20");
  await page.getByLabel("Inspect X").fill("9999");
  assert.equal(
    await page.getByLabel("Inspect X").inputValue(),
    "399",
    "typed X still clamps to the frame width",
  );
  await page.getByLabel("Inspect Y").fill("-50");
  assert.equal(
    await page.getByLabel("Inspect Y").inputValue(),
    "0",
    "typed Y still clamps to the frame height",
  );
  await page.getByLabel("Inspect X").fill("50");
  await page.getByLabel("Inspect Y").fill("50");
  const xInput = page.getByLabel("Inspect X");
  const xBounds = await xInput.boundingBox();
  assert.ok(xBounds);
  const xCenter = { x: xBounds.x + xBounds.width / 2, y: xBounds.y + xBounds.height / 2 };
  await page.mouse.move(xCenter.x, xCenter.y);
  await page.mouse.down();
  await page.mouse.move(xCenter.x + 25, xCenter.y, { steps: 6 });
  await waitForCoordinate(page, "X", "75");
  assert.equal(
    await xInput.inputValue(),
    "75",
    "dragging right on the X field scrubs it up, like a Figma numeric field",
  );
  await page.mouse.move(xCenter.x + 25, xCenter.y - 60, { steps: 6 });
  assert.equal(
    await xInput.inputValue(),
    "75",
    "vertical movement during a scrub must not change the value",
  );
  await page.mouse.up();
  assert.equal(
    await page.getByLabel("Inspect Y").inputValue(),
    "50",
    "scrubbing X must not touch Y",
  );
  await xInput.fill("395");
  await page.mouse.move(xCenter.x, xCenter.y);
  await page.mouse.down();
  await page.mouse.move(xCenter.x + 50, xCenter.y, { steps: 6 });
  await waitForCoordinate(page, "X", "399");
  assert.equal(
    await xInput.inputValue(),
    "399",
    "scrub clamps at the frame width like typed input",
  );
  await page.mouse.up();
  await xInput.fill("40");
  assert.equal(
    await xInput.inputValue(),
    "40",
    "a plain click-to-edit still allows typing an exact value after a scrub",
  );
  const yInput = page.getByLabel("Inspect Y");
  const yBounds = await yInput.boundingBox();
  assert.ok(yBounds);
  const yCenter = { x: yBounds.x + yBounds.width / 2, y: yBounds.y + yBounds.height / 2 };
  await page.mouse.move(yCenter.x, yCenter.y);
  await page.mouse.down();
  await page.mouse.move(yCenter.x, yCenter.y - 35, { steps: 4 });
  assert.equal(await yInput.inputValue(), "50", "vertical-only drag on Y does nothing");
  await page.mouse.move(yCenter.x - 17, yCenter.y - 35, { steps: 4 });
  await waitForCoordinate(page, "Y", "33");
  assert.equal(await yInput.inputValue(), "33", "Y scrubs left/right, not up/down");
  await page.mouse.up();
  assert.equal(await xInput.inputValue(), "40", "Y scrub preserves X");
  await yInput.click();
  assert.equal(await yInput.inputValue(), "33", "a plain click does not start scrubbing");
  await yInput.press("ArrowUp");
  assert.equal(await yInput.inputValue(), "34", "numeric keyboard editing remains available");
  await page.getByLabel("Image framing").selectOption("content");
  assert.equal(
    await measuredWidth(plane),
    168,
    "content framing removes only shared empty margins",
  );
  await plane.click({ position: { x: 24, y: 24 } });
  assert.ok(
    Math.abs(Number(await page.getByLabel("Inspect X").inputValue()) - 40) <= 1,
    "framed coordinates include the source offset",
  );
  assert.ok(Math.abs(Number(await page.getByLabel("Inspect Y").inputValue()) - 30) <= 1);
  await page.getByRole("button", { name: "Difference", exact: true }).click();
  await page.getByAltText("Pixel difference capture").waitFor();
  assert.equal(await slider.count(), 0, "difference mode does not offer an irrelevant wipe");
  cell = { ...cell, pixels: { kind: "missing-baseline" } };
  await page.reload();
  await page.getByRole("img", { name: "Current pixels", exact: true }).waitFor();
  assert.equal(await slider.count(), 0, "missing reference cannot offer a comparison");
  assert.equal(
    await page.getByRole("button", { name: "Difference", exact: true }).isDisabled(),
    true,
  );
  assert.match(await page.getByLabel("Pixel inspector").innerText(), /No comparison evidence/u);
  await page.route("**/fixture-current.png", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "Capture images could not be loaded" }).waitFor();
  assert.equal(
    await page.locator(".comparison-plane").count(),
    0,
    "failed images cannot retain a previous comparison",
  );
  await page.unroute("**/fixture-current.png");
  await page.unroute("**/api/state*");
  await page.unroute("**/fixture-*.png");
  await page.reload();
}

/** Captures a deliberate CSS regression in the real Button story, without editing references. */
export async function checkStoryComparison(
  page: Page,
  browser: Browser,
  artifacts: string,
  state: ReviewState,
) {
  const report = state.report;
  assert.ok(report);
  const engine = browser.browserType().name();
  const cell = report.cells.find(
    (item) =>
      item.kind === "rendered" &&
      item.engine === engine &&
      item.theme === "light" &&
      item.story === "foundations-button--default",
  );
  assert.ok(cell?.kind === "rendered");
  const server = await serveBuild(path.join(ROOT, ".artifacts/verify-ui-drift/builds", report.id));
  try {
    const story = await openStory(browser, server.url, cell.story, "light");
    try {
      const clean = await screenshot(story.page);
      const button = await story.page.locator(".btn").first().boundingBox();
      assert.ok(button);
      await story.page.addStyleTag({ content: ".btn { border-radius: 12px !important; }" });
      const changed = await screenshot(story.page);
      const comparison = comparePng(clean, changed);
      assert.ok(
        comparison.delta.changedPixels > 0,
        "a real radius mutation must change captured pixels",
      );
      const testCell: RenderedCell = {
        ...cell,
        current: { ...cell.current, path: "radius-current.png" },
        pixels: {
          kind: "changed",
          baseline: { ...cell.current, path: "radius-baseline.png" },
          diff: { ...cell.current, path: "radius-diff.png" },
          delta: comparison.delta,
        },
      };
      await page.route("**/api/state*", (route) =>
        route.fulfill({
          json: {
            ...state,
            stale: true,
            report: {
              ...report,
              errors: [
                "Controlled test: Button radius changed from 4px to 12px in an isolated story. These captures are not production references.",
              ],
              cells: [testCell, ...report.cells.filter((item) => item.key !== cell.key)],
            },
          },
        }),
      );
      await page.route("**/radius-*.png", (route) =>
        route.fulfill({
          contentType: "image/png",
          body: route.request().url().endsWith("radius-baseline.png")
            ? clean
            : route.request().url().endsWith("radius-diff.png")
              ? comparison.diff
              : changed,
        }),
      );
      await page.reload();
      await page.getByRole("slider", { name: "Before and after split" }).waitFor();
      await page
        .getByLabel("Inspect X")
        .fill(String(Math.round((button.x + button.width - 3) * 2)));
      await page.getByLabel("Inspect Y").fill(String(Math.round((button.y + 3) * 2)));
      await page.screenshot({
        path: path.join(artifacts, `${engine}-radius-wipe.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Difference", exact: true }).click();
      await page.getByAltText("Pixel difference capture").waitFor();
      await page.screenshot({
        path: path.join(artifacts, `${engine}-radius-difference.png`),
        fullPage: true,
      });
      const result = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(
        result.violations.map((finding) => finding.id),
        [],
        `${engine} changed-image accessibility`,
      );
      await page.setViewportSize({ width: 720, height: 1000 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        "narrow review has no page-level horizontal overflow",
      );
      await page.screenshot({
        path: path.join(artifacts, `${engine}-radius-narrow.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    } finally {
      await story.page.context().close();
    }
  } finally {
    await server.close();
    await page.unroute("**/api/state*");
    await page.unroute("**/radius-*.png");
    await page.reload();
  }
}
