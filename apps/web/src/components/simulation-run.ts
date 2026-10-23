import { linesOf } from "@yaklabs/runtime/ndjson";
import {
  simulationRun,
  simulationRunEvent,
  type SavedSimulationDefinition,
  type SimulationRun,
  type SimulationRunEvent,
} from "gateway/simulation-contract";
import { useEffect, useState, useSyncExternalStore } from "react";
import { readLab, saveLab } from "./simulation-persistence";
import { runProgress, type RunProgress } from "./simulation-run-state";

type View = {
  current: RunProgress | null;
  completed: SimulationRun[] | null;
  error: string | null;
  resultsError: string | null;
  operation: "loading" | "ready" | "stopping" | "saving";
};
const endpoint = (id: string) => `/api/simulation-runs/${id}`;
const progress = (run: SimulationRun): RunProgress => ({
  run,
  messages: run.evidence?.result.conversation ?? [],
  activity: run.active ? "Simulation is still active" : "",
});
const mustKeep = (run: SimulationRun | null) =>
  run !== null && (run.active || run.persistence === "unsaved" || run.persistence === "saving");
const requestError = (status: number) =>
  status === 409
    ? "This revision changed, this handle was already used, or another run is still active. Reopen the saved test before starting again."
    : status === 429
      ? "The server has 24 run views. Clear an inactive view before starting again. Save unsaved evidence first."
      : "The run request could not complete. Read its status before explicitly starting again. Nothing will be replayed.";

// One controller per selected view. Stream ownership outlives rendering, not navigation.
class RunController {
  view: View = {
    current: null,
    completed: null,
    error: null,
    resultsError: null,
    operation: "loading",
  };
  listeners = new Set<() => void>();
  handle: string | undefined;
  stream: AbortController | null = null;
  timer: ReturnType<typeof setTimeout> | undefined;
  connected = false;
  stopping = false;
  refreshing = false;
  constructor(readonly saved: SavedSimulationDefinition) {
    this.handle = readLab().runHandles?.[saved.id];
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.view;
  update(patch: Partial<View>) {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async read() {
    const id = this.handle;
    if (id === undefined) return null;
    const response = await fetch(endpoint(id), { signal: AbortSignal.timeout(10000) });
    if (response.status === 410) {
      if (this.handle !== id) return null;
      this.update({
        current: null,
        error:
          "Run unavailable after eviction or restart. Partial and unsaved evidence cannot survive a Worker restart. Saved tests and completions load separately. No work was replayed.",
      });
      return null;
    }
    if (!response.ok)
      throw new Error("Run status unavailable. Retry reading. No work was replayed.");
    const run = simulationRun.parse(await response.json());
    if (this.handle === id) {
      const current = this.view.current;
      if (current?.run.active !== false || !run.active) this.update({ current: progress(run) });
      if (!run.active) this.stopping = false;
    }
    return run;
  }
  loadResults = async () => {
    try {
      const response = await fetch(`/api/simulation-definitions/${this.saved.id}/runs`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Results unavailable");
      this.update({
        completed: simulationRun.array().parse(await response.json()),
        resultsError: null,
      });
    } catch {
      this.update({
        resultsError:
          "Completed results could not load. Read run status to retry. No simulation will run.",
      });
    }
  };
  connect() {
    this.connected = true;
    void this.refresh();
  }
  disconnect() {
    this.connected = false;
    clearTimeout(this.timer);
    if (
      this.handle !== undefined &&
      (this.stream !== null || this.view.current?.run.active === true)
    )
      void fetch(`${endpoint(this.handle)}/stop`, { method: "POST", keepalive: true }).catch(
        () => {},
      );
    this.stream?.abort();
  }
  watch() {
    clearTimeout(this.timer);
    if (
      !this.connected ||
      this.view.current?.run.active !== true ||
      (this.stream !== null && !this.stopping)
    )
      return;
    this.timer = setTimeout(() => {
      void this.refresh();
    }, 1000);
  }
  settle() {
    this.update({ operation: this.stopping ? "stopping" : this.stream ? "loading" : "ready" });
    this.watch();
  }
  refresh = async () => {
    if (this.refreshing) return;
    this.refreshing = true;
    this.update({ operation: "loading" });
    try {
      await Promise.all([this.read(), this.loadResults()]);
    } catch (error) {
      this.failure(error);
    } finally {
      this.refreshing = false;
      this.settle();
    }
  };
  failure(error: unknown) {
    this.update({
      error: error instanceof Error ? error.message : "Request unavailable. No automatic rerun.",
    });
  }
  async clearHandle() {
    if (this.handle === undefined) return;
    const response = await fetch(endpoint(this.handle), { method: "DELETE" });
    if (!response.ok) throw new Error("Temporary view could not clear. Retry reading its status.");
  }
  clear = async () => {
    if (this.view.operation !== "ready") return;
    this.update({ operation: "loading" });
    try {
      if (mustKeep(await this.read())) return;
      await this.clearHandle();
      const handles = { ...readLab().runHandles };
      delete handles[this.saved.id];
      saveLab({ runHandles: handles });
      this.handle = undefined;
      this.update({ current: null, error: null });
    } catch (error) {
      this.failure(error);
    } finally {
      this.update({ operation: "ready" });
    }
  };
  start = async () => {
    if (this.view.operation !== "ready") return;
    this.update({ operation: "loading", error: null });
    try {
      if (mustKeep(await this.read())) return;
      await this.clearHandle();
      if (!this.connected) return;
      const id = crypto.randomUUID();
      saveLab({ runHandles: { ...readLab().runHandles, [this.saved.id]: id } });
      this.handle = id;
      this.stopping = false;
      this.stream = new AbortController();
      this.update({
        current: progress({
          id,
          active: true,
          persistence: "none",
          evidence: null,
          humanReview: { status: "pending", note: "" },
        }),
      });
      await this.receive(id, this.stream.signal);
      await this.loadResults();
    } catch (error) {
      if (this.connected) {
        this.failure(error);
        await this.read().catch(() => {});
      }
    } finally {
      this.stream = null;
      this.settle();
    }
  };
  async receive(id: string, signal: AbortSignal) {
    const response = await fetch("/api/simulation-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        startId: id,
        definitionId: this.saved.id,
        expectedRevision: this.saved.revision,
      }),
    });
    if (!response.ok || !response.body) throw new Error(requestError(response.status));
    let ended = false;
    for await (const line of linesOf(response.body)) {
      const event = simulationRunEvent.parse(JSON.parse(line));
      this.observe(id, event, signal);
      if (event.kind === "run-end") ended = true;
    }
    if (!ended) throw new Error("Stream interrupted. Read run status. No automatic rerun.");
  }
  observe(id: string, event: SimulationRunEvent, signal: AbortSignal) {
    if (
      this.connected &&
      !signal.aborted &&
      (!this.stopping || event.kind === "run-end") &&
      this.view.current !== null
    )
      this.update({ current: runProgress(this.view.current, id, event) });
    if (event.kind !== "run-end") return;
    this.stopping = false;
    if (event.run.persistence === "saved")
      void fetch(endpoint(id), { method: "DELETE" }).catch(() => {});
  }
  stop = async () => {
    if (this.handle === undefined) return;
    this.stopping = true;
    this.update({ operation: "stopping" });
    try {
      const response = await fetch(`${endpoint(this.handle)}/stop`, { method: "POST" });
      if (!response.ok)
        throw new Error(
          "Stop could not be confirmed. Retry Stop or read status. Active work is not hidden.",
        );
      await this.read();
    } catch (error) {
      this.failure(error);
    } finally {
      this.settle();
    }
  };
  save = async () => {
    if (this.handle === undefined || this.view.operation !== "ready") return;
    this.update({ operation: "saving" });
    try {
      const response = await fetch(`${endpoint(this.handle)}/save`, { method: "POST" });
      const run = simulationRun.parse(await response.json());
      this.update({
        current: progress(run),
        error: response.ok
          ? null
          : "Evidence is still unsaved. Retry save without rerunning models or tools.",
      });
      await this.loadResults();
    } catch {
      this.update({
        error:
          "Save not acknowledged. Read status before retrying save. No model or tool was rerun.",
      });
    } finally {
      this.update({ operation: "ready" });
    }
  };
}

/** Owns one selected test's handle. Navigation stops work; reload and recovery only read evidence. */
export function useSimulationRun(saved: SavedSimulationDefinition) {
  const [controller] = useState(() => new RunController(saved));
  const view = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useEffect(() => {
    controller.connect();
    return () => {
      controller.disconnect();
    };
  }, [controller]);
  const { start, stop, save, refresh, clear, loadResults } = controller;
  const startLabel =
    view.current !== null || (view.completed?.length ?? 0) > 0 ? "Run again" : "Run simulation";
  return { ...view, startLabel, start, stop, save, refresh, clear, loadResults };
}
