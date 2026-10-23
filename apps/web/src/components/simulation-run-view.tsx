import { Button } from "@yaklabs/ui/components/button";
import { Separator } from "@yaklabs/ui/components/separator";
import type { SavedSimulationDefinition, SimulationRun } from "gateway/simulation-contract";
import { useEffect } from "react";
import { SavedReview } from "./simulation-definition";
import { useSimulationRun } from "./simulation-run";
import { RunEvidence, RunMetadata } from "./simulation-run-evidence";
import { RunHumanReview } from "./simulation-run-review";

type Runner = ReturnType<typeof useSimulationRun>;
const statusLabels = {
  running: "Running. No grade yet.",
  completed: "Completed",
  cancelled: "Stopped. No grade.",
  "timed-out": "Time limit reached. No grade.",
  "limit-exhausted": "Run limit reached. No grade.",
  errored: "Execution error. No grade.",
};

function CompletedRun({
  run,
  label,
  reload,
}: {
  run: SimulationRun;
  label: string;
  reload: () => Promise<unknown>;
}) {
  if (!run.evidence) return null;
  return (
    <article aria-label={`${label} completed result`} className="lab-completed-run">
      <h2>{label}</h2>
      <RunMetadata run={run} />
      <RunEvidence run={run} messages={run.evidence.result.conversation} />
      <RunHumanReview key={run.id} run={run} reload={reload} />
    </article>
  );
}

function CurrentRun({ runner }: { runner: Runner }) {
  if (runner.current === null) return null;
  const { run, messages } = runner.current;
  if (runner.completed?.some((item) => item.id === run.id) === true) return null;
  const result = run.evidence?.result;
  return (
    <article aria-label="Current run evidence">
      <h2>
        {result
          ? statusLabels[result.status]
          : run.active
            ? "Running. No grade yet."
            : "No completed evidence"}
      </h2>
      {run.active && (
        <p className="lab-muted">
          Scenario is still active. Do not treat any support turn as a final grade.
        </p>
      )}
      <RunMetadata run={run} />
      {result && result.error !== null && <p role="alert">{result.error}</p>}
      <RunEvidence run={run} messages={messages} />
    </article>
  );
}

function RunStartStop({ runner }: { runner: Runner }) {
  const run = runner.current?.run;
  const busy = runner.operation !== "ready";
  const active = run?.active ?? false;
  const unsaved = run?.persistence === "unsaved";
  return (
    <>
      <Button
        variant="outline"
        className="btn"
        disabled={busy || active || unsaved}
        onClick={() => {
          void runner.start();
        }}
      >
        {runner.startLabel}
      </Button>
      {active && (
        <Button
          variant="outline"
          className="btn"
          onClick={() => {
            void runner.stop();
          }}
        >
          {runner.operation === "stopping" ? "Stop requested · retry" : "Stop"}
        </Button>
      )}
    </>
  );
}

function RunRecoveryActions({ runner }: { runner: Runner }) {
  const run = runner.current?.run;
  const busy = runner.operation !== "ready";
  return (
    <>
      {run && !run.active && run.persistence !== "unsaved" && run.persistence !== "saving" && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            void runner.clear();
          }}
        >
          Clear temporary view
        </Button>
      )}
      {run?.persistence === "unsaved" && (
        <Button
          variant="outline"
          className="btn"
          disabled={busy || run.active}
          onClick={() => {
            void runner.save();
          }}
        >
          Retry save only
        </Button>
      )}
    </>
  );
}

function RunControls({ runner }: { runner: Runner }) {
  const active = runner.current?.run.active === true;
  const activity =
    runner.operation === "stopping"
      ? "Stop requested. Still active until the server confirms termination."
      : active
        ? runner.current?.activity
        : "Ready. No automatic run.";
  return (
    <section aria-label="Run controls" className="lab-run-controls">
      <h2>Test this saved simulation</h2>
      <p className="lab-muted">
        Each explicit run starts fresh synthetic payments. Stop active work before leaving this
        view. Save unsaved evidence first. Reload only reads; it never resubmits. Clearing a
        temporary view never deletes saved tests or results.
      </p>
      <div className="lab-header-actions">
        <RunStartStop runner={runner} />
        <Button
          variant="ghost"
          disabled={
            ["loading", "saving"].includes(runner.operation) ||
            (active && runner.operation !== "stopping")
          }
          onClick={() => {
            void runner.refresh();
          }}
        >
          Read run status
        </Button>
        <RunRecoveryActions runner={runner} />
      </div>
      <output className="lab-muted" aria-live="polite">
        {runner.operation === "loading" && !active ? "Loading run evidence…" : activity}
      </output>
      {runner.error !== null && <p role="alert">{runner.error}</p>}
    </section>
  );
}

function ComparisonWarnings({
  runs,
  saved,
}: {
  runs: SimulationRun[];
  saved: SavedSimulationDefinition;
}) {
  const differs = runs.some(
    (run) =>
      run.evidence?.result.simulation?.revision !== saved.revision ||
      JSON.stringify(run.evidence.result.workflow) !== JSON.stringify(saved.workflow.config),
  );
  const latest = runs.at(0);
  const previous = runs.at(1);
  const modelsDiffer =
    latest !== undefined &&
    previous !== undefined &&
    JSON.stringify(latest.evidence?.models) !== JSON.stringify(previous.evidence?.models);
  return (
    <>
      {differs && (
        <p role="alert">
          Definition revisions or accepted settings differ from the selected test. This is not a
          controlled same-version comparison.
        </p>
      )}
      {modelsDiffer && (
        <p role="alert">
          Model identities or reported calls differ. Compare the actual identities below; these
          trials are not guaranteed equivalent.
        </p>
      )}
    </>
  );
}

function Comparison({ runner, saved }: { runner: Runner; saved: SavedSimulationDefinition }) {
  return (
    <section aria-label="Completed result comparison">
      <h2>Completed results</h2>
      <p className="lab-muted">
        Latest two completions across revisions. Stopped, timed-out and errored runs do not replace
        these results. Repeated success does not establish model reliability.
      </p>
      <ComparisonWarnings runs={runner.completed ?? []} saved={saved} />
      {runner.completed === null && runner.resultsError === null && (
        <output>Loading completed results…</output>
      )}
      {runner.completed?.length === 0 && (
        <p>
          No completed results yet. Only a normal customer stop completes and grades a scenario.
        </p>
      )}
      {runner.resultsError !== null && <p role="alert">{runner.resultsError}</p>}
      {runner.completed?.map((run, index) => (
        <CompletedRun
          key={run.id}
          run={run}
          label={index === 0 ? "Latest" : "Previous"}
          reload={runner.loadResults}
        />
      ))}
      {runner.completed?.length === 1 && (
        <p className="lab-muted">
          One completed result. Run again explicitly to compare two trials.
        </p>
      )}
    </section>
  );
}

/** Explicit saved-test runs, partial facts, and latest-two completed evidence share one view. */
export function SimulationRunView({
  saved,
  onEdit,
  onLock,
}: {
  saved: SavedSimulationDefinition;
  onEdit: () => void;
  onLock: (locked: boolean) => void;
}) {
  const runner = useSimulationRun(saved);
  const locked =
    runner.current?.run.active === true ||
    runner.current?.run.persistence === "unsaved" ||
    runner.operation !== "ready";
  useEffect(() => {
    onLock(locked);
  }, [locked, onLock]);
  useEffect(
    () => () => {
      onLock(false);
    },
    [onLock],
  );
  return (
    <div className="lab-saved-run">
      <SavedReview saved={saved} onEdit={onEdit} locked={locked} />
      <Separator />
      <RunControls runner={runner} />
      <CurrentRun runner={runner} />
      <Separator />
      <Comparison runner={runner} saved={saved} />
    </div>
  );
}
