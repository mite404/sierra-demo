import { AxeBuilder } from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { colorViews, contrast } from "./colors.ts";
import { PROOF_DIFFERENCE_RGB } from "./diff-palette.ts";
import { comparePng } from "./pixels.ts";
import type { Engine, Fingerprint, Probe, Report, Theme } from "./report.ts";

const PAIRS = [
  ["--ink", "--paper", 4.5],
  ["--soft-ink", "--paper", 4.5],
  ["--faint-ink", "--paper-deep", 4.5],
  ["--rule", "--paper", 3],
  ["--focus", "--paper", 3],
  ["--on-accent", "--moss", 4.5],
  ["--on-attention-soft", "--attention-bg", 4.5],
  ["--attention-hover-ink", "--attention-hover", 4.5],
] as const;

/** Opens an isolated story using the theme and readiness rules of verify-storybook-component/shoot.mjs.
 * @throws On empty renders, Storybook overlays, page errors, or console errors.
 */
export async function openStory(browser: Browser, base: string, story: string, theme: Theme) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    colorScheme: theme,
    locale: "en-US",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
  );
  try {
    // a11y.manual keeps the addon's own axe run out of this page: its axe chunk replaces
    // window.axe on load and raced this tool's AxeBuilder, failing runs at random.
    await page.goto(
      `${base}/iframe.html?id=${encodeURIComponent(story)}&viewMode=story&globals=theme:${theme};a11y.manual:!true`,
    );
    await page.waitForFunction(
      () =>
        document.body.classList.contains("sb-show-errordisplay") ||
        (document.querySelector("#storybook-root")?.childElementCount ?? 0) > 0,
      null,
      { timeout: 20_000 },
    );
    if (await page.locator(".sb-errordisplay:visible").count())
      throw new Error("Storybook error overlay");
    await page.waitForFunction(
      (expected) => document.documentElement.dataset.theme === expected,
      theme,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#storybook-root").waitFor({ state: "visible" });
    if (
      (await page.locator("#storybook-root").innerText()).trim().length === 0 &&
      (await page
        .locator("#storybook-root svg, #storybook-root canvas, #storybook-root img")
        .count()) === 0
    ) {
      throw new Error("Story rendered no text or visual content");
    }
    if (errors.length > 0) throw new Error(errors.join("\n"));
    return { page, errors };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/** Takes a settled full-page image in device pixels. */
export async function screenshot(page: Page) {
  return page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
}

/** Reuses Storybook's axe engine on the real rendered story. Review-needed results stay separate. */
export async function accessibility(page: Page, scope = "#storybook-root") {
  const result = await new AxeBuilder({ page }).include(scope).analyze();
  const summarize = (finding: (typeof result.violations)[number]) => ({
    id: finding.id,
    help: finding.help,
    impact: finding.impact ?? "unknown",
    nodes: finding.nodes.length,
  });
  return {
    violations: result.violations.map(summarize),
    incomplete: result.incomplete.map(summarize),
    passes: result.passes.length,
  };
}

/** Measures root and contextual color tokens without modifying their definitions. */
export async function sampleTokens(page: Page, names: string[], theme: Theme) {
  const samples = await page.evaluate((tokens) => {
    const rows: { name: string; scope: string; computed: string }[] = [];
    for (const scope of [":root", ".attention-surface", ".chrome-surface"]) {
      const host = document.createElement("div");
      if (scope !== ":root") host.className = scope.slice(1);
      const probe = document.createElement("span");
      host.append(probe);
      document.body.append(host);
      for (const name of tokens) {
        const value = getComputedStyle(probe).getPropertyValue(name).trim();
        if (!value || !CSS.supports("color", value)) continue;
        probe.style.color = value;
        rows.push({ name, scope, computed: getComputedStyle(probe).color });
      }
      host.remove();
    }
    return rows;
  }, names);
  const tokens: Report["tokens"] = samples.flatMap((sample) => {
    const color = colorViews(sample.computed);
    return color ? [{ ...sample, theme, color }] : [];
  });
  const contrasts: Report["contrasts"] = PAIRS.map(([foreground, background, minimum]) => ({
    foreground,
    background,
    theme,
    minimum,
    measurement: contrast({
      foreground: tokens.find((t) => t.scope === ":root" && t.name === foreground)?.computed ?? "",
      background: tokens.find((t) => t.scope === ":root" && t.name === background)?.computed ?? "",
    }),
  }));
  return { tokens, contrasts };
}

/** Proves the real screenshot path sees both color and geometry changes, without baseline writes.
 * @throws When the sentinel cannot render or an injected style does not reach the page.
 */
export async function mutationProof(
  browser: Browser,
  base: string,
  engine: Engine,
  fingerprint: Fingerprint,
  directory: string,
): Promise<Probe> {
  const { page, errors } = await openStory(browser, base, "foundations-button--default", "light");
  try {
    const clean = await screenshot(page);
    const control = comparePng(clean, await screenshot(page));
    const colorStyle = await page.addStyleTag({
      content: ".btn { color: rgb(201 0 135) !important; }",
    });
    const color = comparePng(clean, await screenshot(page), { diffColor: PROOF_DIFFERENCE_RGB });
    await colorStyle.evaluate((element) => element.parentNode?.removeChild(element));
    const geometryStyle = await page.addStyleTag({
      content: ".btn { padding-inline: 31px !important; }",
    });
    const geometry = comparePng(clean, await screenshot(page), { diffColor: PROOF_DIFFERENCE_RGB });
    await geometryStyle.evaluate((element) => element.parentNode?.removeChild(element));
    if (errors.length > 0) throw new Error(errors.join("\n"));
    await writeFile(path.join(directory, `${engine}.control.png`), clean);
    await writeFile(path.join(directory, `${engine}.color-diff.png`), color.diff);
    await writeFile(path.join(directory, `${engine}.geometry-diff.png`), geometry.diff);
    return {
      engine,
      fingerprint,
      control: control.delta,
      color: color.delta,
      geometry: geometry.delta,
    };
  } finally {
    await page.context().close();
  }
}
