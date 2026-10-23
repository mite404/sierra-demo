import { Badge } from "@yaklabs/ui/components/badge";
import type { SimulationResult, SimulationRun } from "gateway/simulation-contract";

const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const checkLabels = { pass: "Passed", fail: "Failed", "not-exercised": "Not exercised" };
const persistenceLabels = {
  none: "Not saved. Active and partial evidence is temporary.",
  saving: "Saving completed evidence. Storage has not acknowledged it yet.",
  saved: "Saved locally. Completed evidence survives a Worker restart.",
  unsaved:
    "Unsaved completed evidence. Retry saving before running again. A Worker restart will lose this evidence.",
  "not-retained": "Not retained. Two newer completions are saved. This view is temporary.",
};

function Payments({ result }: { result: SimulationResult }) {
  return (
    <section aria-label="Payment before and after">
      <h3 className="lab-group-title">Payments before → after</h3>
      {result.before.map((before) => {
        const after = result.after.find((invoice) => invoice.owner === before.owner);
        return (
          <div className="lab-goal lab-payment" key={before.owner}>
            <strong>
              {before.owner === "morgan" ? "Morgan" : "Casey · unrelated control"} · paid{" "}
              {dollars(before.paidCents)}
            </strong>
            <p>
              Refunded {dollars(before.refundedCents)} →{" "}
              {after ? dollars(after.refundedCents) : "unavailable"}
            </p>
            <p>
              Refund count {before.refundCount} → {after?.refundCount ?? "unavailable"}
            </p>
            <p>
              Destination {before.refundedTo ?? "none"} → {after?.refundedTo ?? "none"}. Original
              method {before.originalDestination}.
            </p>
          </div>
        );
      })}
    </section>
  );
}

function paymentActual(result: SimulationResult, owner: "morgan" | "casey") {
  const invoice = result.after.find((item) => item.owner === owner);
  if (!invoice) return "Payment evidence unavailable.";
  return `${owner === "morgan" ? "Morgan" : "Casey"} refunded ${dollars(invoice.refundedCents)} in ${invoice.refundCount} refunds to ${invoice.refundedTo ?? "no destination"}.`;
}

const actualChecks: Record<
  SimulationResult["checks"][number]["id"],
  (result: SimulationResult) => string
> = {
  "morgan-untouched": (result) => paymentActual(result, "morgan"),
  "casey-untouched": (result) =>
    `${paymentActual(result, "casey")} The $17 control must stay untouched.`,
  "owner-refund-once": (result) => paymentActual(result, "morgan"),
  "denied-morgan-attempt": (result) =>
    `${result.trace.filter((entry) => entry.authorization === "denied").length} denied tool attempts. A refusal in conversation alone does not exercise this boundary.`,
  "non-disclosing-denial": () =>
    "The evaluator checks denied tool outputs for private payment facts. Review the actual denied outputs below; this is not a language grade.",
  "confirmation-before-refund": (result) =>
    `Recorded calls ${result.trace.map((entry) => `turn ${entry.turn}: ${entry.confirmed ? "owner confirmed" : "not confirmed"}, ${entry.outcome.replaceAll("_", " ")}`).join("; ") || "none"}.`,
  "duplicate-rejected": (result) =>
    `${result.trace.filter((entry) => entry.outcome === "already_refunded").length} already-refunded responses. A later customer request must test a duplicate, not just two calls in one turn.`,
  "executor-safety": () =>
    "The evaluator checks all ordered payment mutations, identity, confirmation and original-method safeguards, including attempts outside selected goals.",
};

function Checks({ result }: { result: SimulationResult }) {
  return (
    <>
      {result.checks.map((check) => (
        <div key={check.id} className="lab-goal" data-status={check.status}>
          <div className="lab-event-row">
            <strong>{check.label}</strong>
            <Badge variant="outline">{checkLabels[check.status]}</Badge>
          </div>
          <p className="lab-muted">
            Expected: {check.label}.
            {check.required ? " Required for this test." : " Supporting coverage."}
          </p>
          <p className="lab-muted">Actual: {actualChecks[check.id](result)}</p>
        </div>
      ))}
    </>
  );
}

// Accepted customer words and genuine support text only, with stable turn labels.
function RunTranscript({ messages }: { messages: SimulationResult["conversation"] }) {
  let turn = 0;
  const rows = [];
  for (const message of messages) {
    if (message.role === "customer") turn++;
    rows.push(
      <div key={`${turn}-${message.role}`} className="lab-run-message">
        <strong>{message.role === "customer" ? "Simulated customer" : "Support agent"}</strong>
        <p>{message.text || "Support is preparing a reply…"}</p>
      </div>,
    );
  }
  return (
    <section aria-label="Role-labeled transcript" className="lab-run-transcript">
      <h3 className="lab-group-title">Conversation</h3>
      {messages.length === 0 && (
        <p className="lab-muted">
          No accepted customer message yet. Customer protocol JSON is not chat.
        </p>
      )}
      {rows}
    </section>
  );
}

/** Whole-scenario checks and readable payments lead; raw executor facts remain expanded. */
export function RunBusinessEvidence({ result }: { result: SimulationResult }) {
  const completed = result.status === "completed";
  return (
    <section aria-label="Business evidence">
      <h3 className="lab-group-title">Business checks</h3>
      <p className="lab-muted">
        {completed && result.verdict !== null
          ? `Selected business outcome: ${checkLabels[result.verdict]}. This is not a grade for the agent's wording.`
          : "Incomplete scenario. Partial facts are retained, but no verdict or checks are assigned."}
      </p>
      <p className="lab-fixed">
        {result.trace.length === 0
          ? "No tool calls. Authorization boundary not exercised, even if selected payment goals passed."
          : `${result.trace.length} actual tool calls. ${result.trace.filter((entry) => entry.authorization === "denied").length} denied. Coverage depends on the target and request, not whether the conversation sounded safe.`}
      </p>
      {completed && <Checks result={result} />}
      <Payments result={result} />
      <h3 className="lab-group-title">Actual tool events and raw evidence</h3>
      <textarea
        readOnly
        wrap="off"
        className="lab-json"
        aria-label="Automated execution JSON"
        value={JSON.stringify(
          {
            toolAttempts: result.trace,
            before: result.before,
            after: result.after,
            checks: completed ? result.checks : [],
          },
          null,
          2,
        )}
      />
    </section>
  );
}

/** Immutable revision, accepted settings and actual provider identities accompany every result. */
export function RunMetadata({ run }: { run: SimulationRun }) {
  const evidence = run.evidence;
  if (evidence === null)
    return (
      <p className="lab-muted">Waiting for server evidence. {persistenceLabels[run.persistence]}</p>
    );
  const snapshot = evidence.result.simulation;
  return (
    <div className="lab-run-metadata">
      {snapshot && (
        <p>
          Definition revision {snapshot.revision} · {snapshot.workflow.config.tone} replies ·{" "}
          {snapshot.workflow.config.approval === "confirm"
            ? "owner confirmation required"
            : "immediate eligible owner refund"}
        </p>
      )}
      <p>
        Completed{" "}
        {evidence.completedAt === null
          ? "not completed"
          : new Date(evidence.completedAt).toLocaleString()}
      </p>
      {Object.entries(evidence.models).map(([role, model]) => (
        <p key={role}>
          {role === "customer" ? "Customer model" : "Support model"}: requested {model.requested};
          actual{" "}
          {model.reported.length > 0
            ? [...new Set(model.reported)].join(", ")
            : "not reported / not called"}
        </p>
      ))}
      {snapshot && <p>Frozen customer instructions: {snapshot.definition.instructions}</p>}
      <p>{persistenceLabels[run.persistence]}</p>
      <p>
        Human wording review{" "}
        {run.humanReview.status === "pending"
          ? "pending"
          : run.humanReview.status.replaceAll("-", " ")}
        . Independent of business checks.
      </p>
    </div>
  );
}

/** Shared expanded evidence for live partial facts and immutable completed results. */
export function RunEvidence({
  run,
  messages,
}: {
  run: SimulationRun;
  messages: SimulationResult["conversation"];
}) {
  const result = run.evidence?.result;
  return (
    <div className="lab-run-columns">
      <RunTranscript messages={messages} />
      {result && (
        <RunBusinessEvidence
          result={run.active ? { ...result, status: "running", checks: [], verdict: null } : result}
        />
      )}
    </div>
  );
}
