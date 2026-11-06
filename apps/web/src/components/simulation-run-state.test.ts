import { expect, it } from "vitest";
import type { SimulationRun } from "gateway/simulation-contract";
import { runSimulation, toolProbe } from "../../../gateway/src/simulation";
import { runProgress, simulationRowStatus } from "./simulation-run-state";

const run: SimulationRun = {
  id: "2d470d88-53b3-43fe-ab64-02639081c371",
  active: true,
  persistence: "none",
  evidence: null,
  humanReview: { status: "pending", note: "" },
};

it("awards a passing row only to real completed evidence, never active or incomplete results", async () => {
  const result = await runSimulation(
    { case: "owner", version: "corrected", source: "probe", pressure: false },
    toolProbe,
  );
  const evidence: NonNullable<SimulationRun["evidence"]> = {
    id: run.id,
    completedAt: new Date().toISOString(),
    result,
    models: {
      customer: { requested: "moonshotai/kimi-k3", reported: [] },
      support: { requested: "moonshotai/kimi-k3", reported: [] },
    },
  };
  const completed: SimulationRun = {
    ...run,
    active: false,
    persistence: "saved",
    evidence,
  };
  expect(simulationRowStatus(completed)).toMatchObject({
    kind: "passed",
    label: "Business checks passed",
  });
  for (const pending of [
    undefined,
    run,
    { ...completed, active: true },
    { ...completed, evidence: { ...evidence, completedAt: null } },
  ]) {
    expect(simulationRowStatus(pending).kind).not.toBe("passed");
  }
  for (const [status, label] of [
    ["running", "Running. No grade yet."],
    ["errored", "Execution error. No grade."],
    ["cancelled", "Stopped. No grade."],
    ["timed-out", "Time limit reached. No grade."],
    ["limit-exhausted", "Run limit reached. No grade."],
  ] as const) {
    expect(
      simulationRowStatus({
        ...completed,
        evidence: { ...evidence, completedAt: null, result: { ...result, status } },
      }),
    ).toEqual({ kind: "ungraded", label });
  }
  for (const verdict of [null, "fail", "not-exercised"] as const) {
    expect(
      simulationRowStatus({
        ...completed,
        evidence: { ...evidence, result: { ...result, verdict } },
      }).kind,
    ).not.toBe("passed");
  }
});

it("only validated customer messages enter chat, never raw actor JSON", () => {
  const initial = { run, messages: [], activity: "Starting" };
  const protocol = runProgress(initial, run.id, {
    kind: "customer-delta",
    text: '{"action":"message","message":"not accepted yet',
  });
  expect(protocol.messages).toEqual([]);
  const accepted = runProgress(protocol, run.id, { kind: "customer-message", text: "Refund it?" });
  expect(accepted.messages).toEqual([{ role: "customer", text: "Refund it?" }]);
  expect(runProgress(accepted, "old-handle", { kind: "customer-message", text: "late" })).toEqual(
    accepted,
  );
});

it("support deltas are genuine text and a support end cannot complete the scenario", async () => {
  const initial = {
    run,
    messages: [{ role: "customer" as const, text: "Refund it?" }],
    activity: "Starting",
  };
  const first = runProgress(initial, run.id, {
    kind: "support",
    event: { kind: "text", text: "Please " },
  });
  const second = runProgress(first, run.id, {
    kind: "support",
    event: { kind: "text", text: "confirm." },
  });
  expect(second.messages).toEqual([
    { role: "customer", text: "Refund it?" },
    { role: "agent", text: "Please confirm." },
  ]);
  const result = await runSimulation(
    { case: "owner", version: "corrected", source: "probe", pressure: false },
    () => {},
  );
  expect(runProgress(second, run.id, { kind: "support", event: { kind: "end", result } })).toEqual(
    second,
  );
  const snapshot = runProgress(second, run.id, {
    kind: "support",
    event: { kind: "snapshot", result },
  });
  expect(snapshot.run.active).toBe(true);
  expect(snapshot.run.evidence?.result).toMatchObject({
    status: "running",
    verdict: null,
    checks: [],
  });
  const finished = runProgress(second, run.id, {
    kind: "run-end",
    run: { ...run, active: false },
  });
  expect(finished.run.active).toBe(false);
  expect(runProgress(finished, run.id, { kind: "customer-message", text: "late" })).toEqual(
    finished,
  );
});
