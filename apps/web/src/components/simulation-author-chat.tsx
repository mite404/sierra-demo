import { ChatThreadPanel } from "@yaklabs/catalog";
import type { ThreadHandle } from "@yaklabs/catalog/thread";
import { Button } from "@yaklabs/ui/components/button";
import {
  savedSimulationDefinition,
  type SavedSimulationDefinition,
  type SimulationAuthorSource,
  type SimulationDefinitionInput,
  type SimulationDraft,
} from "gateway/simulation-contract";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { builderMessages, createBuilderAgent, type BuilderNotice } from "./builder-agent";
import { AuthorReview, ProposalReview } from "./simulation-definition";
import { saveLab, type RestoredAuthor } from "./simulation-persistence";

type DraftState = (
  | { kind: "ready"; draft: SimulationDraft | null }
  | { kind: "saving"; draft: SimulationDraft }
  | { kind: "busy" | "closed"; draft: null }
) & { error: string | null; expectedChecks: SimulationDefinitionInput["checks"] };
type ChatProps = {
  source: SimulationAuthorSource;
  restored: RestoredAuthor | null;
  onSaved: (saved: SavedSimulationDefinition) => void;
  onLock: (locked: boolean) => void;
};
function initialState(restored: RestoredAuthor | null): DraftState {
  if (restored !== null && (restored.closed || restored.active))
    return {
      kind: "closed",
      draft: null,
      expectedChecks: [],
      error:
        "Previous reply interrupted. No automatic resubmission. Open a saved test or create another simulation explicitly.",
    };
  return {
    kind: "ready",
    draft: restored?.draft ?? null,
    expectedChecks: restored?.draft?.definition.checks ?? restored?.expectedChecks ?? [],
    error: null,
  };
}

function nextState(state: DraftState, notice: BuilderNotice): DraftState {
  switch (notice.kind) {
    case "start":
      return { kind: "busy", draft: null, expectedChecks: [], error: null };
    case "author-end":
      return notice.error === null
        ? {
            kind: "ready",
            draft: notice.draft,
            expectedChecks: notice.draft?.definition.checks ?? notice.expectedChecks,
            error: null,
          }
        : { kind: "closed", draft: null, expectedChecks: [], error: notice.error };
    case "cancelled":
      return {
        kind: "closed",
        draft: null,
        expectedChecks: [],
        error: "Authoring cancelled. No proposal saved. Start another chat explicitly.",
      };
    case "error":
      return { kind: "closed", draft: null, expectedChecks: [], error: notice.error };
    case "session":
    case "question":
    case "text":
    case "tool-start":
    case "workflow-end":
      return state;
    default: {
      const exhaustive: never = notice;
      return exhaustive;
    }
  }
}

function useAuthor(source: SimulationAuthorSource, restored: RestoredAuthor | null) {
  const [state, setState] = useState(() => initialState(restored));
  const [agent] = useState(() =>
    createBuilderAgent({
      endpoint: "/api/simulation-author",
      initial: { source },
      resume: restored
        ? { id: restored.id, closed: restored.closed || restored.active }
        : undefined,
      observe(notice) {
        if (notice.kind === "session") saveLab({ authorId: notice.id });
        setState((previous) => nextState(previous, notice));
      },
    }),
  );
  return { state, setState, agent };
}

function useSaveProposal(
  state: DraftState,
  setState: Dispatch<SetStateAction<DraftState>>,
  onSaved: ChatProps["onSaved"],
) {
  const saving = useRef<AbortController | null>(null);
  useEffect(() => () => saving.current?.abort(), []);
  return async function saveProposal() {
    if (state.kind !== "ready" || !state.draft || saving.current) return;
    const reviewed = state.draft;
    const controller = new AbortController();
    saving.current = controller;
    setState({
      kind: "saving",
      draft: reviewed,
      expectedChecks: reviewed.definition.checks,
      error: null,
    });
    try {
      const response = await fetch(`/api/simulation-drafts/${reviewed.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: reviewed.expectedRevision }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Save not acknowledged");
      const saved = savedSimulationDefinition.parse(await response.json());
      if (!controller.signal.aborted) onSaved(saved);
    } catch {
      if (!controller.signal.aborted)
        setState({
          kind: "closed",
          draft: null,
          expectedChecks: [],
          error:
            "Save was not acknowledged. The proposal may be stale or already consumed. Reload the library and reopen the latest revision before editing. No automatic retry.",
        });
    } finally {
      if (!controller.signal.aborted) saving.current = null;
    }
  };
}

function EmptyAuthor({ editing, onStart }: { editing: boolean; onStart: () => void }) {
  return (
    <div className="lab-welcome">
      <h2>
        {editing ? "Revise your saved test in chat." : "Describe the way you help customers."}
      </h2>
      <p>
        Tell the agent how your team should handle subscription refunds. It asks only for missing
        expectations and customer details, then prepares a simulation for your review.
      </p>
      {editing && (
        <p>Frozen settings stay the same. Describe your changes; the old revision remains saved.</p>
      )}
      {!editing && (
        <Button variant="outline" className="btn" onClick={onStart}>
          Start with a refund workflow
        </Button>
      )}
    </div>
  );
}

/** One lesson conversation gathers expectations before explicit creation of its server-held draft. */
export function AuthorChat({ source, restored, onSaved, onLock }: ChatProps) {
  const thread = useRef<ThreadHandle>(null);
  const { state, setState, agent } = useAuthor(source, restored);
  const save = useSaveProposal(state, setState, onSaved);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const summaryOpen = state.draft !== null && dismissed !== state.draft.id;
  const locked = state.kind === "busy" || state.kind === "saving";
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
    <div className="lab-author-workspace" data-author-summary={summaryOpen || undefined}>
      <div className="lab-conversation" inert={summaryOpen || state.kind === "saving"}>
        <ChatThreadPanel
          ref={thread}
          agent={agent}
          thread={{
            title: "Subscription refunds",
            messages: builderMessages(restored?.messages ?? []),
          }}
          cardsCarry={false}
          attachmentsEnabled={false}
          dictation={{ source: "microphone" }}
          width={undefined}
          headerActions={<span className="lab-role">Your agent</span>}
          empty={
            <EmptyAuthor
              editing={"definitionId" in source && !source.create}
              onStart={() => thread.current?.setDraft("Help our team handle subscription refunds.")}
            />
          }
          footnote="Live Kimi K3 authoring · synthetic payments · explicit creation required"
        />
        {state.draft && !summaryOpen && (
          <Button
            variant="outline"
            onClick={() => {
              setDismissed(null);
            }}
          >
            Review simulation summary
          </Button>
        )}
      </div>
      <AuthorReview
        expectedChecks={state.expectedChecks}
        busy={state.kind === "busy"}
        error={state.error}
      />
      {state.draft && (
        <ProposalReview
          draft={state.draft}
          open={summaryOpen}
          saving={state.kind === "saving"}
          onOpenChange={(open) => {
            setDismissed(open ? null : (state.draft?.id ?? null));
          }}
          onCreate={() => {
            void save();
          }}
          onRevise={() => {
            setDismissed(state.draft?.id ?? null);
            thread.current?.setDraft("Revise the proposal: ");
          }}
        />
      )}
    </div>
  );
}
