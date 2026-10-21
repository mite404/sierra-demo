import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import type { Browser } from "playwright";
import { z } from "zod";
import { buildApp, openApp } from "./app-capture.ts";
import { APP_SHELL } from "./app-target.ts";
import { compareBaseline, imageRef, knownEnvironments } from "./baselines.ts";
import { accessibility, mutationProof, openStory, sampleTokens, screenshot } from "./capture.ts";
import { inventoryCss } from "./colors.ts";
import { firstLine, idSchema, proved, reportSchema, verdict } from "./report.ts";
import type { Cell, Engine, Fingerprint, Probe, Report, Theme } from "./report.ts";
import { referenceNotice, summarize } from "./summary.ts";
import {
  BASELINES,
  command,
  environmentName,
  ROOT,
  RUNS,
  serveBuild,
  sourceSnapshot,
} from "./workspace.ts";

type SourceSnapshot = Awaited<ReturnType<typeof sourceSnapshot>>;
type Server = Awaited<ReturnType<typeof serveBuild>>;

const browsers = { chromium, firefox, webkit };
const storyIndex = z.object({
  entries: z.record(z.string(), z.object({ id: idSchema, type: z.string() })),
});
const packageVersion = z
  .object({ version: z.string() })
  .parse(createRequire(import.meta.url)("playwright/package.json")).version;
const DEFAULT_STORIES = [
  "foundations-button--default",
  "foundations-text-field--on-paper",
  "foundations-text-field--inside-recap-and-needs-you",
  "foundations-disclosure--folded",
  "foundations-disclosure--open",
];

type RunOptions = {
  engines: Engine[];
  themes: Theme[];
  mode: Report["mode"];
  stories?: string[];
  all?: boolean;
  app?: boolean;
  since?: string;
  baselineDir?: string;
};

async function captureCell(
  browser: Browser,
  servers: { stories: Server; app: Server | null },
  directory: string,
  baselineDir: string,
  identity: Pick<Cell, "key" | "story" | "engine" | "theme">,
  fingerprint: Fingerprint,
): Promise<Cell> {
  try {
    const isApp = identity.story === APP_SHELL.id;
    const server = isApp ? servers.app : servers.stories;
    if (!server) throw new Error("App capture was selected without its production build.");
    const measured = isApp ? { ...fingerprint, ...APP_SHELL.viewport } : fingerprint;
    const scope = isApp ? "body" : "#storybook-root";
    const { page, errors } = isApp
      ? await openApp(browser, server.url, identity.theme)
      : await openStory(browser, server.url, identity.story, identity.theme);
    try {
      const bytes = await screenshot(page);
      const current = imageRef(`${identity.key}.current.png`, bytes);
      await writeFile(path.join(directory, current.path), bytes);
      const aria = `${identity.key}.aria.yml`;
      await writeFile(path.join(directory, aria), await page.locator(scope).ariaSnapshot());
      const axe = await accessibility(page, scope);
      if (errors.length > 0) throw new Error(errors.join("\n"));
      const pixels = await compareBaseline({
        key: identity.key,
        fingerprint: measured,
        current: bytes,
        runDir: directory,
        baselineDir,
      });
      return { ...identity, kind: "rendered", current, aria, fingerprint: measured, pixels, axe };
    } finally {
      await page.context().close();
    }
  } catch (error) {
    return { ...identity, kind: "render-error", errors: [String(error)] };
  }
}

/** Resolves the requested story selection against the indexed set.
 * @throws When the selection is empty, duplicated, or names an unindexed story.
 */
export async function chooseStories(
  options: RunOptions,
  all: string[],
  port: number,
  directory: string,
) {
  let selected = options.all ? all : (options.stories ?? DEFAULT_STORIES);
  if (options.since) {
    const { stdout } = await command(
      "node",
      [
        ".agents/skills/verify-storybook-component/scripts/affected-stories.mjs",
        "--since",
        options.since,
      ],
      { ...process.env, VERIFY_PORT: String(port), VERIFY_STATE_DIR: directory },
    );
    selected = stdout.trim().split("\n").filter(Boolean);
  }
  if (
    selected.length === 0 ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !all.includes(id))
  ) {
    throw new Error(
      "Selection is empty, duplicated, or contains unknown Storybook IDs. Nothing was verified.",
    );
  }
  return options.app ? [...selected, APP_SHELL.id] : selected;
}

async function buildStorybook(snapshot: SourceSnapshot, build: string, directory: string) {
  process.stdout.write(`Building current Storybook for ${snapshot.source.slice(0, 12)}\n`);
  const built = await command(
    "pnpm",
    [
      "--filter",
      "storybook",
      "exec",
      "storybook",
      "build",
      "--output-dir",
      build,
      "--disable-telemetry",
    ],
    { ...process.env, STORYBOOK_DISABLE_TELEMETRY: "1" },
  );
  await writeFile(path.join(directory, "build.log"), built.stdout + built.stderr);
  if ((await sourceSnapshot()).source !== snapshot.source)
    throw new Error("Source changed during the build. Rerun.");
}

async function loadStoryIndex(build: string): Promise<string[]> {
  const index = storyIndex.parse(
    JSON.parse(await readFile(path.join(build, "index.json"), "utf8")),
  );
  return Object.values(index.entries)
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id);
}

function notRunCells(engine: Engine, stories: string[], themes: Theme[], reason: unknown): Cell[] {
  return stories.flatMap((story) =>
    themes.map((theme) => ({
      key: `${story}.${engine}.${theme}`,
      story,
      theme,
      engine,
      kind: "not-run" as const,
      reason: String(reason),
    })),
  );
}

// Append as captures land so partial evidence survives a mid-matrix failure.
async function runEngineMatrix(
  browser: Browser,
  engine: Engine,
  servers: { stories: Server; app: Server | null },
  environment: string,
  tokenNames: string[],
  options: RunOptions,
  report: Report,
  directory: string,
) {
  const server = servers.stories;
  const fingerprint: Fingerprint = {
    environment,
    browser: browser.version(),
    playwright: packageVersion,
    width: 960,
    height: 640,
    dpr: 2,
    policy: 1,
  };
  const proof: Probe = await mutationProof(browser, server.url, engine, fingerprint, directory);
  report.probes.push(proof);
  const judged = proved([proof], [engine]) ? "ok" : "FAILED, its comparisons cannot be trusted";
  process.stdout.write(
    `${engine} proof ${judged}: control ${proof.control.changedPixels}, color ${proof.color.changedPixels}, geometry ${proof.geometry.changedPixels}\n`,
  );
  for (const theme of options.themes) {
    if (engine === options.engines[0]) {
      const { page } = await openStory(browser, server.url, "foundations-button--default", theme);
      try {
        const samples = await sampleTokens(page, tokenNames, theme);
        report.tokens.push(...samples.tokens);
        report.contrasts.push(...samples.contrasts);
      } finally {
        await page.context().close();
      }
    }
    for (const story of report.selectedStories) {
      const key = `${story}.${engine}.${theme}`;
      const cell = await captureCell(
        browser,
        servers,
        directory,
        options.baselineDir ?? BASELINES,
        { key, engine, story, theme },
        fingerprint,
      );
      report.cells.push(cell);
      process.stdout.write(
        `${key} ${cell.kind === "rendered" ? cell.pixels.kind : cell.kind}${cell.kind === "rendered" ? ` axe=${cell.axe.violations.length}` : ""}\n`,
      );
    }
  }
}

// One engine's whole matrix. A launch failure or a crash mid-matrix is recorded and printed as it
// happens, so the next engine still runs and nobody waits for the summary to learn of it.
async function captureEngine(
  engine: Engine,
  context: {
    servers: { stories: Server; app: Server | null };
    environment: string;
    names: string[];
    options: RunOptions;
    report: Report;
  },
  directory: string,
) {
  const { servers, environment, names, options, report } = context;
  let browser: Browser;
  try {
    browser = await browsers[engine].launch(
      engine === "chromium"
        ? { args: ["--disable-partial-raster", "--force-color-profile=srgb"] }
        : {},
    );
  } catch (error) {
    report.cells.push(...notRunCells(engine, report.selectedStories, options.themes, error));
    report.errors.push(`${engine} did not launch: ${String(error)}`);
    process.stdout.write(`${engine} did not launch: ${firstLine(String(error))}\n`);
    return;
  }
  try {
    await runEngineMatrix(browser, engine, servers, environment, names, options, report, directory);
  } catch (error) {
    report.errors.push(`${engine}: ${String(error)}`);
    process.stdout.write(`${engine} stopped: ${firstLine(String(error))}\n`);
  } finally {
    await browser.close();
  }
}

/** Builds code once, captures the requested matrix, and writes an immutable report last.
 * @throws When the source cannot be read, an approved reference is unreadable or invalid, or
 *   the report cannot be persisted.
 */
export async function runVerification(options: RunOptions): Promise<Report> {
  const snapshot = await sourceSnapshot();
  const id = `${new Date()
    .toISOString()
    .replaceAll(/[^\da-z]/giu, "-")
    .toLowerCase()}-${randomUUID().slice(0, 8)}`;
  const directory = path.join(RUNS, id);
  const known = await knownEnvironments(options.baselineDir ?? BASELINES); // → string[]
  const build = path.join(ROOT, ".artifacts/verify-ui-drift/builds", id);
  await mkdir(directory, { recursive: true });
  const report: Report = {
    schema: 1,
    id,
    mode: options.mode,
    source: snapshot.source,
    head: (await command("git", ["rev-parse", "HEAD"])).stdout.trim(),
    createdAt: new Date().toISOString(),
    engines: options.engines,
    themes: options.themes,
    indexedStories: 0,
    selectedStories: [],
    errors: [],
    probes: [],
    cells: [],
    inventory: inventoryCss(snapshot.files),
    tokens: [],
    contrasts: [],
  };
  try {
    await buildStorybook(snapshot, build, directory);
    const server = await serveBuild(build);
    let app: Server | null = null;
    try {
      const all = await loadStoryIndex(build);
      report.indexedStories = all.length;
      report.selectedStories =
        options.mode === "selftest"
          ? []
          : await chooseStories(options, all, server.port, directory);
      if (report.selectedStories.includes(APP_SHELL.id)) app = await buildApp(id, directory);
      const environment = await environmentName();
      const notice = referenceNotice(options.mode, environment, known); // → string | null
      if (notice !== null) process.stdout.write(`${notice}\n`);
      const names = [...new Set(report.inventory.customProperties.map((token) => token.name))];
      const context = { servers: { stories: server, app }, environment, names, options, report };
      for (const engine of options.engines) await captureEngine(engine, context, directory);
    } finally {
      await app?.close();
      await server.close();
    }
    if ((await sourceSnapshot()).source !== snapshot.source)
      report.errors.push("Source changed during capture. This report cannot be approved.");
  } catch (error) {
    report.errors.push(String(error));
  }
  const temporary = path.join(directory, "report.tmp");
  await writeFile(temporary, `${JSON.stringify(reportSchema.parse(report), null, 2)}\n`);
  await rename(temporary, path.join(directory, "report.json"));
  process.stdout.write(
    `${verdict(report).toUpperCase()} ${path.relative(ROOT, directory)}/report.json\n`,
  );
  for (const line of summarize(report, known)) process.stdout.write(`  ${line}\n`);
  return report;
}
