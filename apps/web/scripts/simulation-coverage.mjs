import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { convert } from "ast-v8-to-istanbul";
import istanbul from "istanbul-lib-coverage";
import { parseSync } from "vite";
import { ROOT } from "./harness.mjs";

/**
 * Maps actual browser execution to source and retains the measured gateway coverage.
 * @throws If coverage or source maps are missing, or no executable statements map to web source.
 */
export async function writeSimulationCoverage(entries, output) {
  const coverage = istanbul.createCoverageMap(
    JSON.parse(
      await readFile(path.join(ROOT, "apps/gateway/coverage/coverage-final.json"), "utf8"),
    ),
  );
  let webStatements = 0;
  for (const entry of entries) {
    const url = new URL(entry.url);
    if (!url.pathname.startsWith("/assets/") || !url.pathname.endsWith(".js")) continue;
    // React Router's generated route manifest is data, not a source-mapped application module.
    if (path.basename(url.pathname).startsWith("manifest-")) continue;
    const file = path.join(ROOT, "apps/web/build/client", url.pathname);
    const code = entry.source ?? (await readFile(file, "utf8"));
    const mapped = await convert({
      code,
      ast: parseSync(file, code).program,
      coverage: { ...entry, url: pathToFileURL(file).href },
      sourceMap: JSON.parse(await readFile(`${file}.map`, "utf8")),
      wrapperLength: 0,
    });
    const sources = Object.fromEntries(
      Object.entries(mapped).filter(([source]) =>
        source.startsWith(path.join(ROOT, "apps/web/src/")),
      ),
    );
    webStatements += Object.values(sources).reduce(
      (total, mappedFile) => total + Object.keys(mappedFile.statementMap).length,
      0,
    );
    coverage.merge(sources);
  }
  assert.ok(webStatements > 0, "Browser coverage must map executable statements to web source");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(coverage.toJSON()));
}
