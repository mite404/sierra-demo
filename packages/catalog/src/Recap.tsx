import { formatIdle, type RecapItem } from "./recapRules";

// The recap's live status is its headline alone. A status region reads out whole, so the
// jump buttons stay outside it rather than being re-read each time the idle time moves on.
function RecapHeadline({ idleMs }: { idleMs: number }) {
  return (
    <p>
      <output>
        <strong>Recap</strong>
        <span className="muted"> · {formatIdle(idleMs)} since your last message</span>
      </output>
    </p>
  );
}

/**
 * "Previously on": an outcomes-first recap shown above the compose box after the user
 * has been away (ADR-018). Each item jumps to its evidence: the card or step that recorded it, or
 * the turn that holds it.
 * It only reports what happened; questions for the user live in AwaitingInputCard (ADR-039).
 * When `collapsed`, it shrinks to a chip so it never competes with typing.
 */
export function Recap({
  items,
  idleMs,
  collapsed,
  onExpand,
  onDismiss,
  onJump,
}: {
  items: RecapItem[];
  idleMs: number;
  collapsed: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  onJump: (item: RecapItem) => void;
}) {
  if (collapsed)
    return (
      <button className="recap-chip attention-surface" onClick={onExpand}>
        Recap
      </button>
    );

  return (
    <section className="recap attention-surface" aria-label="Recap">
      <header className="recap-header">
        <RecapHeadline idleMs={idleMs} />
        <button className="recap-close" onClick={onDismiss} aria-label="Dismiss recap">
          ×
        </button>
      </header>
      <ul>
        {items.map((item) => (
          <li key={item.turnId + item.text}>
            <button
              onClick={() => {
                onJump(item);
              }}
            >
              <span className="recap-text">{item.text}</span>
              <span className="recap-go" aria-hidden="true">
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
