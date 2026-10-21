import { rowForKey, stagedRows } from "./awaiting";
import { useRef, useState, type KeyboardEvent } from "react";
import type { AnswerPhase, AwaitingInput } from "./awaiting";
import { Disclosure } from "./Disclosure";

// The way out when the agent does not word one for the moment: the user is never cornered.
const ELSEWHERE = "Chat about something else";

// Skip and Submit; Submit shows pressed while a host's answer goes in on the user's behalf.
function Actions(props: {
  canSubmit: boolean;
  pressed: boolean;
  onSkip: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="awaiting-actions">
      <button className="awaiting-action" onClick={props.onSkip}>
        Skip
      </button>
      <button
        className="awaiting-action awaiting-submit"
        disabled={!props.canSubmit}
        data-pressed={props.pressed || undefined}
        onClick={props.onSubmit}
      >
        Submit
      </button>
    </div>
  );
}

/**
 * "Needs you": the agent is blocked on a question, floating above the compose box (ADR-039).
 * Numbered tiles, after Claude's and Amp's question prompts (ADR-045): the agent's branches,
 * a concrete question answered in a field, and a way out ("Chat about something else", or the
 * agent's wording for the moment). Choosing is two steps: a click, a number key, or the arrow
 * keys select a tile, and Enter or Submit sends it; Skip sets the question aside.
 * The header folds the card to one line, so the user can read the thread above and come back.
 * @param onAnswer Sends a branch's label or the typed answer as the user's reply.
 * @param onElsewhere Sets the question aside and hands focus back to the compose box.
 * @param startCollapsed Open folded to its header (stories).
 * @param label What the card is called, on its header and to assistive technology: "Needs
 * attention" for the agent's question, or the host's own name for one it asks, such as "Snooze".
 * @param staged An answer a host is giving on the user's behalf, shown as a hand would give it:
 * its tile hovered, then selected, then Submit pressed (`AnswerPhase`), so a viewer sees what
 * was chosen before the card leaves.
 */
export function AwaitingInputCard({
  question,
  onAnswer,
  onElsewhere,
  startCollapsed = false,
  label = "Needs attention",
  staged,
}: {
  question: AwaitingInput;
  onAnswer: (answer: string) => void;
  onElsewhere: () => void;
  startCollapsed?: boolean;
  label?: string;
  staged?: { text: string; phase: AnswerPhase };
}) {
  const [open, setOpen] = useState(!startCollapsed);
  const [chosen, setChosen] = useState<number>();
  const [typed, setTyped] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const options = useRef<HTMLDivElement>(null);
  // Rows are 0-based here and shown 1-based: the branches, then the answer, then the way out.
  const answerRow = question.options.length;
  const elsewhereRow = answerRow + 1;
  const rows = elsewhereRow + 1;
  const labels = question.options.map((option) => option.label);
  const { hovered, selected } = stagedRows(labels, staged, chosen); // → rows shown hovered, selected
  const canSubmit = selected !== undefined && (selected !== answerRow || typed.trim() !== "");

  // Selecting moves focus to the chosen tile, as in any radio group, so Enter sends it.
  function select(row: number) {
    setChosen(row);
    if (row === answerRow) field.current?.focus();
    else options.current?.querySelectorAll<HTMLElement>(".awaiting-tile")[row]?.focus();
  }

  function submit() {
    if (selected === undefined || !canSubmit) return;
    if (selected === answerRow) onAnswer(typed.trim());
    else if (selected === elsewhereRow) onElsewhere();
    else onAnswer(question.options[selected].label);
  }

  // Number keys and arrows select, Enter sends (Space or a click also selects a tile).
  // While typing only Enter is ours; the header and the action buttons keep their own Enter.
  function keys(event: KeyboardEvent) {
    if (!open) return;
    const target = event.target; // → EventTarget: a tile, the field, the header or an action
    const ownEnter =
      target instanceof Element && target.closest(".disclosure-header, .awaiting-actions") !== null;
    if (event.key === "Enter") {
      if (ownEnter) return;
      submit();
    } else {
      if (target instanceof HTMLInputElement) return;
      const row = rowForKey(event.key, selected, rows); // → number | undefined
      if (row === undefined) return;
      select(row);
    }
    event.preventDefault();
  }

  // A branch or the way out. The typed answer is a field, not a radio, so each radio carries its
  // row's number and the row count, and is announced as the badge shows it ("3 of 3").
  const tile = (row: number) => ({
    role: "radio" as const,
    "aria-checked": selected === row,
    "aria-posinset": row + 1,
    "aria-setsize": rows,
    "data-selected": selected === row || undefined,
    "data-hover": hovered === row || undefined,
  });

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- keys bubble here from the card's buttons and field; jsx-a11y's docs say to disable for bubbled events
    <section
      className="awaiting attention-surface"
      aria-label={label}
      data-open={open || undefined}
      onKeyDown={keys}
    >
      <Disclosure
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
        summary={
          <>
            <span className="awaiting-label">{label}</span>
            {!open && <span className="awaiting-summary">{question.question}</span>}
          </>
        }
      >
        <h3 className="awaiting-question" id="awaiting-question">
          {question.question}
        </h3>
        <div
          ref={options}
          className="awaiting-options"
          role="radiogroup"
          aria-labelledby="awaiting-question"
        >
          {question.options.map((option, i) => (
            <button
              key={option.label}
              className="tile awaiting-tile"
              onClick={() => {
                select(i);
              }}
              {...tile(i)}
            >
              <span className="awaiting-key">{i + 1}</span>
              <span>
                <span className="awaiting-option">{option.label}</span>
                {option.detail && <span className="awaiting-detail">{option.detail}</span>}
              </span>
            </button>
          ))}
          {/* A radio cannot hold a text field, so this row is a label around one: a click
              anywhere on the tile focuses the field, and focusing it selects the row. */}
          <label
            className="tile awaiting-tile awaiting-answer"
            data-selected={selected === answerRow || undefined}
          >
            <span className="awaiting-key">{answerRow + 1}</span>
            <input
              ref={field}
              className="field"
              value={typed}
              onFocus={() => {
                setChosen(answerRow);
              }}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
              placeholder={question.answer.placeholder}
              aria-label={question.answer.placeholder}
            />
          </label>
          <button
            className="tile awaiting-tile"
            onClick={() => {
              select(elsewhereRow);
            }}
            {...tile(elsewhereRow)}
          >
            <span className="awaiting-key">{elsewhereRow + 1}</span>
            <span className="awaiting-option">{question.elsewhere ?? ELSEWHERE}</span>
          </button>
        </div>
        <Actions
          canSubmit={canSubmit}
          pressed={staged?.phase === "pressed"}
          onSkip={onElsewhere}
          onSubmit={submit}
        />
      </Disclosure>
    </section>
  );
}
