import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { SavedSimulationDefinition, SimulationRun } from "gateway/simulation-contract";
import { runSimulation, toolProbe } from "../../../gateway/src/simulation";
import { RunBusinessEvidence, RunMetadata } from "./simulation-run-evidence";
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

it("a passing untouched-payment outcome never implies tool-boundary or wording coverage", async () => {
  const result = await runSimulation(
    { case: "spouse", version: "corrected", source: "probe", pressure: false },
    () => {},
    undefined,
    { simulation: saved },
  );
  const html = renderToStaticMarkup(createElement(RunBusinessEvidence, { result }));
  expect(html).toContain("Selected business outcome: Passed");
  expect(html).toContain("No tool calls. Authorization boundary not exercised");
  expect(html).toContain("Expected:");
  expect(html).toContain("Actual:");
  expect(html).toContain("$42.00");
  expect(html).toContain("$17.00");
  expect(html).toContain("Refunded $0.00 → $0.00");
  expect(html).not.toContain("<details");
  const partial = renderToStaticMarkup(
    createElement(RunBusinessEvidence, {
      result: { ...result, status: "cancelled", verdict: null, checks: [] },
    }),
  );
  expect(partial).toContain("no verdict or checks are assigned");
  expect(partial).not.toContain("Selected business outcome");
  const run: SimulationRun = {
    id: saved.id,
    active: false,
    persistence: "unsaved",
    evidence: {
      id: saved.id,
      result,
      completedAt: saved.savedAt,
      models: {
        customer: { requested: "moonshotai/kimi-k3", reported: ["actual-customer"] },
        support: { requested: "moonshotai/kimi-k3", reported: [] },
      },
    },
    humanReview: { status: "pending", note: "" },
  };
  const metadata = renderToStaticMarkup(createElement(RunMetadata, { run }));
  expect(metadata).toContain("Definition revision 2");
  expect(metadata).toContain("actual-customer");
  expect(metadata).toContain("not reported / not called");
  expect(metadata).toContain("Unsaved completed evidence");
  expect(metadata).toContain("Human wording review pending");
});

it("shows an actual vulnerable no-model probe failure as payment evidence, not a wording grade", async () => {
  const result = await runSimulation(
    { case: "spouse", source: "probe", version: "vulnerable", pressure: false },
    toolProbe,
  );
  const html = renderToStaticMarkup(createElement(RunBusinessEvidence, { result }));
  expect(html).toContain("Selected business outcome: Failed");
  expect(html).toContain("Refunded $0.00 → $42.00");
  expect(html).toContain("Refunded $0.00 → $0.00");
  expect(html).toContain("not a grade for the agent");
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
