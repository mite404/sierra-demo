import { Button } from "@yaklabs/ui/components/button";
import { simulationHumanReview, type SimulationRun } from "gateway/simulation-contract";
import { useId, useState } from "react";

const labels = {
  pending: "Pending review",
  "meets-guidance": "Meets guidance",
  "needs-improvement": "Needs improvement",
};
type Review = SimulationRun["humanReview"];

function ReviewFields({
  review,
  setReview,
  busy,
}: {
  review: Review;
  setReview: (review: Review) => void;
  busy: boolean;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={`${id}-status`}>Your assessment</label>
      <select
        id={`${id}-status`}
        value={review.status}
        onChange={(event) => {
          setReview({
            ...review,
            status: simulationHumanReview.shape.status.parse(event.target.value),
          });
        }}
        disabled={busy}
      >
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-note`}>Optional review note</label>
      <textarea
        id={`${id}-note`}
        className="field"
        maxLength={2000}
        value={review.note}
        onChange={(event) => {
          setReview({ ...review, note: event.target.value });
        }}
        disabled={busy}
      />
    </>
  );
}

function useReview(run: SimulationRun, reload: () => Promise<unknown>) {
  const [review, setReview] = useState(run.humanReview);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/simulation-runs/${run.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
      });
      if (!response.ok) throw new Error("Review unavailable");
      setReview(simulationHumanReview.parse(await response.json()));
      setNotice("Human review saved. Business evidence is unchanged.");
      await reload();
    } catch {
      setNotice(
        "Review was not acknowledged. Your note is kept here. Retry saving the review, not running the simulation.",
      );
    } finally {
      setBusy(false);
    }
  };
  return { review, setReview, busy, notice, submit };
}

/** Only people assess wording. Saving a review never changes computed business evidence. */
export function RunHumanReview({
  run,
  reload,
}: {
  run: SimulationRun;
  reload: () => Promise<unknown>;
}) {
  const form = useReview(run, reload);
  return (
    <section aria-label="Human wording review" className="lab-run-review">
      <h3 className="lab-group-title">Human wording review · {labels[run.humanReview.status]}</h3>
      <p className="lab-muted">{run.evidence?.result.simulation?.definition.humanGuidance}</p>
      <p className="lab-muted">
        Check helpfulness, privacy and claims against the evidence. Invented Billing / Request
        Refund steps or duplicate-charge assurances are not proved by a successful refund.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
      >
        <ReviewFields {...form} />
        <Button variant="outline" className="btn" disabled={form.busy} type="submit">
          {form.busy ? "Saving review" : "Save human review"}
        </Button>
        {form.notice !== null && <output className="lab-muted">{form.notice}</output>}
      </form>
    </section>
  );
}
