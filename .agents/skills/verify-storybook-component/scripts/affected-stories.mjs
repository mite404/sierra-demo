#!/usr/bin/env node
// List every story a set of changed files can affect, from fallow's import graph.
//
//   node .agents/skills/verify-storybook-component/scripts/affected-stories.mjs <file>...
//   node .agents/skills/verify-storybook-component/scripts/affected-stories.mjs --since main
//
// Prints story ids, one per line, ready to pass to shoot.mjs. Needs a running instance
// (control-storybook.sh launch) because story ids come from its index.json.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const STATE_DIR = process.env.VERIFY_STATE_DIR ?? `/tmp/yaklabs-storybook-verify-${process.env.VERIFY_RUN_ID ?? "default"}`;
const FALLOW = path.join(ROOT, "node_modules/.bin/fallow");
const IS_SOURCE = /^(packages\/catalog\/src|apps\/storybook\/\.storybook)\/.*\.(ts|tsx|css)$/;

function readPort() {
  try {
    return readFileSync(path.join(STATE_DIR, "port"), "utf8").trim();
  } catch {
    return process.env.VERIFY_PORT ?? "6106";
  }
}

function changedSince(ref) {
  const out = execFileSync("git", ["diff", "--name-only", ref, "--"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((f) => IS_SOURCE.test(f));
}

// A file's own stories plus every story reachable through its importers.
function storyFilesFor(file) {
  if (file.endsWith(".stories.tsx")) return [file];
  // Global CSS and Storybook config reach every story.
  if (file.startsWith("apps/storybook/.storybook/") || file.endsWith("tokens.css") || file.endsWith("primitives.css"))
    return ["*"];
  const json = execFileSync(FALLOW, ["inspect", "--file", file, "--format", "json"], { cwd: ROOT, encoding: "utf8" });
  const closure = JSON.parse(json).evidence.impact_closure.data.affected_not_shown ?? []; // → string[]
  return closure.filter((f) => f.endsWith(".stories.tsx"));
}

const argv = process.argv.slice(2);
const files = argv[0] === "--since" ? changedSince(argv[1]) : argv.map((f) => path.relative(ROOT, path.resolve(f)));
if (files.length === 0) {
  console.error("no changed story-affecting files");
  process.exit(0);
}

const storyFiles = new Set(files.flatMap(storyFilesFor)); // → Set<"packages/catalog/src/X.stories.tsx" | "*">
const index = await (await fetch(`http://127.0.0.1:${readPort()}/index.json`)).json();
const ids = Object.values(index.entries)
  .filter((e) => e.type === "story")
  .filter((e) => storyFiles.has("*") || storyFiles.has(path.normalize(path.join("apps/storybook", e.importPath))))
  .map((e) => e.id);
console.log(ids.join("\n"));
