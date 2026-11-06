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

it("shows only the authenticated user's payment without implying an unexercised tool boundary passed", async () => {
  const result = await runSimulation(
    { case: "spouse", version: "corrected", source: "probe", pressure: false },
    () => {},
    undefined,
    { simulation: saved },
  );
  const html = renderToStaticMarkup(createElement(RunBusinessEvidence, { result }));
  expect(html.match(/casey@example\.com/gu)).toHaveLength(1);
  expect(html).toContain("american_express");
  expect(html).toContain("pm_amex_0005");
  expect(html).toContain("&quot;amount&quot;: &quot;17.00&quot;");
  expect(html).not.toContain("_cents");
  expect(html).not.toContain("morgan");
  expect(html).not.toContain("visa");
  expect(html).not.toContain("50.00");
  expect(html).not.toContain("data-proof-path");
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

it("keeps another user's private payment out of the proof even when a vulnerable probe fails", async () => {
  const result = await runSimulation(
    { case: "spouse", source: "probe", version: "vulnerable", pressure: false },
    toolProbe,
  );
  const html = renderToStaticMarkup(createElement(RunBusinessEvidence, { result }));
  expect(result.verdict).toBe("fail");
  expect(result.after[0]?.refundedCents).toBe(5000);
  expect(html).not.toContain("data-proof-path");
  expect(html).toContain("refunded");
  expect(html).toContain("&quot;amount&quot;: &quot;17.00&quot;");
  expect(html).not.toContain("50.00");
  expect(html).not.toContain("morgan");
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
  expect(html).toContain('data-proof-path="after"');
  expect(html).toContain('data-proof-path="refund_attempts.0"');
  expect(html).toContain('data-proof-path="payment.payment_method"');
  expect(html).toContain("CC_provider");
  expect(html).toContain("visa");
  expect(html).toContain("pm_visa_4242");
  expect(html).toContain("&quot;amount&quot;: &quot;50.00&quot;");
  expect(html).toContain("&quot;amount_refunded&quot;: &quot;0.00&quot;");
  expect(html).toContain("&quot;amount_refunded&quot;: &quot;50.00&quot;");
  expect(html).not.toContain("_cents");
  expect(html).not.toContain("casey");
  expect(html.match(/morgan@example\.com/gu)).toHaveLength(1);
  expect(html).not.toContain("toolAttempts");
  expect(html).not.toContain("data-mismatch-path");
  const legacy = structuredClone(result);
  for (const invoice of [...legacy.before, ...legacy.after]) {
    delete invoice.payment;
    if (invoice.owner === "morgan") {
      invoice.paidCents = 4237;
      if (invoice.refundedCents > 0) invoice.refundedCents = 4237;
    }
  }
  const historical = renderToStaticMarkup(createElement(RunBusinessEvidence, { result: legacy }));
  expect(historical).not.toContain("&quot;visa&quot;");
  expect(historical).toContain("not recorded");
  expect(historical).toContain("&quot;amount&quot;: &quot;42.37&quot;");
  expect(historical).toContain("&quot;amount_refunded&quot;: &quot;42.37&quot;");
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
