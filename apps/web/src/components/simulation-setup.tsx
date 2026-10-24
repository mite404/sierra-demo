import { ChatThreadPanel } from "@yaklabs/catalog";
import type { ThreadHandle } from "@yaklabs/catalog/thread";
import { Button } from "@yaklabs/ui/components/button";
import {
  acceptedWorkflow,
  type AcceptedWorkflow,
  type WorkflowConfig,
} from "gateway/simulation-contract";
import { Check, LockKeyhole, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { builderMessages, createBuilderAgent } from "./builder-agent";
import { saveLab, type RestoredEmployee } from "./simulation-persistence";
import { ScenarioInvitation } from "./simulation-library";

/** Employee configuration stays in its own existing catalog thread, separate from customer tests. */
export function SimulationSetup({
  onAccepted,
  onTry,
  onCreate,
  restored,
}: {
  onAccepted: (receipt: AcceptedWorkflow) => void;
  onTry: () => void;
  onCreate: () => void;
  restored: RestoredEmployee | null;
}) {
  const thread = useRef<ThreadHandle>(null);
  const acceptance = useRef<AbortController | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [inviting, setInviting] = useState(false);
  useEffect(() => () => acceptance.current?.abort(), []);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<WorkflowConfig | null>(restored?.plan ?? null);
  const [session, setSession] = useState(restored?.id);
  const [accepted, setAccepted] = useState(Boolean(restored?.accepted));
  const [error, setError] = useState<string | null>(
    restored?.closed || restored?.active
      ? "Previous reply incomplete. No automatic resubmission. Reload to retry recovery."
      : null,
  );
  const [agent] = useState(() =>
    createBuilderAgent({
      endpoint: "/api/workflow",
      initial: {},
      resume: restored
        ? {
            id: restored.id,
            closed: restored.closed || restored.active || Boolean(restored.accepted),
          }
        : undefined,
      observe(notice) {
        if (notice.kind === "start") {
          setBusy(true);
          setPlan(null);
          setError(null);
        }
        if (notice.kind === "session") {
          saveLab({ employeeId: notice.id });
          setSession(notice.id);
        }
        if (notice.kind === "workflow-end") {
          setBusy(false);
          setPlan(notice.plan);
          setError(notice.error);
        }
        if (notice.kind === "cancelled" || notice.kind === "error") {
          setBusy(false);
          setPlan(null);
          setError(
            notice.kind === "error"
              ? notice.error
              : "Configuration cancelled. No automatic resubmission.",
          );
        }
      },
    }),
  );
  const accept = async () => {
    if (!session || !plan || busy || accepted || acceptance.current) return;
    const controller = new AbortController();
    acceptance.current = controller;
    setAccepting(true);
    try {
      const response = await fetch(`/api/workflow/${session}/accept`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Acceptance failed");
      const receipt = acceptedWorkflow.parse(await response.json());
      if (controller.signal.aborted) return;
      onAccepted(receipt);
      setAccepted(true);
      setInviting(true);
    } catch {
      if (!controller.signal.aborted)
        setError("The plan could not be accepted. Retry accepting the reviewed proposal.");
    } finally {
      if (!controller.signal.aborted) {
        acceptance.current = null;
        setAccepting(false);
      }
    }
  };
  return (
    <div className="lab-setup-workspace">
      <ScenarioInvitation open={inviting} onOpenChange={setInviting} onCreate={onCreate} />
      <div className="lab-conversation" inert={accepting}>
        <ChatThreadPanel
          ref={thread}
          agent={agent}
          thread={{
            title: "Build your refund agent",
            messages: builderMessages(restored?.messages ?? []),
          }}
          cardsCarry={false}
          textOnly
          width={undefined}
          headerActions={<span className="lab-role">Your agent</span>}
          empty={
            <div className="lab-welcome">
              <MessageSquare size={24} aria-hidden="true" />
              <h2>Describe the way you help customers.</h2>
              <p>
                Tell the agent how your team should handle subscription refunds. It will ask about
                the supported choices, then propose a workflow for you to review.
              </p>
              <Button
                variant="outline"
                className="btn"
                onClick={() =>
                  thread.current?.setDraft("Help our team handle subscription refunds.")
                }
              >
                Start with a refund workflow
              </Button>
            </div>
          }
          footnote="Live model responses · one supported workflow · no business actions in this conversation"
        />
      </div>
      <section aria-label="Workflow review" className="lab-setup-review">
        <h3 className="lab-group-title">{accepted ? "Accepted workflow" : "Workflow review"}</h3>
        {plan ? (
          <>
            <div className="lab-event-row">
              <MessageSquare size={16} aria-hidden="true" />
              <strong>Response style</strong>
              <span>{plan.tone === "brief" ? "Brief" : "Warm"}</span>
            </div>
            <div className="lab-event-row">
              <Check size={16} aria-hidden="true" />
              <strong>Refund approval</strong>
              <span>{plan.approval === "confirm" ? "Confirm first" : "Immediate"}</span>
            </div>
          </>
        ) : (
          <p className="lab-muted">
            {busy
              ? "The live agent is responding. A complete proposal will appear here."
              : "Describe the workflow and answer the agent's question. Nothing is accepted automatically."}
          </p>
        )}
        <p className="lab-fixed">
          <LockKeyhole size={16} aria-hidden="true" />
          Ownership before access. One refund per payment. Original payment method only.
        </p>
        <div className="lab-review-actions">
          <Button
            variant="outline"
            className="btn"
            disabled={!plan || busy || accepted || accepting}
            onClick={() => {
              void accept();
            }}
          >
            {accepted ? "Workflow accepted" : accepting ? "Accepting workflow" : "Accept workflow"}
          </Button>
          <Button variant="outline" className="btn" disabled={!accepted} onClick={onCreate}>
            Create simulation
          </Button>
          <Button variant="ghost" disabled={!accepted} onClick={onTry}>
            Try it as a customer
          </Button>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
