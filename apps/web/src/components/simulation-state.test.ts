import { expect, it } from "vitest";
import type { SimulationResult } from "gateway/simulation-contract";
import { restoreSimulationState, simulationReducer } from "./simulation-state";

it("restores a grade only for cleanly completed sessions", () => {
  const result: SimulationResult = {
    selection: { case: "owner", version: "corrected", source: "live", pressure: false },
    simulation: null,
    workflow: { tone: "warm", approval: "confirm" },
    principal: "morgan",
    status: "completed",
    verdict: "pass",
    error: null,
    model: null,
    elapsedMs: 100,
    conversation: [],
    trace: [],
    before: [],
    after: [],
    checks: [],
  };
  expect(restoreSimulationState(null)).toEqual({ kind: "idle" });
  expect(restoreSimulationState({ result: null, active: false, closed: false })).toEqual({
    kind: "idle",
  });
  expect(restoreSimulationState({ result, active: false, closed: false })).toEqual({
    kind: "settled",
    result,
  });
  const cancelled = {
    kind: "cancelled",
    result: { ...result, status: "cancelled", checks: [], verdict: null },
  };
  expect(restoreSimulationState({ result, active: true, closed: false })).toEqual(cancelled);
  expect(restoreSimulationState({ result, active: false, closed: true })).toEqual(cancelled);
  expect(
    restoreSimulationState({
      result: { ...result, status: "errored" },
      active: false,
      closed: false,
    }),
  ).toEqual({
    kind: "errored",
    message: "Previous reply incomplete. No grade.",
    result: { ...result, status: "errored" },
  });
});

it("reset and cancellation reject late results from earlier runs", () => {
  const running = simulationReducer({ kind: "idle" }, { type: "start", id: 1 });
  const reset = simulationReducer(running, { type: "reset" });
  expect(simulationReducer(reset, { type: "failed", id: 1, message: "late" })).toEqual({
    kind: "idle",
  });
  const next = simulationReducer(reset, { type: "start", id: 2 });
  expect(simulationReducer(next, { type: "failed", id: 1, message: "late" })).toEqual(next);
  const cancelled = simulationReducer(next, { type: "cancel", id: 2 });
  expect(cancelled.kind).toBe("cancelled");
  expect(simulationReducer(cancelled, { type: "failed", id: 2, message: "late" })).toEqual(
    cancelled,
  );
  const late = {
    type: "progress",
    id: 2,
    event: { kind: "tool-start", id: "late", tool: "refund_latest_payment" },
  } as const;
  expect(simulationReducer(cancelled, late)).toEqual(cancelled);
  expect(simulationReducer(reset, late)).toEqual(reset);
  const current = simulationReducer(reset, { type: "start", id: 3 });
  expect(simulationReducer(current, { ...late, id: 3 }).kind).toBe("running");
});
