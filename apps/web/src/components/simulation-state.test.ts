import { expect, it } from "vitest";
import { simulationReducer } from "./simulation-state";

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
