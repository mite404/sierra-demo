#!/usr/bin/env node
// Move every visible control on every story and report the ones that change nothing.
//
//   node .agents/skills/verify-storybook-component/scripts/audit-controls.mjs [story-id...]
//
// A control passes when moving it changes the rendered story: its DOM, and its pixels unless
// only an animation moved. A control whose effect needs a click or a drag (a menu's placement,
// a card's drag handle) is declared by its story as
// `parameters: { controlsAudit: { onInteraction: ["placement"] } }` and listed for a manual
// check instead. Exits 1 when any control is dead, so a hidden or broken knob never ships.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const playwright = await import(
  createRequire(path.join(ROOT, "apps/storybook/package.json")).resolve("playwright"),
);
const { chromium } = playwright.default ?? playwright;
const STATE_DIR =
  process.env.VERIFY_STATE_DIR ?? `/tmp/yaklabs-storybook-verify-${process.env.VERIFY_RUN_ID ?? "default"}`;
const SETTLE_MS = 400;

function readPort() {
  try {
    return readFileSync(path.join(STATE_DIR, "port"), "utf8").trim();
  } catch {
    return process.env.VERIFY_PORT ?? "6106";
  }
}

// Values the control can take that differ from where it starts, tried in order until one
// changes the story; empty when the control's kind has no obvious "other" value.
function otherValues(control, initial) {
  const type = typeof control.type === "string" ? control.type : "";
  if (control.options?.length) return control.options.filter((option) => option !== initial);
  if (type === "boolean") return [!initial];
  if (type === "range" || type === "number") {
    return [initial === control.min ? control.max : (control.min ?? Number(initial ?? 0) + 1)];
  }
  if (type === "text") return [`${initial ?? ""} (changed)`];
  if (type === "object" && initial && typeof initial === "object") return stringEdits(initial);
  return [];
}

// One deep copy per string leaf (up to 12), each with that leaf edited: an object control is
// live if editing any of its text reaches the screen, since some fields only show in some states.
function stringEdits(value, limit = 12) {
  const paths = [];
  const stack = [[value, []]];
  while (stack.length > 0 && paths.length < limit) {
    const [node, at] = stack.shift();
    for (const [key, child] of Object.entries(node)) {
      if (typeof child === "string") paths.push([...at, key]);
      else if (child && typeof child === "object") stack.push([child, [...at, key]]);
    }
  }
  return paths.slice(0, limit).map((leaf) => {
    const copy = structuredClone(value);
    const parent = leaf.slice(0, -1).reduce((node, key) => node[key], copy);
    parent[leaf.at(-1)] = `${parent[leaf.at(-1)]} (changed)`;
    return copy;
  });
}

// The visible controls of one story, each with the value it starts on.
async function visibleControls(page, storyId) {
  return page.evaluate(async (id) => {
    const story = await window.__STORYBOOK_PREVIEW__.storyStoreValue.loadStory({ storyId: id });
    const controls = story.parameters?.controls ?? {};
    if (controls.disable) return { controls: [], onInteraction: [] };
    const exclude = controls.exclude ?? [];
    const shown = Object.entries(story.argTypes).filter(
      ([name, type]) =>
        type.control && !type.control.disable && !type.table?.disable && !exclude.includes(name),
    );
    return {
      onInteraction: story.parameters?.controlsAudit?.onInteraction ?? [],
      controls: shown.map(([name, type]) => {
        // An unset arg means the component's own default, which the docs table records.
        let initial = story.initialArgs[name];
        const summary = type.table?.defaultValue?.summary;
        if (initial === undefined && summary !== undefined) {
          try {
            initial = JSON.parse(summary);
          } catch {
            initial = summary.replace(/^["']|["']$/g, "");
          }
        }
        return {
          name,
          initial,
          control: { ...type.control, options: type.options ?? type.control.options },
        };
      }),
    };
  }, storyId);
}

async function snapshot(page) {
  const dom = await page.evaluate(() => document.querySelector("#storybook-root")?.innerHTML ?? "");
  const pixels = (await page.screenshot()).toString("base64");
  return { dom, pixels };
}

async function setArgs(page, storyId, updatedArgs) {
  await page.evaluate(
    ([id, args]) =>
      window.__STORYBOOK_ADDONS_CHANNEL__.emit("updateStoryArgs", { storyId: id, updatedArgs: args }),
    [storyId, updatedArgs],
  );
  await page.waitForTimeout(SETTLE_MS);
}

async function auditStory(page, base, storyId) {
  await page.goto(`${base}/iframe.html?id=${storyId}&viewMode=story`);
  await page.waitForSelector("#storybook-root > *", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
  const { controls, onInteraction } = await visibleControls(page, storyId);
  const findings = [];
  for (const { name, initial, control } of controls) {
    if (onInteraction.includes(name)) {
      findings.push({ kind: "interaction", name });
      continue;
    }
    const values = otherValues(control, initial);
    if (values.length === 0) {
      findings.push({ kind: "unchecked", name, detail: `no test value for a ${control.type} control` });
      continue;
    }
    let verdict = "the story did not change";
    for (const value of values) {
      const before = await snapshot(page);
      await setArgs(page, storyId, { [name]: value });
      const after = await snapshot(page);
      await page.evaluate(
        (id) => window.__STORYBOOK_ADDONS_CHANNEL__.emit("resetStoryArgs", { storyId: id }),
        storyId,
      );
      await page.waitForTimeout(SETTLE_MS);
      if (before.dom !== after.dom && before.pixels !== after.pixels) {
        verdict = undefined;
        break;
      }
      if (before.dom !== after.dom) verdict = "the DOM changed, but not a pixel";
    }
    if (verdict) findings.push({ kind: "dead", name, detail: verdict });
  }
  return { checked: controls.length, findings };
}

const base = `http://127.0.0.1:${readPort()}`;
const index = await (await fetch(`${base}/index.json`)).json();
const requested = process.argv.slice(2);
const storyIds = Object.values(index.entries)
  .filter((entry) => entry.type === "story")
  .map((entry) => entry.id)
  .filter((id) => requested.length === 0 || requested.includes(id));

const browser = await chromium.launch(
  process.env.VERIFY_CHROMIUM ? { executablePath: process.env.VERIFY_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let checked = 0;
let dead = 0;
for (const storyId of storyIds) {
  const result = await auditStory(page, base, storyId);
  checked += result.checked;
  for (const { kind, name, detail } of result.findings) {
    if (kind === "dead") dead += 1;
    const label = { dead: "DEAD", interaction: "CHECK BY HAND", unchecked: "UNCHECKED" }[kind];
    console.log(`${label.padEnd(13)} ${storyId}  ${name}${detail ? `: ${detail}` : ""}`);
  }
}
await browser.close();
console.log(`\n${storyIds.length} stories, ${checked} visible controls, ${dead} dead`);
process.exit(dead > 0 ? 1 : 0);
