import type { LaneId } from "@yaklabs/runtime";
import { Button } from "@yaklabs/ui/components/button";
import { ChevronsLeftRight, ChevronsRightLeft, X } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { LaneHandlers } from "./lane-reorder";

/**
 * One lane on the canvas: its name, the width it was left at (null: the default), whether it is
 * collapsed to a strip (ADR-133), what kind of lane it is (a collapsed card is a half-height
 * strip, so it reads as a card beside a thread's full one), and its content, drawn with the
 * lane's collapse (`leading`) before the title and its close (`trailing`) at the far end of its
 * own title bar, or without either while the lane is collapsed.
 */
export type LaneView = {
  id: LaneId;
  title: string;
  width: number | null;
  collapsed: boolean;
  kind: "thread" | "card";
  render: (leading: ReactNode, trailing: ReactNode) => ReactNode;
};

/** What a lane reports: its collapse flipped, and its close. */
export type LaneReports = {
  onCollapse: (id: LaneId, collapsed: boolean) => void;
  onClose: (id: LaneId) => void;
};

// The lane's collapse, in the container it folds (ADR-134): the thread's or the card's title
// bar while it is open, the head of its strip while it is collapsed. It says what it will do.
// A 20px fill with a 13px glyph, a fifth under the bar's other controls (Ethan): in the bar it
// sits in the gutter, flush with the lane's edge, so the title's first character starts where
// the compose box does; in the strip the smaller fill clears the 14px corner arc with room to
// spare, its focus ring included.
function CollapseToggle({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-5 text-soft-ink hover:text-ink"
      aria-label={collapsed ? "Expand lane" : "Collapse lane"}
      data-lane-toggle=""
      onClick={onClick}
    >
      {collapsed ? (
        <ChevronsLeftRight className="size-[13px]" />
      ) : (
        <ChevronsRightLeft className="size-[13px]" />
      )}
    </Button>
  );
}

// The lane's close, last in its title bar whatever else the bar holds: the far end is where
// a window's close is, so it never moves as a share or a menu comes and goes. At a collapsed
// strip's foot it takes the expand's 20px fill and 13px glyph (`small`), so head and foot match.
function CloseButton({
  title,
  small = false,
  onClick,
}: {
  title: string;
  small?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={`text-soft-ink hover:text-ink ${small ? "size-5 [&_svg]:size-[13px]!" : ""}`}
      aria-label={`Close ${title}`}
      data-lane-close=""
      onClick={onClick}
    >
      <X />
    </Button>
  );
}

// A collapsed lane (ADR-133): a slim strip filling the lane's article (its whole height, or a
// card's half, see `heightOf`) with its expand at the head, the grip always shown beneath, and
// the title turned to read top to bottom, clipped with an ellipsis, and the lane's close at the
// foot. The whole strip but its buttons takes hold of the lane (lane-reorder.ts). The expand and
// the close sit 7px inside the border (`pt-[7px]`, `pb-[7px]`), the inset the open bar gives its
// collapse (--leading-space), which clears the 14px corner arcs.
function LaneStrip({
  title,
  toggle,
  close,
}: {
  title: string;
  toggle: ReactNode;
  close: ReactNode;
}) {
  return (
    <div
      data-lane-strip=""
      className="lane-strip flex min-h-0 flex-1 flex-col items-center gap-2 rounded-[var(--radius-card)] border border-hairline bg-paper pt-[7px] pb-[7px]"
    >
      {toggle}
      <span data-lane-strip-grip="" aria-hidden="true" className="lane-strip-grip" />
      <span data-lane-strip-title="" className="lane-strip-title">
        {title}
      </span>
      <span className="mt-auto flex">{close}</span>
    </div>
  );
}

// The toggle moves between the title bar and the strip as the lane flips, so it is a new
// element each time: a toggle pressed with the focus on it hands the focus to the new one once
// the flip lands. `pressed` is the state the lane was in at that press, or null.
function useToggleFocus(lane: RefObject<HTMLElement | null>, collapsed: boolean) {
  const pressed = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    if (pressed.current === null || pressed.current === collapsed) return;
    pressed.current = null;
    const toggle = lane.current?.querySelector("[data-lane-toggle]");
    if (toggle instanceof HTMLElement) toggle.focus();
  }, [lane, collapsed]);
  return () => {
    const focused = lane.current?.contains(document.activeElement) === true;
    pressed.current = focused ? collapsed : null;
  };
}

// The lane's toggle, flipping it and keeping the focus on the toggle as it moves.
function useCollapseToggle(
  article: RefObject<HTMLElement | null>,
  lane: LaneView,
  onCollapse: LaneReports["onCollapse"],
): ReactNode {
  const { id, collapsed } = lane;
  const noteFocus = useToggleFocus(article, collapsed);
  return (
    <CollapseToggle
      collapsed={collapsed}
      onClick={() => {
        noteFocus();
        onCollapse(id, !collapsed);
      }}
    />
  );
}

// What the lane shows, the thread or the card, filling its whole height, with the toggle and
// the close in its title bar. Collapsed, it is kept, only hidden and without either, so a draft
// or a scroll inside survives the fold.
function LaneBody({
  lane,
  toggle,
  close,
}: {
  lane: LaneView;
  toggle: ReactNode;
  close: ReactNode;
}) {
  return (
    <div
      hidden={lane.collapsed}
      className="min-h-0 flex-1"
      style={{ ["--thread-height" as string]: "100%" }}
    >
      {lane.render(lane.collapsed ? undefined : toggle, lane.collapsed ? undefined : close)}
    </div>
  );
}

// How tall a lane's article stands in the row: all of it, except a collapsed card, which is
// half and stays at the row's top, so a card reads apart from a thread at a glance. Nothing
// below the shorter strip belongs to the lane: the article is the strip's own height, so the
// grip, the reorder and the floating copy (which clones the article's box) all follow it.
function heightOf(lane: LaneView): string {
  return lane.collapsed && lane.kind === "card" ? "h-1/2 self-start" : "h-full";
}

/** One lane in the canvas's row: open at its width, or collapsed to a strip (ADR-133). */
export function Lane({
  lane,
  width,
  lifted,
  style,
  handlers,
  reports,
}: {
  lane: LaneView;
  width: number | null;
  lifted: boolean;
  style: CSSProperties;
  handlers: LaneHandlers;
  reports: LaneReports;
}) {
  const article = useRef<HTMLElement>(null);
  const toggle = useCollapseToggle(article, lane, reports.onCollapse);
  const close = (small: boolean) => (
    <CloseButton
      title={lane.title}
      small={small}
      onClick={() => {
        reports.onClose(lane.id);
      }}
    />
  );
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the pointer takes hold of the lane by its title bar or its strip; the keyboard moves it from the gap after it
    <article
      ref={article}
      className={`lane lane-shift flex ${heightOf(lane)} shrink-0 flex-col`}
      style={{
        // A width kept before lanes snapped to the grid still lands on it.
        ["--lane-width" as string]:
          width === null ? "var(--lane-default-width)" : `round(${width}px, var(--canvas-grid))`,
        ...style,
      }}
      data-lane={lane.id}
      data-collapsed={lane.collapsed}
      data-kind={lane.kind}
      data-lifted={lifted || undefined}
      aria-label={lane.title}
      {...handlers}
    >
      {lane.collapsed && <LaneStrip title={lane.title} toggle={toggle} close={close(true)} />}
      <LaneBody lane={lane} toggle={toggle} close={close(false)} />
    </article>
  );
}
