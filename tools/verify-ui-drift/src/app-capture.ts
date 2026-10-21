import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright";
import { APP_SHELL } from "./app-target.ts";
import type { Theme } from "./report.ts";
import { command, ROOT, serveBuild } from "./workspace.ts";

/** Builds the production SPA into a run-owned directory, with no auth or remote model.
 * @throws On build or server startup failure. The caller must close the returned server.
 */
export async function buildApp(run: string, directory: string) {
  // Prerendered server imports must resolve against apps/web/node_modules under pnpm.
  const build = path.join(ROOT, "apps/web/.artifacts/verify-ui-drift", run);
  const result = await command("pnpm", ["--filter", "web", "build"], {
    ...process.env,
    WEB_BUILD_DIRECTORY: build,
    VITE_AUTH: "none",
    VITE_AGENT: "lab",
    VITE_GATEWAY_URL: undefined,
    VITE_WORKOS_CLIENT_ID: "local-verification",
    VITE_WORKOS_REDIRECT_URI: "http://127.0.0.1:5173/auth/callback",
  });
  await writeFile(path.join(directory, "app-build.log"), result.stdout + result.stderr);
  return serveBuild(path.join(build, "client"));
}

/** Opens the same deterministic demo used by the app's shell-polish checks.
 * @throws If the app, sidebar, selected thread, or fonts fail to become ready.
 */
export async function openApp(browser: Browser, base: string, theme: Theme) {
  const context = await browser.newContext({
    viewport: APP_SHELL.viewport,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    colorScheme: theme,
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
  );
  try {
    await page.goto(`${base}/?scenario=demo`);
    await page.locator('header[data-slot="title-bar"]').waitFor();
    await page
      .locator('[data-slot="sidebar"]')
      .getByRole("button", { name: /^New thread in /u })
      .first()
      .waitFor();
    await page.locator('[data-sidebar="menu-skeleton"]').first().waitFor({ state: "detached" });
    await page.getByRole("tab", { selected: true }).waitFor();
    await page.locator(".thread-panel").first().waitFor();
    await page.waitForFunction(
      (expected) => document.documentElement.dataset.theme === expected,
      theme,
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    if (errors.length > 0) throw new Error(errors.join("\n"));
    return { page, errors };
  } catch (error) {
    await context.close();
    throw error;
  }
}
