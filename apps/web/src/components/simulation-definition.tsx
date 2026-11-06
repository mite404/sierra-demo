import { Button } from "@yaklabs/ui/components/button";
import {
  simulationChecks,
  type AcceptedWorkflow,
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
      <Section title="Expected agent behavior">
        <ul>
          {definition.checks.map((id) => (
            <li key={id}>{simulationChecks[id].label}</li>
          ))}
        </ul>
      </Section>
      {!saved && <p>{definition.humanGuidance}</p>}
    </section>
  );
}

/** An immutable saved revision stays visible until an explicit conversational edit begins. */
export function SavedReview({ saved }: { saved: SavedSimulationDefinition }) {
  return <DefinitionSummary definition={saved.definition} saved />;
}

function NoProposal({ busy, workflow }: { busy: boolean; workflow: AcceptedWorkflow }) {
  return (
    <>
      <h2>Review before saving</h2>
      <p className="lab-muted">
        {busy
          ? "The author is responding. No complete reviewed proposal yet."
          : "Describe a customer situation in chat. Review the proposal here, then save it to run a simulation."}
      </p>
      <p className="lab-muted">
        Your agent uses {workflow.config.tone} replies and{" "}
        {workflow.config.approval === "confirm"
          ? "asks the owner to confirm refunds"
          : "refunds eligible owner payments immediately"}
        .
      </p>
    </>
  );
}

/** Only a ready server-held proposal can enable the human save control. */
export function AuthorReview({
  draft,
  kind,
  workflow,
  error,
  onSave,
  onRevise,
}: {
  draft: SimulationDraft | null;
  kind: "ready" | "busy" | "saving" | "closed";
  workflow: AcceptedWorkflow;
  error: string | null;
  onSave: () => void;
  onRevise: () => void;
}) {
  return (
    <aside className="lab-author-review" aria-label="Read-only simulation review">
      <p className="lab-role">
        {draft
          ? `Unsaved proposal · ${draft.expectedRevision === 0 ? "new test" : `editing revision ${draft.expectedRevision}`}`
          : "Read-only review"}
      </p>
      {draft ? (
        <DefinitionSummary definition={draft.definition} />
      ) : (
        <NoProposal busy={kind === "busy"} workflow={workflow} />
      )}
      <div className="lab-review-actions">
        <Button
          variant="outline"
          className="btn"
          disabled={!draft || kind !== "ready"}
          onClick={onSave}
        >
          {kind === "saving" ? "Saving simulation" : "Save simulation"}
        </Button>
        <Button variant="ghost" disabled={kind !== "ready" || !draft} onClick={onRevise}>
          Revise in chat
        </Button>
      </div>
      <p className="lab-muted">
        Save approves only this reviewed proposal. Any new message clears it until a complete
        revision arrives. No customer actions happen here.
      </p>
      {error !== null && <p role="alert">{error}</p>}
    </aside>
  );
}
