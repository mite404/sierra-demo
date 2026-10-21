import type { PointerEvent, ReactNode } from "react";
import { armCarry } from "./carry";
import { inGripZone } from "./gripZone";
import type { SharedCard } from "./share";

// A press on a control inside the header, such as the share button and its menu, stays theirs.
const CONTROLS = "a, button, input, select, textarea, [role='menu']";

// The whole card rides the pointer, not just its handle (ADR-089): the card is both the
// picture and what dims while it is carried.
function carryCard(event: PointerEvent<HTMLElement>, card: SharedCard, title: string): void {
  const { target, currentTarget } = event;
  const control = target instanceof Element ? target.closest(CONTROLS) : null;
  if (control !== null && currentTarget.contains(control)) return;
  const lift = currentTarget.closest(".card");
  armCarry(event, {
    carried: { kind: "card", card, title },
    lift: lift instanceof HTMLElement ? lift : undefined,
  });
}

// Marks the header while the pointer is within its grip's circle, so the dots wake by where the
// pointer is, not by what is under it: a title that wraps to fill the header no longer turns them
// off and on as the pointer crosses its words (primitives.css).
function trackGrip(event: PointerEvent<HTMLElement>): void {
  const header = event.currentTarget;
  if (inGripZone(header.getBoundingClientRect(), event.clientX, event.clientY)) {
    header.dataset.gripNear = "";
  } else {
    delete header.dataset.gripNear;
  }
}

// Puts the grip away as the pointer leaves the header.
function leaveGrip(event: PointerEvent<HTMLElement>): void {
  delete event.currentTarget.dataset.gripNear;
}

/**
 * The top of every card (ADR-062): a title, optional lines above and below it, and
 * actions on the right, such as a badge or the share button. A flush line separates the
 * header from the card's body, edge to edge.
 * @param eyebrow A small line above the title (page context only).
 * @param leading A control before the title, such as a host's collapse (ADR-134).
 * @param actions Right-aligned controls, e.g. <ShareButton />.
 * @param drag When set, the header is the handle that carries the whole card out of its
 * thread (ADR-089), with the same envelope a share link holds; the card rides the pointer,
 * and the card left behind dims until the carry ends. Its grip wakes while the pointer is near
 * the header's middle.
 */
export function CardHeader({
  title,
  eyebrow,
  leading,
  actions,
  drag,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  drag?: { card: SharedCard; title: string };
}) {
  return (
    <header
      className="card-heading"
      data-carry={drag === undefined ? undefined : ""}
      onPointerDown={
        drag === undefined
          ? undefined
          : (event) => {
              carryCard(event, drag.card, drag.title);
            }
      }
      onPointerMove={drag === undefined ? undefined : trackGrip}
      onPointerLeave={drag === undefined ? undefined : leaveGrip}
    >
      {leading !== undefined && <div className="header-leading">{leading}</div>}
      <div className="card-heading-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </header>
  );
}
