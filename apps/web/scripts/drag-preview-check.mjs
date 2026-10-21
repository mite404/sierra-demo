import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { arg, chromium, ROOT } from "./harness.mjs";
import { canvasOf, mainPanel, makeLane, laneTitles, selectReply } from "./canvas-checks.mjs";

const base = arg("--base", "http://127.0.0.1:5173");
const out = arg("--out", path.join(ROOT, ".artifacts/drag-preview"));
mkdirSync(out, { recursive: true });

async function liftCard(page) {
  const heading = mainPanel(page).locator(".card-heading[data-carry]").first();
  await heading.scrollIntoViewIfNeeded();
  const box = await heading.boundingBox();
  const from = { x: box.x + 30, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 14, from.y + 12, { steps: 3 });
  await page.waitForFunction(() => document.documentElement.dataset.carrying === "card");
}

async function previewBox(page) {
  const preview = canvasOf(page).locator("[data-drop-preview]");
  await preview.waitFor();
  await preview.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished)),
  );
  return preview.boundingBox();
}

function canvasLook(page) {
  return canvasOf(page).evaluate((el) => getComputedStyle(el).boxShadow);
}

async function noDrag(page) {
  await page.waitForFunction(() => !Object.hasOwn(document.documentElement.dataset, "carrying"));
  assert.equal(
    await page.locator(".carry-ghost, [data-drop-preview], [data-drop-marker]").count(),
    0,
  );
}

async function reorderCheck(page) {
  const canvas = canvasOf(page);
  const collapse = canvas.getByRole("button", { name: "Collapse lane", exact: true });
  while (await collapse.count()) await collapse.first().click();
  await canvas.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const lanes = canvas.locator(":scope > article");
  const before = await laneTitles(page);
  const first = await lanes.first().boundingBox();
  const last = await lanes.last().boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + 100);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 4, first.y + 100, { steps: 12 });
  await page.locator(".lane-ghost").waitFor();
  await lanes
    .nth(1)
    .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const neighbor = await lanes.nth(1).boundingBox();
  assert.ok(
    Math.abs(neighbor.x - first.x) < 1,
    "Reorder neighbor aligns with its future slot, including the 18px gap",
  );
  await lanes
    .first()
    .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const destination = await lanes.first().boundingBox();
  await page.screenshot({ path: path.join(out, "reorder.png") });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector(".lane-ghost"));
  assert.deepEqual(await laneTitles(page), [...before.slice(1), before[0]]);
  await lanes
    .last()
    .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const dropped = await lanes.last().boundingBox();
  assert.ok(
    Math.abs(dropped.x - destination.x) < 1,
    `Reorder drop ${dropped.x} matches its ghost ${destination.x}`,
  );
}

async function check(browser, theme, motion) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: motion,
    colorScheme: theme,
    recordVideo: arg("--record", "") ? { dir: out, size: { width: 1600, height: 900 } } : undefined,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/t/profit`);
    await mainPanel(page).locator(".card-heading[data-carry]").first().waitFor();
    const canvas = canvasOf(page);
    const rest = await canvasLook(page);
    await liftCard(page);
    const during = await canvasLook(page);
    const target = await canvas.boundingBox();
    await page.mouse.move(target.x + 90, target.y + 130, { steps: 12 });
    await page.screenshot({ path: path.join(out, `${theme}-empty.png`) });
    console.log(
      JSON.stringify({
        theme,
        outlineAtLift: during !== rest,
        previews: await canvas.locator("[data-drop-preview]").count(),
        markers: await canvas.locator("[data-drop-marker]").count(),
      }),
    );
    assert.notEqual(during, rest, "Canvas outline must appear before the card enters the canvas");
    const emptyPreview = await previewBox(page);
    assert.equal(await canvas.locator("[data-drop-marker]").count(), 0, "No insertion line");
    assert.equal(await canvas.locator("[data-drop-preview]").getAttribute("aria-hidden"), "true");
    assert.equal(await canvas.locator("[data-drop-preview]").evaluate((el) => el.inert), true);
    assert.equal(
      await canvas.locator("[data-drop-preview]").evaluate((el) => getComputedStyle(el).opacity),
      "0.35",
    );
    await page.mouse.up();
    await canvas.locator(":scope > article").waitFor();
    await noDrag(page);
    const dropped = await canvas.locator(":scope > article").boundingBox();
    assert.ok(Math.abs(dropped.x - emptyPreview.x) < 2, "Drop matches preview left edge");
    assert.ok(Math.abs(dropped.width - emptyPreview.width) < 2, "Drop matches preview width");

    await makeLane(page, "Review notes");
    await canvas
      .locator(":scope > article")
      .first()
      .getByRole("button", { name: "Collapse lane" })
      .click();
    await canvas.evaluate((el) => {
      el.scrollLeft = 0;
    });
    const before = await laneTitles(page);
    const second = await canvas.locator(":scope > article").nth(1).boundingBox();
    await liftCard(page);
    const between = { x: second.x + 12, y: second.y + 110 };
    await page.mouse.move(between.x, between.y, { steps: 12 });
    const slot = await previewBox(page);
    await page.mouse.move(between.x + 1, between.y, { steps: 2 });
    const stable = await previewBox(page);
    assert.ok(Math.abs(slot.x - stable.x) < 2, "Shifted neighbors must not move the target slot");
    await page.mouse.move(between.x, target.y + target.height - 100, { steps: 12 });
    await page.screenshot({ path: path.join(out, `${theme}-between.png`) });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await noDrag(page);
    assert.deepEqual(await laneTitles(page), before, "Escape must preserve order and count");
    assert.equal(await canvasLook(page), rest, "Escape removes the canvas outline");

    await liftCard(page);
    await page.mouse.move(between.x, between.y, { steps: 12 });
    await previewBox(page);
    await page.mouse.move(target.x - 70, between.y, { steps: 8 });
    assert.equal(
      await canvas.locator("[data-drop-preview]").count(),
      0,
      "Leaving clears the target preview",
    );
    assert.notEqual(await canvasLook(page), rest, "Outline stays while still carrying outside");
    await page.mouse.move(between.x, between.y, { steps: 8 });
    await previewBox(page);
    await page.mouse.up();
    await page.waitForFunction(
      () => document.querySelectorAll(".canvas:not([inert]) > article").length === 3,
    );
    assert.deepEqual(await laneTitles(page), [before[0], "Last week's profit by day", before[1]]);
    await noDrag(page);

    await canvas.evaluate((el) => {
      el.scrollLeft = 0;
    });
    const selected = await selectReply(page, 33);
    await page.mouse.move(selected.x, selected.y);
    await page.mouse.down();
    await page.mouse.move(selected.x + 15, selected.y + 10, { steps: 3 });
    await page.mouse.move(target.x + 25, target.y + 140, { steps: 12 });
    await previewBox(page);
    assert.match(await canvas.locator("[data-drop-preview]").innerText(), /New thread/);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await noDrag(page);
    await reorderCheck(page);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${theme}/${motion}: early outline, snapped preview, exact drop, stable slot, cancel, leave/re-enter, text carry`,
    );
  } finally {
    await context.close();
    if (page.video()) await page.video().saveAs(path.join(out, `${theme}-drag.webm`));
  }
}

const browser = await chromium.launch();
try {
  await check(browser, "light", "no-preference");
  await check(browser, "light", "reduce");
} finally {
  await browser.close();
}
