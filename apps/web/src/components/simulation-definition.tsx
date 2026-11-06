import { Button } from "@yaklabs/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@yaklabs/ui/components/dialog";
import {
  simulationChecks,
  type SavedSimulationDefinition,
  type SimulationDefinitionInput,
  type SimulationDraft,
} from "gateway/simulation-contract";
import type { ReactNode } from "react";
import { Monitor } from "lucide-react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className="lab-group-title">{title}</h3>
      {children}
    </>
  );
}

// Configured checks describe the test setup, never its execution grade.
function ExpectedBehavior({ checks }: { checks: SimulationDefinitionInput["checks"] }) {
  return (
    <section className="lab-definition" aria-label="Expected agent behavior">
      <Section title="Expected agent behavior">
        <ul className="lab-configured-checks">
          {checks.map((id) => (
            <li key={id} data-check-id={id}>
              <span className="lab-configured-dot" aria-hidden="true" />
              <span>
                {simulationChecks[id].label}
                <span className="sr-only">. Configured expectation, not a run result</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </section>
  );
}

// Static review of the validated definition; no editable values or approval state.
function DefinitionSummary({
  definition,
  saved = false,
}: {
  definition: SimulationDefinitionInput;
  saved?: boolean;
}) {
  return (
    <section aria-label="Simulation summary" className="lab-definition">
      <h2>{definition.name}</h2>
      <Section title="User instructions">
        <p className={saved ? "lab-saved-instructions" : undefined}>{definition.instructions}</p>
      </Section>
      <p className="lab-device">
        <span>Device type</span> <Monitor size={14} aria-hidden="true" /> Desktop web
      </p>
      <ExpectedBehavior checks={definition.checks} />
      <Section title="Helpful wording (not automatically checked)">
        <p>{definition.humanGuidance}</p>
      </Section>
    </section>
  );
}

/** An immutable saved revision stays visible until an explicit conversational edit begins. */
export function SavedReview({ saved }: { saved: SavedSimulationDefinition }) {
  return <DefinitionSummary definition={saved.definition} saved />;
}

/** Shows only validated expectations gathered so far, without a save or run control. */
export function AuthorReview({
  expectedChecks,
  busy,
  error,
}: {
  expectedChecks: SimulationDefinitionInput["checks"];
  busy: boolean;
  error: string | null;
}) {
  return (
    <aside className="lab-author-review" aria-label="Read-only simulation review">
      <ExpectedBehavior checks={expectedChecks} />
      <output className="lab-muted">
        {busy
          ? "Understanding your expectations…"
          : expectedChecks.length > 0
            ? "Configured so far. Nothing has been created or run."
            : "Describe what should happen for the customer. Expectations appear here as you provide enough detail."}
      </output>
      {error !== null && <p role="alert">{error}</p>}
    </aside>
  );
}

/** Explicit creation approves the full server-held snapshot. Dismissal never saves it. */
export function ProposalReview({
  draft,
  open,
  saving,
  onOpenChange,
  onCreate,
  onRevise,
}: {
  draft: SimulationDraft;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onRevise: () => void;
}) {
  return (
    <Dialog
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="lab-results-popover lab-proposal-popover" initialFocus>
        <DialogHeader>
          <DialogTitle>Ready to create your simulation</DialogTitle>
          <DialogDescription>
            There is enough information to test this customer story. Review the summary. Nothing has
            been saved or run.
          </DialogDescription>
        </DialogHeader>
        <div className="lab-results-body">
          <DefinitionSummary definition={draft.definition} />
          <div className="lab-review-actions">
            <Button variant="outline" disabled={saving} onClick={onCreate}>
              {saving ? "Creating simulation" : "Create simulation"}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={onRevise}>
              Revise in chat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
