import { useSidebar } from "@yaklabs/ui/components/sidebar";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { trackHintLine } from "../components/divider";
import {
  clampWidth,
  SIDEBAR_DEFAULT_PX,
  SIDEBAR_MIN_PX,
  widestFor,
  widthForKey,
  widthValue,
} from "./sidebar-width";

// A drag in progress: where the pointer and the width started, the width reached since (null
// until the pointer moves), and the wrapper whose `--sidebar-width` the sidebar and the title
// bar both read.
type Drag = { x: number; from: number; reached: number | null; wrapper: HTMLElement };

// A press that drags: the main button of the first pointer only, since a second finger
// joining in would make the width jump to it.
function isMainPress(event: PointerEvent<HTMLDivElement>): boolean {
  return event.button === 0 && event.isPrimary;
}

// The drag a press on the handle starts, or null for a press that does not drag.
function dragFrom(event: PointerEvent<HTMLDivElement>): Drag | null {
  const handle = event.currentTarget;
  const wrapper = handle.closest<HTMLElement>('[data-slot="sidebar-wrapper"]');
  const panel = handle.closest('[data-slot="sidebar-container"]');
  if (!isMainPress(event) || wrapper === null || panel === null) return null;
  const from = Math.round(panel.getBoundingClientRect().width); // → the width on screen now
  return { x: event.clientX, from, reached: null, wrapper };
}

// Dragging the handle. The width follows the pointer by writing `--sidebar-width` straight on
// the wrapper, with the wrapper's motion off, so the sidebar, the workspace and the title bar's
// tabs move together on every frame with no render; the width is kept on release.
function useWidthDrag(keep: (px: number) => void) {
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const end = () => {
    const done = drag.current;
    if (done === null) return;
    drag.current = null;
    delete done.wrapper.dataset.instant;
    delete document.documentElement.dataset.dragging;
    setDragging(false);
    // A drag that moved keeps what it shows, even back where it began: the wrapper holds that.
    if (done.reached !== null) keep(done.reached);
  };
  return {
    dragging,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      const start = dragFrom(event);
      if (start === null || drag.current !== null) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      start.wrapper.dataset.instant = "";
      document.documentElement.dataset.dragging = "sidebar";
      drag.current = start;
      setDragging(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      trackHintLine(event);
      const now = drag.current;
      if (now === null) return;
      now.reached = clampWidth(now.from + event.clientX - now.x, window.innerWidth);
      now.wrapper.style.setProperty("--sidebar-width", widthValue(now.reached));
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
}

/**
 * The projects panel's right edge as a handle, the canvas divider's twin (ADR-089): a hint of
 * an ink line follows the pointer along it, a drag resizes the panel live (the workspace
 * reflows when it is docked; the panel widens over it while it peeks) and keeps the width on
 * release, arrows step it 16px (64px with Shift), Home and End go to its ends, and a double
 * click puts back the default. Focused, it says the width, as a window splitter does. Hidden
 * while the panel is away, and on a phone, whose drawer has its own width.
 * @param width The kept width, in CSS px.
 * @param onWidth Keeps a new width.
 * @param controls The id of the panel's landmark.
 */
export function SidebarResizeHandle({
  width,
  onWidth,
  controls,
}: {
  width: number;
  onWidth: (px: number) => void;
  controls: string;
}) {
  const { instantly, isMobile } = useSidebar();
  const { dragging, ...drag } = useWidthDrag(onWidth);
  const widest = widestFor(window.innerWidth);
  const shown = Math.min(width, widest); // → the width on screen, as 40% of the window caps it
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const px = widthForKey(event.key, event.shiftKey, shown, window.innerWidth);
    if (px === null) return;
    event.preventDefault();
    instantly(() => {
      onWidth(px);
    });
  };
  if (isMobile) return null;
  /* oxlint-disable jsx-a11y/prefer-tag-over-role -- a separator that takes focus and a drag is a widget; an hr can do neither */
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-controls={controls}
      aria-valuenow={shown}
      aria-valuemin={SIDEBAR_MIN_PX}
      aria-valuemax={widest}
      aria-valuetext={`${shown} pixels wide`}
      tabIndex={0}
      data-slot="sidebar-resize"
      data-dragging={dragging || undefined}
      className="drag-hint absolute inset-y-0 left-full z-10 flex w-px cursor-col-resize touch-none ring-offset-background group-data-[collapsible=offcanvas]:hidden after:absolute after:inset-y-0 after:left-1/2 after:w-2.5 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
      {...drag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        onWidth(SIDEBAR_DEFAULT_PX);
      }}
    />
  );
  /* oxlint-enable jsx-a11y/prefer-tag-over-role */
}
