import type { Carried } from "@yaklabs/catalog/carry";
import type { LaneId } from "@yaklabs/runtime";
import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { useLanding, type Landing } from "./canvas-carry";
import { CanvasCard } from "./canvas-card";
import { panByWheel, usePan } from "./canvas-pan";
import { Lane, type LaneReports, type LaneView } from "./lane";

export type { LaneView } from "./lane";
import { displacement, useReorder } from "./lane-reorder";
import { LaneSeparator } from "./lane-separator";
import { SplashDrawing } from "./splash";

// The open space at the end of the row: the whole canvas when it is empty, with the splash
// behind its words, and a column as wide as a new lane once lanes exist, so there is always
// somewhere to drop the next thing and it shows the room that thing will take. It steps aside
// for an incoming lane. The button is the catalog's own, the one a card's "Show my work" uses.
function OpenSpace({
  receiving,
  splash,
  onBlank,
}: {
  receiving: boolean;
  /** Whether the row is empty: the space fills the canvas, with the splash behind its words. */
  splash: boolean;
  onBlank: () => void;
}) {
  return (
    <div
      data-ground=""
      style={{
        transform: receiving
          ? "translateX(calc(var(--lane-default-width) + var(--canvas-grid)))"
          : "",
      }}
      className={`open-space lane-shift @container relative isolate flex h-full ${splash ? "min-w-[320px] flex-1" : "w-(--lane-default-width) shrink-0"} flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] border border-dashed border-hairline p-6 text-center`}
    >
      {splash && <SplashDrawing />}
      <p className="font-serif text-xl text-balance text-ink">
        Drag a text selection or UI card here
      </p>
      <button type="button" className="btn btn-sm" data-blank="" onClick={onBlank}>
        Create blank thread
      </button>
    </div>
  );
}

// Inert, so the preview neither takes pointer hits nor duplicates controls in the tab order.
function DropPreview({ landing }: { landing: Landing | null }) {
  if (landing === null) return null;
  return (
    <div
      data-drop-preview=""
      inert
      aria-hidden="true"
      className="lane-shift"
      style={{ transform: `translateX(${landing.left}px)` }}
    >
      {landing.carried.kind === "card" ? (
        <CanvasCard card={landing.carried.card} />
      ) : (
        <section className="thread-panel" style={{ height: "100%" }}>
          <header className="thread-header">
            <h2>New thread</h2>
          </header>
          <div className="thread-scroll">
            <blockquote>{landing.carried.text}</blockquote>
          </div>
        </section>
      )}
    </div>
  );
}

// What the lanes report: a collapse flipped, a close, a move to another slot, and a width kept.
type LaneActions = LaneReports & {
  onMove: (id: LaneId, to: number) => void;
  onResize: (id: LaneId, px: number) => void;
};

function laneTransform(
  landing: Landing | null,
  drag: ReturnType<typeof useReorder>["drag"],
  index: number,
): string {
  return landing !== null && index >= landing.at
    ? "translateX(calc(var(--lane-default-width) + var(--canvas-grid)))"
    : displacement(drag, index);
}

// The lanes with the gap after each: a lane lifts by its title bar, a gap drags its width.
function LaneRow({
  lanes,
  actions,
  reorderable,
  landing,
}: {
  lanes: LaneView[];
  actions: LaneActions;
  reorderable: boolean;
  landing: Landing | null;
}) {
  const { onMove, onResize } = actions;
  const reorder = useReorder(onMove, reorderable);
  // The width of the lane whose gap is being dragged, until the drag lets go and it is kept.
  const [resizing, setResizing] = useState<{ id: LaneId; px: number } | null>(null);
  return lanes.map((lane, index) => (
    <Fragment key={lane.id}>
      <Lane
        lane={lane}
        width={resizing?.id === lane.id ? resizing.px : lane.width}
        lifted={reorder.drag?.move?.id === lane.id}
        style={{
          transform: laneTransform(landing, reorder.drag, index),
        }}
        handlers={reorder.laneFor(lane.id, index)}
        reports={actions}
      />
      <LaneSeparator
        title={lane.title}
        resizable={!lane.collapsed}
        style={{
          transform: laneTransform(landing, reorder.drag, index),
        }}
        onResize={(px, kept) => {
          setResizing(kept ? null : { id: lane.id, px });
          if (kept) onResize(lane.id, px);
        }}
        onMove={(step) => {
          onMove(lane.id, index + step);
        }}
      />
    </Fragment>
  ));
}

// A lane on the canvas by its id, or null while it is not there.
function laneIn(row: HTMLElement | null, id: LaneId): HTMLElement | null {
  const lane = row?.querySelector(`[data-lane="${CSS.escape(id)}"]`);
  return lane instanceof HTMLElement ? lane : null;
}

// What a lane hands the focus to: an open lane's close, at its title bar's far end, where the
// collapse comes first in the bar; a collapsed one has only its expand.
function focusTargetIn(lane: HTMLElement | null): Element | null {
  return (
    lane?.querySelector("[data-lane-close]") ?? lane?.querySelector("[data-lane-toggle]") ?? null
  );
}

// Where the focus goes when the lane `id` closes with it: the next lane's close (its expand,
// when it is collapsed and has no close), else the one before's, else Create blank thread.
function focusAfter(row: HTMLElement, lanes: LaneView[], id: LaneId): Element | null {
  const at = lanes.findIndex((lane) => lane.id === id);
  const neighbour = lanes.slice(at + 1).at(0) ?? lanes.slice(0, at).at(-1);
  if (neighbour === undefined) return row.querySelector("[data-blank]");
  return focusTargetIn(laneIn(row, neighbour.id));
}

// Before the lane `id` closes, hands on the focus it holds, which would otherwise fall back to
// the start of the page.
function handOnFocus(row: HTMLElement, lanes: LaneView[], id: LaneId): void {
  if (laneIn(row, id)?.contains(document.activeElement) !== true) return;
  const target = focusAfter(row, lanes, id);
  if (target instanceof HTMLElement) target.focus();
}

// Brings a lane into view and flashes it once.
function flash(lane: HTMLElement): void {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  lane.scrollIntoView({ block: "nearest", inline: "center", behavior: still ? "auto" : "smooth" });
  lane.dataset.flash = "";
  const settle = () => {
    delete lane.dataset.flash;
  };
  lane.addEventListener("animationend", settle, { once: true });
}

// Flashes the focused lane once for each visit, as soon as the lane is on the canvas: a lane
// that arrives after the visit did (reopened for it) flashes when it lands.
function useFocusedLane(
  row: RefObject<HTMLElement | null>,
  focus: LaneId | null,
  visit: string,
  lanes: LaneView[],
) {
  const shown = useRef<string | null>(null); // → the visit whose lane has flashed
  const target = lanes.some((lane) => lane.id === focus) ? focus : null;
  useEffect(() => {
    if (target === null) {
      shown.current = null;
      return;
    }
    const lane = shown.current === visit ? null : laneIn(row.current, target);
    if (lane === null) return;
    shown.current = visit;
    flash(lane);
  }, [row, target, visit]);
}

/**
 * The compose canvas (ADR-089): a row of lanes that grows to the right, with open space at
 * the end for the next thing. The gap after each lane drags the lane's width, a lane's title
 * bar drags it to another place in the row, and the ground drags to pan. A lane collapses to a
 * slim strip and back (ADR-133), and the whole strip drags it. The whole row takes a
 * carried card or highlight (ADR-091): a dimmed preview occupies its destination slot and
 * neighboring lanes step aside, as they do during reorder. On a phone the row is view-only (ADR-122): it
 * still scrolls sideways, but a lane's title bar no longer lifts it. The canvas keeps no lanes
 * of its own: it reports each change, and the caller's lanes come back changed. A lane that
 * closes with the focus in it hands the focus on to its neighbour.
 */
export function Canvas({
  lanes,
  focus,
  visit,
  actions,
  onBlank,
  onCarry,
  reorderable,
}: {
  lanes: LaneView[];
  /** The lane to bring into view and flash, a focused child's. */
  focus: LaneId | null;
  /** The visit to the focused lane's address: each new one flashes the lane again. */
  visit: string;
  actions: LaneActions;
  onBlank: () => void;
  onCarry: (carried: Carried, at: number) => void;
  /** Whether a lane's title bar takes hold of it; off makes the row view-only (ADR-122). */
  reorderable: boolean;
}) {
  const row = useRef<HTMLElement>(null);
  const pan = usePan();
  const landing = useLanding(row, onCarry);
  useFocusedLane(row, focus, visit, lanes);
  useEffect(() => (row.current === null ? undefined : panByWheel(row.current)), []);
  const onClose = (id: LaneId) => {
    if (row.current !== null) handOnFocus(row.current, lanes, id);
    actions.onClose(id);
  };
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the ground pans by pointer and wheel; the keyboard reaches every lane and the Create blank thread button
    <section
      ref={row}
      aria-label="Compose canvas"
      data-drop={landing === null ? undefined : ""}
      data-reorder={reorderable}
      className="canvas relative flex h-full overflow-x-auto px-(--canvas-grid) py-4"
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={pan.onPointerUp}
      onPointerCancel={pan.onPointerUp}
    >
      <LaneRow
        lanes={lanes}
        actions={{ ...actions, onClose }}
        reorderable={reorderable}
        landing={landing}
      />
      <DropPreview landing={landing} />
      <OpenSpace receiving={landing !== null} splash={lanes.length === 0} onBlank={onBlank} />
      {/* The ground goes on for a pane past the open space: the canvas has no right edge. */}
      {lanes.length > 0 && <div data-ground="" aria-hidden="true" className="w-full shrink-0" />}
    </section>
  );
}
