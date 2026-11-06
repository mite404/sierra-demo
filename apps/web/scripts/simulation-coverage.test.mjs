import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { writeSimulationCoverage } from "./simulation-coverage.mjs";

// Isolate filesystem inputs, but use the real parser, source-map converter and coverage merger.
const { ROOT } = await vi.hoisted(async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  return { ROOT: await mkdtemp(`${tmpdir()}/sierra-coverage-`) };
});
vi.mock("./harness.mjs", () => ({ ROOT }));

const asset = path.join(ROOT, "apps/web/build/client/assets/checkpoints.js");
const original = path.join(ROOT, "apps/web/src/checkpoints.ts");
const output = path.join(ROOT, "coverage/combined.json");
const source = [
  "function before() {",
  "  return 11;",
  "}",
  "function after() {",
  "  return 29;",
  "}",
  "function never() {",
  "  return 47;",
  "}",
].join("\n");
const generated = `// Bundle prelude\n// Not in the original source\n${source}`;
const sourceMap = {
  version: 3,
  sources: [original],
  sourcesContent: [source],
  names: [],
  // Skip the two generated lines, then map each original line at column zero.
  mappings: ";;AAAA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA",
};
const gateway = {
  "/gateway/authority.ts": {
    path: "/gateway/authority.ts",
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } } },
    s: { 0: 7 },
    fnMap: {},
    f: {},
    branchMap: {},
    b: {},
  },
};

function checkpoint(counts) {
  return {
    url: "http://fixture.test/assets/checkpoints.js",
    source: generated,
    functions: [
      {
        functionName: "",
        isBlockCoverage: true,
        ranges: [{ startOffset: 0, endOffset: generated.length, count: 1 }],
      },
      ...["before", "after", "never"].map((name, index) => {
        const startOffset = generated.indexOf(`function ${name}`);
        return {
          functionName: name,
          isBlockCoverage: true,
          ranges: [
            {
              startOffset,
              endOffset: generated.indexOf("}", startOffset) + 1,
              count: counts[index],
            },
          ],
        };
      }),
    ],
  };
}

beforeEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
  await mkdir(path.dirname(asset), { recursive: true });
  await mkdir(path.join(ROOT, "apps/gateway/coverage"), { recursive: true });
  await writeFile(
    path.join(ROOT, "apps/gateway/coverage/coverage-final.json"),
    JSON.stringify(gateway),
  );
  await writeFile(asset, generated);
  await writeFile(`${asset}.map`, JSON.stringify(sourceMap));
});
afterAll(() => rm(ROOT, { recursive: true, force: true }));

it("merges disjoint checkpoints without covering an unexecuted function or changing gateway counters", async () => {
  // The first function runs only before navigation; the second runs only afterwards.
  const later = checkpoint([0, 3, 0]);
  delete later.source; // CDP can omit source; conversion must read the identical built asset.
  await writeSimulationCoverage([checkpoint([2, 0, 0]), later], output);
  const combined = JSON.parse(await readFile(output, "utf8"));
  expect(combined["/gateway/authority.ts"]).toEqual(gateway["/gateway/authority.ts"]);
  const web = combined[original];
  expect(
    Object.fromEntries(Object.entries(web.fnMap).map(([id, fn]) => [fn.name, web.f[id]])),
  ).toEqual({ before: 2, after: 3, never: 0 });
  for (const [line, count] of [
    [2, 2],
    [5, 3],
    [8, 0],
  ]) {
    const statements = Object.entries(web.statementMap).filter(
      ([, location]) => location.start.line === line,
    );
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.map(([id]) => web.s[id])).toEqual([count]);
  }
});

it.each([
  { kind: "missing", prepare: () => rm(`${asset}.map`), error: /ENOENT/ },
  { kind: "malformed", prepare: () => writeFile(`${asset}.map`, "{invalid"), error: /JSON/ },
  {
    kind: "empty",
    prepare: () => writeFile(`${asset}.map`, JSON.stringify({ ...sourceMap, mappings: "" })),
    error: /map executable statements/,
  },
  {
    kind: "unrelated",
    prepare: () =>
      writeFile(
        `${asset}.map`,
        JSON.stringify({ ...sourceMap, sources: ["/vendor/dependency.js"] }),
      ),
    error: /map executable statements/,
  },
])("rejects $kind source maps without publishing coverage", async ({ prepare, error }) => {
  await prepare();
  await expect(writeSimulationCoverage([checkpoint([2, 0, 0])], output)).rejects.toThrow(error);
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
});
