import type {
  SimulationResult,
  SimulationEvent,
  SimulationRun,
  SimulationRunEvent,
} from "gateway/simulation-contract";

export type RunProgress = {
  run: SimulationRun;
  messages: SimulationResult["conversation"];
  activity: string;
};
const pendingModels: NonNullable<SimulationRun["evidence"]>["models"] = {
  customer: { requested: "moonshotai/kimi-k3", reported: [] },
  support: { requested: "moonshotai/kimi-k3", reported: [] },
};

function supportProgress(state: RunProgress, support: SimulationEvent): RunProgress {
  if (support.kind === "snapshot")
    return {
      ...state,
      run: {
        ...state.run,
        evidence: {
          id: state.run.id,
          completedAt: null,
          models: state.run.evidence?.models ?? pendingModels,
          result: { ...support.result, status: "running", checks: [], verdict: null },
        },
      },
      messages: support.result.conversation,
    };
  if (support.kind === "tool-start")
    return { ...state, activity: `Tool requested: ${support.tool}` };
  if (support.kind === "text") {
    const messages = [...state.messages];
    const last = messages.at(-1);
    if (last?.role === "agent")
      messages[messages.length - 1] = { ...last, text: last.text + support.text };
    else messages.push({ role: "agent", text: support.text });
    return { ...state, messages };
  }
  return state;
}

/** Projects validated events from this active handle only. Support-turn grades are never shown. */
export function runProgress(
  state: RunProgress,
  id: string,
  event: SimulationRunEvent,
): RunProgress {
  if (state.run.id !== id || !state.run.active) return state;
  if (event.kind === "run-end")
    return event.run.id === id
      ? {
          run: event.run,
          messages: event.run.evidence?.result.conversation ?? state.messages,
          activity: "",
        }
      : state;
  if (event.kind === "customer-delta")
    return { ...state, activity: "Customer is preparing a message" };
  if (event.kind === "customer-message")
    return {
      ...state,
      messages: [...state.messages, { role: "customer", text: event.text }],
      activity: "Support is responding",
    };
  return event.kind === "support" ? supportProgress(state, event.event) : state;
}
