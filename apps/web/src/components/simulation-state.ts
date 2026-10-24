import type { SimulationEvent, SimulationResult } from "gateway/simulation-contract";

export type SimulationState =
  | { kind: "idle" }
  | { kind: "running"; id: number; result: SimulationResult | null; activity: string | null }
  | { kind: "settled"; result: SimulationResult }
  | { kind: "cancelled"; result: SimulationResult | null }
  | { kind: "errored"; message: string; result: SimulationResult | null };
type Action =
  | { type: "start"; id: number }
  | { type: "reset" }
  | { type: "cancel"; id: number }
  | { type: "progress"; id: number; event: SimulationEvent }
  | { type: "failed"; id: number; message: string };

const unfinished = (result: SimulationResult | null): SimulationResult | null =>
  result ? { ...result, status: "running", checks: [], verdict: null, error: null } : null;

/** Restores finished evidence only when the saved session ended cleanly. */
export function restoreSimulationState(
  restored: { result: SimulationResult | null; active: boolean; closed: boolean } | null,
): SimulationState {
  if (!restored?.result) return { kind: "idle" };
  if (restored.result.status === "completed" && !restored.active && !restored.closed) {
    return { kind: "settled", result: restored.result };
  }
  if (restored.result.status === "errored") {
    return {
      kind: "errored",
      message: restored.result.error ?? "Previous reply incomplete. No grade.",
      result: restored.result,
    };
  }
  return {
    kind: "cancelled",
    result: { ...restored.result, status: "cancelled", checks: [], verdict: null },
  };
}

/** Reset and cancellation retire the stream; late events can never restore its evidence. */
export function simulationReducer(state: SimulationState, action: Action): SimulationState {
  if (action.type === "reset") return { kind: "idle" };
  if (action.type === "start")
    return {
      kind: "running",
      id: action.id,
      result: unfinished("result" in state ? state.result : null),
      activity: null,
    };
  if (state.kind !== "running" || state.id !== action.id) return state;
  if (action.type === "cancel") return { kind: "cancelled", result: state.result };
  if (action.type === "failed")
    return { kind: "errored", message: action.message, result: state.result };
  const event = action.event;
  if (event.kind === "snapshot") return { ...state, result: event.result, activity: null };
  if (event.kind === "tool-start") return { ...state, activity: event.tool };
  if (event.kind === "end") return { kind: "settled", result: event.result };
  return state;
}
