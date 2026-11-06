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
import { RunBusinessEvidence, RunEvidence, WorkflowGoals } from "./simulation-run-evidence";
import { simulationRowStatus, type SimulationRowStatus } from "./simulation-run-state";

type Runner = ReturnType<typeof useSimulationRun>;

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
  definition,
}: {
  run: SimulationRun;
  messages: NonNullable<Runner["current"]>["messages"];
  definition: SavedSimulationDefinition["definition"];
}) {
  const [view, setView] = useState<"results" | "proof" | "conversation">("results");
  const resultsButton = useRef<HTMLButtonElement>(null);
  const result = run.evidence?.result;
  const completed = result?.status === "completed";
  const resultsOpen = !run.active && view !== "conversation";
  return (
    <article
      aria-label={completed ? "Latest completed result" : "Current run evidence"}
      data-results-open={resultsOpen || undefined}
    >
      <div className="lab-run-heading">
        <h2 className="lab-run-status">{simulationRowStatus(run).label}</h2>
        {!run.active && (
          <>
            <span className="lab-muted">Conversation ended · Read-only</span>
            <Button
              ref={resultsButton}
              variant="outline"
              onClick={() => {
                setView("results");
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
          if (!open) setView("conversation");
        }}
      >
        <DialogContent className="lab-results-popover" initialFocus finalFocus={resultsButton}>
          <DialogHeader>
            <DialogTitle>
              {view === "proof"
                ? "Database proof"
                : completed
                  ? "Simulation complete"
                  : "Simulation incomplete"}
            </DialogTitle>
            <DialogDescription>
              {view === "proof"
                ? "Recorded synthetic payment state and tool attempts, not the agent's success claim."
                : simulationRowStatus(run).label}
            </DialogDescription>
          </DialogHeader>
          <div className="lab-results-body">
            {view === "proof" && result ? (
              <RunBusinessEvidence result={result} />
            ) : (
              <WorkflowGoals definition={definition} run={run} />
            )}
            <div className="lab-header-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setView("conversation");
                }}
              >
                View conversation
              </Button>
              {result && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setView(view === "proof" ? "results" : "proof");
                  }}
                >
                  {view === "proof" ? "Back to results" : "View Database Proof"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
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
  onStatus: (id: string, status: SimulationRowStatus) => void;
}) {
  const runner = useSimulationRun(saved);
  const locked =
    runner.current?.run.active === true ||
    runner.current?.run.persistence === "unsaved" ||
    runner.operation !== "ready";
  const run = selectedRun(runner);
  const status = simulationRowStatus(run);
  const statusKind = status.kind;
  const statusLabel = runner.operation === "loading" && !run ? "Loading results" : status.label;
  useEffect(() => {
    onLock(locked);
  }, [locked, onLock]);
  useEffect(() => {
    onStatus(saved.id, { kind: statusKind, label: statusLabel });
  }, [saved.id, statusKind, statusLabel, onStatus]);
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
      </section>
    </div>
  );
}
