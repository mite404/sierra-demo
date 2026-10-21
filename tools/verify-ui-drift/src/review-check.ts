import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium, firefox, webkit } from "playwright";
import type { Page } from "playwright";
import { createServer } from "vite";
import { checkAppComparison } from "./app-check.ts";
import { APP_SHELL } from "./app-target.ts";
import { checkComparison, checkStoryComparison } from "./comparison-check.ts";
import { reviewStateSchema } from "./report.ts";
import { ROOT } from "./workspace.ts";

async function checkRecoveryAppearance(page: Page, artifacts: string, engine: string) {
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Dark appearance" }).click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        "the title and restart command fit without horizontal scrolling",
      );
      assert.deepEqual(
        (await new AxeBuilder({ page }).analyze()).violations,
        [],
        `${engine} recovery ${width}px ${theme} axe`,
      );
      await page.screenshot({
        path: path.join(artifacts, `${engine}-recovery-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "Dark appearance" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function checkReportRecovery(page: Page, artifacts: string, engine: string) {
  await page.getByRole("region", { name: "Run coverage" }).waitFor();
  await page.route("**/api/state*", (route) => route.abort("connectionrefused"));
  await page.getByRole("button", { name: "Reload saved report" }).click();
  const recovery = page.getByRole("region", { name: "Verify server not running" });
  await recovery.waitFor({ timeout: 5000 });
  assert.equal(await page.getByRole("region", { name: "Run coverage" }).count(), 0);
  assert.equal(await recovery.locator("code").innerText(), "pnpm verify-ui-drift review");
  assert.equal(await page.getByRole("tab", { name: "Pixels", exact: true }).count(), 0);
  await checkRecoveryAppearance(page, artifacts, engine);
  await page.unroute("**/api/state*");
  await recovery.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("region", { name: "Run coverage" }).waitFor();
  assert.equal(await recovery.count(), 0, "reconnection restores the saved report");

  for (const response of [
    { status: 500, body: '{"error":"Unreadable report"}' },
    { status: 200, body: '{"report":' },
    { status: 200, body: '{"report":{},"stale":false,"runs":[]}' },
  ]) {
    await page.route("**/api/state*", (route) =>
      route.fulfill({ ...response, contentType: "application/json" }),
    );
    await page.getByRole("button", { name: "Reload saved report" }).click();
    await page.getByRole("heading", { name: "Report could not be read" }).waitFor();
    assert.equal(await recovery.count(), 0, "report errors are not described as a stopped server");
    assert.equal(await page.getByRole("region", { name: "Run coverage" }).count(), 0);
    await page.unroute("**/api/state*");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("region", { name: "Run coverage" }).waitFor();
  }

  await page.route("**/api/state*", (route) => route.abort("connectionrefused"));
  await page.reload();
  await recovery.waitFor();
  await page.unroute("**/api/state*");
  await page.getByRole("region", { name: "Run coverage" }).waitFor({ timeout: 15_000 });
  assert.equal(await recovery.count(), 0, "polling recovers without a reload or retry click");
  assert.equal(await page.title(), "Yaklabs UI Verification Tool");
  await page.getByRole("heading", { name: "Yaklabs UI Verification Tool", exact: true }).waitFor();
  assert.equal(await page.getByText("Internal Use Only", { exact: true }).isVisible(), true);
  console.log(
    `PASS ${engine}: disconnect, report errors, retry, polling recovery and 4 recovery axe scans`,
  );
}

async function checkResultList(page: Page) {
  await page.locator(".results-scroll tbody tr").nth(10).waitFor({ state: "attached" });
  for (const width of [1440, 820]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
    const visible = await page.locator(".results-scroll").evaluate((list) => {
      list.scrollTop = 0;
      const bottom = list.getBoundingClientRect().top + list.clientTop + list.clientHeight;
      return [...list.querySelectorAll("tbody tr")].filter(
        (row) => row.getBoundingClientRect().bottom <= bottom + 0.5,
      ).length;
    });
    assert.equal(visible, 10, `${width}px Pixels list shows ten complete rows before scrolling`);
    const reachesLast = await page.locator(".results-scroll").evaluate((list) => {
      list.scrollTop = list.scrollHeight;
      const last = list.querySelector("tbody tr:last-child");
      return last && last.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom;
    });
    assert.equal(reachesLast, true, "scrolling reaches the last capture");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

const artifacts = path.join(ROOT, ".artifacts/verify-ui-drift/review-check");
const server = await createServer({
  root: path.join(ROOT, "tools/verify-ui-drift"),
  configFile: path.join(ROOT, "tools/verify-ui-drift/vite.config.ts"),
  server: { host: "127.0.0.1", port: 6175, strictPort: true },
});
await mkdir(artifacts, { recursive: true });
await server.listen();
try {
  const stateUrl = new URL("http://127.0.0.1:6175/api/state");
  if (process.env.VERIFY_RUN) stateUrl.searchParams.set("run", process.env.VERIFY_RUN);
  const state = reviewStateSchema.parse(await (await fetch(stateUrl)).json());
  assert.ok(state.report, "Run the capture matrix before testing the review interface.");
  stateUrl.searchParams.set("run", state.report.id);
  for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await launcher.launch(
      engine === "chromium"
        ? { args: ["--disable-partial-raster", "--force-color-profile=srgb"] }
        : {},
    );
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await context.route("**/api/state*", (route) => route.continue({ url: stateUrl.href }));
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:6175");
      await checkReportRecovery(page, artifacts, engine);
      await checkResultList(page);
      await checkComparison(page, state);
      await checkStoryComparison(page, browser, artifacts, state);
      if (state.report.selectedStories.includes(APP_SHELL.id)) {
        await checkAppComparison(browser, state.report.id);
        console.log(
          `PASS ${engine}: full SPA, both themes, independent recapture and title-bar mutation`,
        );
      }
      await page.getByRole("region", { name: "Run coverage" }).waitFor();
      await page.getByRole("tab", { name: "Pixels", exact: true }).click();
      await page.getByLabel("Find a story").fill("button");
      await page.getByRole("combobox", { name: "Engine", exact: true }).selectOption("webkit");
      await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
      assert.equal(
        await page.locator("tbody tr").count(),
        1,
        "filters select exactly WebKit dark Button",
      );
      assert.equal(
        await page
          .locator(".results-scroll")
          .evaluate((list) => list.scrollHeight > list.clientHeight),
        false,
        "a short filtered list does not need vertical scrolling",
      );
      assert.match(
        await page.getByRole("region", { name: "Selected comparison" }).innerText(),
        /WEBKIT · DARK/u,
      );
      const popup = context.waitForEvent("page");
      await page
        .getByRole("region", { name: "Selected comparison" })
        .getByRole("link", { name: "Storybook" })
        .click();
      const storyPage = await popup;
      try {
        await storyPage
          .frameLocator("#storybook-preview-iframe")
          .getByRole("button", { name: "Show my work", exact: true })
          .first()
          .waitFor();
        assert.ok(
          storyPage.url().includes(`/storybook/${state.report.id}/`),
          "Storybook navigation uses this run's retained build",
        );
      } finally {
        await storyPage.close();
      }
      for (const dark of [false, true]) {
        if (dark) await page.getByRole("button", { name: "Dark appearance" }).click();
        for (const tab of ["Pixels", "Tokens", "Accessibility", "Comparator proof"]) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          await page.waitForFunction(
            (theme) => document.documentElement.dataset.theme === theme,
            dark ? "dark" : "light",
          );
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(
            () =>
              new Promise((resolve) => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(resolve);
                });
              }),
          );
          const result = await new AxeBuilder({ page }).analyze();
          assert.deepEqual(
            result.violations.map((finding) => ({
              id: finding.id,
              nodes: finding.nodes.map((node) => ({
                target: node.target,
                reason: node.failureSummary,
              })),
            })),
            [],
            `${engine} ${tab} ${dark ? "dark" : "light"} axe`,
          );
          await page.screenshot({
            path: path.join(
              artifacts,
              `${engine}-${tab.toLowerCase().replaceAll(" ", "-")}-${dark ? "dark" : "light"}.png`,
            ),
            fullPage: true,
          });
        }
      }
      await page.getByRole("tab", { name: "Tokens", exact: true }).click();
      await page.getByLabel("Find a token").fill("--ink");
      assert.equal(await page.locator(".token").count(), 1);
      const swatch = await page
        .locator(".swatch")
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      await page.getByRole("button", { name: "OKLCH", exact: true }).click();
      assert.match(await page.locator(".color-value").innerText(), /^oklch\(/u);
      assert.equal(
        await page
          .locator(".swatch")
          .evaluate((element) => getComputedStyle(element).backgroundColor),
        swatch,
        "notation does not recolor the swatch",
      );
      await page.getByRole("tab", { name: "Accessibility", exact: true }).click();
      for (const name of ["Apple", "Microsoft", "Material"]) {
        await page.getByRole("button", { name, exact: true }).click();
        assert.equal(
          await page.getByRole("button", { name, exact: true }).getAttribute("aria-pressed"),
          "true",
        );
        assert.match(await page.locator("p.profile-note").innerText(), new RegExp(name, "u"));
      }
      await page.getByRole("tab", { name: "Pixels", exact: true }).click();
      await page.getByLabel("Find a story").fill("does-not-exist");
      assert.equal(await page.locator("tbody tr").count(), 0);
      assert.match(await page.locator(".empty").innerText(), /No captures match/u);
      assert.deepEqual(errors, [], `${engine} page errors`);
      console.log(
        `PASS ${engine}: wipe pixel assertions, pointer/keyboard inspection, shared framing, missing/error states, real radius mutation, narrow layout, 9 axe scans, filters and notation`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
