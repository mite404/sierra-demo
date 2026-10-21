// What every browser lever starts from: the repository's root, the Chromium that Storybook's
// Playwright install pins, and the command line's `--name value` flags.
import { createRequire } from "node:module";
import path from "node:path";

/** The repository's root. */
export const ROOT = path.resolve(import.meta.dirname, "../../..");

const playwright = await import(
  createRequire(path.join(ROOT, "apps/storybook/package.json")).resolve("playwright")
);

/** Playwright's Chromium. */
export const { chromium } = playwright.default ?? playwright;

/**
 * Launches Playwright's Chromium, or the build at `PLAYWRIGHT_CHROMIUM` where the pinned one is
 * not downloaded.
 */
export const launch = (options = {}) => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM;
  return chromium.launch(executablePath === undefined ? options : { ...options, executablePath });
};

const argv = process.argv.slice(2);

/** The value after `name` on the command line, or `fallback` when it is not there. */
export const arg = (name, fallback) =>
  argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
