import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReportView } from "./App.tsx";
import type { Report } from "./report.ts";

const fingerprint = {
  environment: "test",
  browser: "1",
  playwright: "1",
  width: 960,
  height: 640,
  dpr: 2,
  policy: 1,
} as const;
const delta = { changedPixels: 1, totalPixels: 6, resized: false };
const report: Report = {
  schema: 1,
  id: "test",
  mode: "comparison",
  source: "a".repeat(64),
  head: "head",
  createdAt: "2026-09-29T00:00:00Z",
  engines: ["chromium"],
  themes: ["light"],
  indexedStories: 2,
  selectedStories: ["button"],
  errors: [],
  probes: [
    {
      engine: "chromium",
      fingerprint,
      control: { ...delta, changedPixels: 0 },
      color: delta,
      geometry: delta,
    },
  ],
  cells: [
    {
      key: "button.chromium.light",
      story: "button",
      engine: "chromium",
      theme: "light",
      kind: "rendered",
      current: { path: "button.png", sha256: "b".repeat(64) },
      aria: "button.yml",
      fingerprint,
      pixels: { kind: "missing-baseline" },
      axe: { passes: 1, violations: [], incomplete: [] },
    },
  ],
  inventory: { customProperties: [], literals: [] },
  tokens: [],
  contrasts: [],
};
const onRun = () => {};
const storybook = {
  kind: "available",
  stories: [
    {
      id: "button",
      title: "Foundations/Button",
      name: "Default",
      importPath: "packages/catalog/src/Button.stories.tsx",
      componentPath: "packages/catalog/src/Button.tsx",
    },
    {
      id: "uncaptured",
      title: "Catalog/Recap",
      name: "Default",
      importPath: "packages/catalog/src/Recap.stories.tsx",
    },
  ],
} as const;

function render(value: Report) {
  return renderToStaticMarkup(
    <ReportView
      state={{
        report: value,
        stale: false,
        runs: ["test"],
        storybook: { ...storybook, stories: [...storybook.stories] },
      }}
      disconnected={false}
      run=""
      onRun={onRun}
    />,
  );
}

it("does not present an absent report as a passing run", () => {
  const html = renderToStaticMarkup(
    <ReportView
      state={{
        report: null,
        stale: false,
        runs: [],
        storybook: { kind: "unavailable", reason: "No run." },
      }}
      disconnected={false}
      run=""
      onRun={onRun}
    />,
  );
  expect(html).toContain("No run yet.");
  expect(html).not.toContain("Run coverage");
});

it("shows a first capture as incomplete and offers only explicit approval", () => {
  const html = renderToStaticMarkup(
    <ReportView
      state={{
        report,
        stale: false,
        runs: ["test"],
        storybook: { kind: "unavailable", reason: "No build." },
      }}
      disconnected={false}
      run=""
      onRun={onRun}
    />,
  );
  expect(html).toContain("<strong>incomplete</strong>");
  expect(html).toContain("First capture. Nothing has been compared or approved.");
  expect(html).toContain(
    "pnpm verify-ui-drift approve --run test --keys button.chromium.light --expect 1",
  );
});

it("distinguishes a measured match from missing difference evidence", () => {
  const matched: Report = {
    ...report,
    cells: report.cells.map((cell) =>
      cell.kind === "rendered"
        ? { ...cell, pixels: { kind: "match", baseline: cell.current } }
        : cell,
    ),
  };
  expect(render(matched)).toContain("No changed pixels");
  expect(render(matched)).not.toContain("No comparison evidence");
  expect(render(report)).toContain("No comparison evidence");
  expect(render(report)).not.toContain("No changed pixels");
});

it.each([
  { stale: true, disconnected: false },
  { stale: false, disconnected: true },
])(
  "hides approval for $stale stale / $disconnected disconnected evidence",
  ({ stale, disconnected }) => {
    const html = renderToStaticMarkup(
      <ReportView
        state={{
          report,
          stale,
          runs: ["test"],
          storybook: { kind: "unavailable", reason: "No build." },
        }}
        disconnected={disconnected}
        run=""
        onRun={onRun}
      />,
    );
    expect(html).toContain("<strong>Stale</strong>");
    expect(html).not.toContain("Review and approve this capture");
  },
);

it("links retained stories and distinguishes the uncaptured inventory from results", () => {
  const html = render(report);
  expect(html).toContain("/storybook/test/?path=/story/button");
  expect(html).toContain("packages/catalog/src/Button.tsx");
  expect(html).toContain("Catalog/Recap");
  expect(html).toContain("Not captured");
  expect(html).toContain("pnpm verify-ui-drift run --stories uncaptured");
  expect(html).toContain("pnpm verify-ui-drift run --app");
});
