import { Disclosure } from "@yaklabs/catalog";
import { Button } from "@yaklabs/ui/components/button";
import { Separator } from "@yaklabs/ui/components/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@yaklabs/ui/components/dialog";
import type { SavedSimulationDefinition, SimulationRun } from "gateway/simulation-contract";
import { useEffect, useRef, useState } from "react";
import { SavedReview } from "./simulation-definition";
import { useSimulationRun } from "./simulation-run";
import { RunEvidence, RunMetadata, WorkflowGoals } from "./simulation-run-evidence";
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

function runStatus(run: SimulationRun | undefined) {
  if (!run) return "Not run yet";
  if (run.active) return statusLabels.running;
  const result = run.evidence?.result;
  if (!result) return "No completed evidence";
  if (result.status !== "completed") return statusLabels[result.status];
  const verdict =
    result.verdict === "pass"
      ? "Business checks passed"
      : result.verdict === "fail"
        ? "Business checks failed"
        : "Checks not exercised";
  return `${verdict} · ${run.humanReview.status === "pending" ? "human review pending" : run.humanReview.status.replaceAll("-", " ")}`;
}

function RunRecoveryActions({ runner }: { runner: Runner }) {
  const run = runner.current?.run;
  const busy = runner.operation !== "ready";
  if (!run || run.active) return null;
  if (run.persistence === "unsaved")
    return (
      <Button variant="outline" disabled={busy} onClick={() => void runner.save()}>
        Retry save only
      </Button>
    );
  if (run.persistence === "saving") return null;
  return (
    <Button variant="ghost" disabled={busy} onClick={() => void runner.clear()}>
      Clear temporary view
    </Button>
  );
}

function runActivity(runner: Runner) {
  if (runner.operation === "stopping")
    return "Stop requested. Still active until the server confirms termination.";
  if (runner.current?.run.active) return runner.current.activity;
  return runner.operation === "loading" ? "Loading run evidence…" : "Ready. No automatic run.";
}

function RunControls({
  runner,
  enabled,
  onEdit,
  locked,
}: {
  runner: Runner;
  enabled: boolean;
  onEdit: () => void;
  locked: boolean;
}) {
  const busy = runner.operation !== "ready";
  return (
    <section aria-label="Run controls" className="lab-run-controls">
      <div className="lab-header-actions">
        {runner.current?.run.active === true && (
          <Button
            variant="outline"
            onClick={() => {
              void runner.stop();
            }}
          >
            {runner.operation === "stopping" ? "Stop requested · retry" : "Stop"}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={busy && runner.operation !== "stopping"}
          onClick={() => {
            void runner.refresh();
          }}
        >
          Read run status
        </Button>
        <Button variant="ghost" disabled={locked} onClick={onEdit}>
          Edit in chat
        </Button>
        <RunRecoveryActions runner={runner} />
      </div>
      <output className="lab-muted" aria-live="polite">
        {runActivity(runner)}
      </output>
      {!enabled && (
        <p className="lab-muted">Accept your current agent before starting a new run.</p>
      )}
      {runner.error !== null && <p role="alert">{runner.error}</p>}
      {runner.resultsError !== null && <p role="alert">{runner.resultsError}</p>}
    </section>
  );
}

function ResultConversation({
  run,
  messages,
  reload,
  definition,
}: {
  run: SimulationRun;
  messages: NonNullable<Runner["current"]>["messages"];
  reload: Runner["loadResults"];
  definition: SavedSimulationDefinition["definition"];
}) {
  const [technical, setTechnical] = useState(false);
  const [review, setReview] = useState(false);
  const [resultsDismissed, setResultsDismissed] = useState(false);
  const resultsButton = useRef<HTMLButtonElement>(null);
  const result = run.evidence?.result;
  const resultsOpen = !run.active && !resultsDismissed;
  return (
    <article
      aria-label={
        result?.status === "completed" ? "Latest completed result" : "Current run evidence"
      }
    >
      <div className="lab-run-heading">
        <h2 className="lab-run-status">{runStatus(run)}</h2>
        {!run.active && (
          <>
            <span className="lab-muted">Conversation ended · Read-only</span>
            <Button
              ref={resultsButton}
              variant="outline"
              onClick={() => {
                setResultsDismissed(false);
              }}
            >
              View results
            </Button>
          </>
        )}
      </div>
      {result?.error && <p role="alert">{result.error}</p>}
      <RunEvidence
        run={run}
        messages={messages}
        definition={definition}
        obscured={resultsOpen}
        showGoals={false}
      />
      <Dialog
        modal={false}
        open={resultsOpen}
        onOpenChange={(open) => {
          setResultsDismissed(!open);
        }}
      >
        <DialogContent className="lab-results-popover" initialFocus finalFocus={resultsButton}>
          <DialogHeader>
            <DialogTitle>
              {result?.status === "completed" ? "Simulation complete" : "Simulation incomplete"}
            </DialogTitle>
            <DialogDescription>
              {runStatus(run)}
              <br />
              The conversation is now read-only.
            </DialogDescription>
          </DialogHeader>
          <div className="lab-results-body">
            <WorkflowGoals definition={definition} run={run} />
            <p className="lab-review">
              Human wording review{" "}
              {run.humanReview.status === "pending"
                ? "pending"
                : run.humanReview.status.replaceAll("-", " ")}
              . Business checks do not grade helpfulness, privacy, or truthful wording.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setResultsDismissed(true);
              }}
            >
              View conversation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Disclosure
        summary="Technical details"
        open={technical}
        onToggle={() => {
          setTechnical(!technical);
        }}
      >
        <RunMetadata run={run} />
      </Disclosure>
      {!run.active && result?.status === "completed" && (
        <Disclosure
          summary="Human wording review"
          open={review}
          onToggle={() => {
            setReview(!review);
          }}
        >
          <RunHumanReview key={run.id} run={run} reload={reload} />
        </Disclosure>
      )}
    </article>
  );
}

function PreviousResults({ runner, saved }: { runner: Runner; saved: SavedSimulationDefinition }) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      summary="Previous runs and comparison"
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
    >
      <p className="lab-muted">
        Latest two completions. Stopped or failed attempts do not replace these results. Repeated
        success does not establish model reliability.
      </p>
      {runner.completed?.length === 2 &&
        JSON.stringify(runner.completed[0]?.evidence?.models) !==
          JSON.stringify(runner.completed[1]?.evidence?.models) && (
          <p role="alert">
            Model identities or reported calls differ. Compare the actual identities below; these
            trials are not guaranteed equivalent.
          </p>
        )}
      {runner.completed?.map((run, index) => (
        <article key={run.id} aria-label={`${index === 0 ? "Latest" : "Previous"} saved evidence`}>
          <h3>
            {index === 0 ? "Latest" : "Previous"} · {runStatus(run)}
          </h3>
          {(run.evidence?.result.simulation?.revision !== saved.revision ||
            JSON.stringify(run.evidence?.result.workflow) !==
              JSON.stringify(saved.workflow.config)) && (
            <p role="alert">
              Definition revisions or accepted settings differ. This is not a controlled
              same-version comparison.
            </p>
          )}
          <RunMetadata run={run} />
          <RunEvidence
            run={run}
            messages={run.evidence?.result.conversation ?? []}
            definition={saved.definition}
          />
        </article>
      ))}
      {runner.completed?.length === 0 && <p>No completed results yet.</p>}
    </Disclosure>
  );
}

function selectedRun(runner: Runner) {
  const current = runner.current?.run;
  if (current?.active) return current;
  return (
    runner.completed?.find((item) => item.id === current?.id) ?? current ?? runner.completed?.[0]
  );
}

function conversationMessages(runner: Runner, run: SimulationRun) {
  return runner.current?.messages ?? run.evidence?.result.conversation ?? [];
}

/** Pins the saved scenario above independently scrolling, real streamed conversation and evidence. */
export function SimulationRunView({
  saved,
  onEdit,
  onLock,
  runFormId,
  enabled,
  onStatus,
}: {
  saved: SavedSimulationDefinition;
  onEdit: () => void;
  onLock: (locked: boolean) => void;
  runFormId: string;
  enabled: boolean;
  onStatus: (id: string, status: string) => void;
}) {
  const runner = useSimulationRun(saved);
  const locked =
    runner.current?.run.active === true ||
    runner.current?.run.persistence === "unsaved" ||
    runner.operation !== "ready";
  const run = selectedRun(runner);
  const status = runner.operation === "loading" && !run ? "Loading results" : runStatus(run);
  useEffect(() => {
    onLock(locked);
  }, [locked, onLock]);
  useEffect(() => {
    onStatus(saved.id, status);
  }, [saved.id, status, onStatus]);
  useEffect(
    () => () => {
      onLock(false);
    },
    [onLock],
  );
  return (
    <div className="lab-saved-run">
      <form
        id={runFormId}
        onSubmit={(event) => {
          event.preventDefault();
          if (enabled && !locked) void runner.start();
        }}
      />
      <div className="lab-pinned-summary">
        <SavedReview saved={saved} />
      </div>
      <Separator className="lab-summary-separator" />
      <section className="lab-run-scroll" aria-label="Scenario conversation and results">
        <RunControls runner={runner} enabled={enabled} onEdit={onEdit} locked={locked} />
        {run ? (
          <ResultConversation
            key={run.id}
            run={run}
            messages={conversationMessages(runner, run)}
            reload={runner.loadResults}
            definition={saved.definition}
          />
        ) : (
          <>
            <div className="lab-welcome">
              <h2>Ready for a conversation</h2>
              <p>
                Play this scenario to see how your agent responds. Each run starts with fresh
                synthetic payments.
              </p>
            </div>
            <WorkflowGoals definition={saved.definition} />
          </>
        )}
        <PreviousResults runner={runner} saved={saved} />
      </section>
    </div>
  );
}
