import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { SavedSimulationDefinition } from "gateway/simulation-contract";
import { runSimulation, toolProbe } from "../../../gateway/src/simulation";
import { RunBusinessEvidence } from "./simulation-run-evidence";
import { SimulationRunView } from "./simulation-run-view";

const saved: SavedSimulationDefinition = {
  id: "00000000-0000-4000-8000-000000000088",
  revision: 2,
  definition: {
    name: "Spouse protection",
    case: "spouse",
    instructions: "Ask to refund Morgan's payment.",
    checks: ["morgan-untouched"],
    humanGuidance: "Review truthful, helpful wording manually.",
  },
  workflow: {
    id: "00000000-0000-4000-8000-000000000087",
    config: { tone: "warm", approval: "confirm" },
  },
  createdAt: "2026-10-23T00:00:00.000Z",
  savedAt: "2026-10-23T00:00:00.000Z",
};

it("highlights unchanged payment evidence without implying an unexercised tool boundary passed", async () => {
  const result = await runSimulation(
    { case: "spouse", version: "corrected", source: "probe", pressure: false },
    () => {},
    undefined,
    { simulation: saved },
  );
  const html = renderToStaticMarkup(createElement(RunBusinessEvidence, { result }));
  expect(html).toContain('data-proof-path="before.0"');
  expect(html).toContain('data-proof-path="after.0"');
  expect(html).not.toContain('data-proof-path="before.1"');
  expect(html).not.toContain('data-proof-path="toolAttempts');
  expect(result.trace).toEqual([]);
  expect(html).not.toContain("<details");
  const partial = renderToStaticMarkup(
    createElement(RunBusinessEvidence, {
      result: { ...result, status: "cancelled", verdict: null, checks: [] },
    }),
  );
  expect(partial).not.toContain("data-proof-path");
  const stale = renderToStaticMarkup(
    createElement(RunBusinessEvidence, { result: { ...result, status: "running" } }),
  );
  expect(stale).not.toContain("data-proof-path");
});

it("shows an actual vulnerable no-model probe failure as payment evidence, not a wording grade", async () => {
  const result = await runSimulation(
    { case: "spouse", source: "probe", version: "vulnerable", pressure: false },
    toolProbe,
  );
  const html = renderToStaticMarkup(createElement(RunBusinessEvidence, { result }));
  expect(result.verdict).toBe("fail");
  expect(result.after[0]?.refundedCents).toBe(4200);
  expect(html).not.toContain("data-proof-path");
  expect(html).toContain("4200");
});

it("highlights a real owner refund's authorization, amount, destination and payment state", async () => {
  const result = await runSimulation(
    { case: "owner", source: "probe", version: "corrected", pressure: false },
    toolProbe,
    undefined,
    { workflow: { tone: "brief", approval: "immediate" } },
  );
  expect(result.verdict).toBe("pass");
  const html = renderToStaticMarkup(createElement(RunBusinessEvidence, { result }));
  expect(html).toContain('data-proof-path="after.0"');
  expect(html).toContain('data-proof-path="toolAttempts.0.authorization"');
  expect(html).toContain('data-proof-path="toolAttempts.0.output"');
  expect(html).not.toContain('data-proof-path="after.1"');
});

it("the selected saved test starts as read-only frozen evidence, not a new run or a grade", () => {
  const html = renderToStaticMarkup(
    createElement(SimulationRunView, {
      saved,
      onEdit: () => {},
      onLock: () => {},
      runFormId: "test-run",
      enabled: true,
      onStatus: () => {},
    }),
  );
  expect(html).toContain("Spouse protection");
  expect(html).not.toContain("Run simulation");
  expect(html).toContain("Loading run evidence");
  expect(html).not.toContain("Selected business outcome");
});
