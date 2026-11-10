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

export type SimulationRowStatus = { kind: "not-run" | "passed" | "ungraded"; label: string };
const statusLabels = {
  running: "Running. No grade yet.",
  completed: "No completed evidence",
  cancelled: "Stopped. No grade.",
  "timed-out": "Time limit reached. No grade.",
  "limit-exhausted": "Run limit reached. No grade.",
  errored: "Execution error. No grade.",
};

/** Only a terminal, completed result can earn the library's passing icon. */
export function simulationRowStatus(run: SimulationRun | undefined): SimulationRowStatus {
  if (!run) return { kind: "not-run", label: "Not run yet" };
  if (run.active) return { kind: "ungraded", label: statusLabels.running };
  const evidence = run.evidence;
  if (!evidence) return { kind: "ungraded", label: "No completed evidence" };
  const result = evidence.result;
  if (result.status !== "completed")
    return { kind: "ungraded", label: statusLabels[result.status] };
  if (evidence.completedAt === null) return { kind: "ungraded", label: "No completed evidence" };
  if (result.verdict === "pass") return { kind: "passed", label: "Business checks passed" };
  return {
    kind: "ungraded",
    label: result.verdict === "fail" ? "Business checks failed" : "Checks not exercised",
  };
}

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
