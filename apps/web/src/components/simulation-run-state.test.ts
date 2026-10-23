import { expect, it } from "vitest";
import type { SimulationRun } from "gateway/simulation-contract";
import { runSimulation } from "../../../gateway/src/simulation";
import { runProgress } from "./simulation-run-state";

const run: SimulationRun = {
  id: "2d470d88-53b3-43fe-ab64-02639081c371",
  active: true,
  persistence: "none",
  evidence: null,
  humanReview: { status: "pending", note: "" },
};

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
