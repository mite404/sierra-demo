import { useEffect, useRef, useState } from "react";
import { AgentTree } from "./AgentTree";
import { CatalogCard } from "./CatalogCard";
import { Disclosure } from "./Disclosure";
import { ChildThreadIcon } from "./icons";
import type { StepStatus, Work, WorkLabel, WorkStep } from "./reply";

// Where a step stands, as one plain word first on its row: words, never colour alone, tell a
// finished step from one that did not finish (ADR-139).
const STATUS_WORDS: Record<StepStatus, string> = {
  pending: "Waiting",
  running: "Running",
  done: "Done",
  failed: "Unavailable",
  cancelled: "Stopped",
};

// One step: where it stands, what it was (a branch before it when it ran as a child thread),
// what it found, how it found it, and the card that backs it.
function StepRow({ step, carries }: { step: WorkStep; carries: boolean }) {
  const word = STATUS_WORDS[step.status];
  return (
    <li className="work-step" data-status={step.status} data-step={step.id}>
      <p className="work-step-status">
        {step.status === "running" ? (
          <>
            {/* The glyph's label announces the state; the word beside it is for the eye. */}
            <AgentTree label={word} />
            <span aria-hidden="true">{word}</span>
          </>
        ) : (
          word
        )}
      </p>
      <p className="work-step-label">
        {step.threadId !== undefined && (
          <span className="work-step-thread">
            <ChildThreadIcon />
            <span className="work-step-thread-name">Child thread: </span>
          </span>
        )}
        {step.label}
      </p>
      {step.outcome !== undefined && <p className="work-step-outcome">{step.outcome}</p>}
      {step.basis !== undefined && step.basis.length > 0 && (
        <ul className="work-step-basis" aria-label="How this was found">
          {step.basis.map((line, i) => (
            // A step settles whole, so its lines never move: a line's place is its identity.
            // oxlint-disable-next-line react/no-array-index-key -- see above
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {step.evidence !== undefined && (
        <CatalogCard
          payload={step.evidence}
          context="thread"
          draggable={carries}
          shareable={false}
        />
      )}
    </li>
  );
}

// The narration the reply moved past and its technical lines.
function TechnicalLines({ work }: { work: Work }) {
  return (
    <div className="work-technical">
      {work.narration.length > 0 && (
        <section aria-label="Earlier progress narration">
          <p className="work-technical-title">Earlier progress narration</p>
          <ul className="work-narration">
            {work.narration.map((line, i) => (
              // Narration is only ever appended, so a line's place is its identity.
              // oxlint-disable-next-line react/no-array-index-key -- see above
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      {work.logs.length > 0 && (
        <pre className="work-logs">
          <code>{work.logs.join("\n")}</code>
        </pre>
      )}
    </div>
  );
}

// The technical lines one level deeper, under the steps, for a reader who wants to check the
// work rather than read it.
function TechnicalDetails({ work }: { work: Work }) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      summary="Technical details"
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
    >
      <TechnicalLines work={work} />
    </Disclosure>
  );
}

// What Work details folds: the steps, with the technical lines a disclosure deeper; or, for work
// with no steps, the technical lines themselves, since a disclosure holding only another
// disclosure is one fold too many (Ethan).
function WorkBody({ work, carries }: { work: Work; carries: boolean }) {
  const technical = work.logs.length > 0 || work.narration.length > 0;
  if (work.steps.length === 0) return technical && <TechnicalLines work={work} />;
  return (
    <>
      <ol className="work-list">
        {work.steps.map((step) => (
          <StepRow key={step.id} step={step} carries={carries} />
        ))}
      </ol>
      {technical && <TechnicalDetails work={work} />}
    </>
  );
}

/**
 * The event that asks a reply's Work details to unfold, sent to the disclosure's root, so a jump
 * to one of its steps finds the step's row on the page.
 */
export const REVEAL_STEP = "work-reveal-step";

/**
 * The one disclosure above a reply (ADR-139, amended): mounted when the work starts, so it never
 * appears over text someone is reading, its header says what the reply is doing now (live, with
 * the working glyph) and then what the work amounted to, with a count beside it (`workLabel`).
 * Folded under it: each step's state in a word, its label, its outcome in plain prose, the
 * lines that say how it was found, and the card that backs it. The superseded narration and the
 * technical logs sit one disclosure deeper, so a reader who only wants the answer never has to
 * read them; with no steps they are all it folds, so they sit in it directly. Both start folded;
 * each turn keeps its own, and unfolds on `REVEAL_STEP`.
 * @param cardsCarry Whether an evidence card's header carries it out onto the canvas (ADR-089).
 */
export function WorkDetails({
  work,
  label,
  cardsCarry,
}: {
  work: Work;
  label: WorkLabel;
  cardsCarry?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    const reveal = () => {
      setOpen(true);
    };
    el?.addEventListener(REVEAL_STEP, reveal);
    return () => el?.removeEventListener(REVEAL_STEP, reveal);
  }, []);
  return (
    <div ref={root} className="work-details" data-live={label.live || undefined}>
      <Disclosure
        summary={
          label.live ? (
            <span className="work-live">
              {/* The glyph's label announces the state; the words beside it are for the eye. */}
              <AgentTree label={label.label} />
              <span aria-hidden="true">{label.label}</span>
            </span>
          ) : (
            label.label
          )
        }
        detail={label.detail}
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
      >
        <WorkBody work={work} carries={cardsCarry !== false} />
      </Disclosure>
    </div>
  );
}
