import type { Carried } from "@yaklabs/catalog/carry";
import {
  closeLane,
  collapseLane,
  insertLane,
  lanesOf,
  moveLane,
  newCardLaneId,
  quoteFor,
  childrenOf,
  openChildLane,
  resizeLane,
  titleFor,
  type Lane,
  type LaneId,
  type Runtime,
  type ThreadId,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import { useSidebar } from "@yaklabs/ui/components/sidebar";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { inBackground, useRuntime } from "../runtime";
import { arrangeFrom } from "./arrange";
import { Canvas, type LaneView } from "./canvas";
import { CanvasCard } from "./canvas-card";
import { ThreadPane } from "./thread-pane";

// What a thread started without a title is called until someone names it.
const NEW_THREAD = "New thread";

// A lane as the canvas draws it: a child thread, or a card opened large. A thread lane whose
// thread the snapshot lacks is left out rather than drawn empty.
function laneView(lane: Lane, threads: Map<string, ThreadSummary>): LaneView[] {
  if (lane.kind === "card") {
    const { id, title, width, collapsed, card } = lane;
    const render = (leading: ReactNode, trailing: ReactNode) => (
      <CanvasCard card={card} leading={leading} trailing={trailing} />
    );
    return [{ id, title, width, collapsed, kind: "card", render }];
  }
  const thread = threads.get(lane.threadId);
  if (thread === undefined) return [];
  return [
    {
      id: lane.id,
      title: thread.title,
      width: lane.width,
      collapsed: lane.collapsed,
      kind: "thread",
      render: (leading: ReactNode, trailing: ReactNode) => (
        <ThreadPane key={thread.id} thread={thread} leading={leading} trailing={trailing} />
      ),
    },
  ];
}

// A child of `main` whose lane lands at `at`: a highlight's first line as its title and the
// highlight quoted as its opening draft, or a blank one.
function startChild(runtime: Runtime, main: ThreadId, at: number, text: string): void {
  const item = {
    kind: "child",
    parentId: main,
    at,
    title: titleFor(text) || NEW_THREAD,
    draft: text.trim() === "" ? "" : quoteFor(text),
  } as const;
  inBackground(runtime.create(item), "Starting a thread");
}

// What a carry leaves where it lands: a highlight starts a child thread there; a card opens
// large in a lane of its own.
function land(runtime: Runtime, main: ThreadId, carried: Carried, at: number): void {
  if (carried.kind === "text") {
    startChild(runtime, main, at, carried.text);
    return;
  }
  const { card, title } = carried;
  const lane: Lane = {
    id: newCardLaneId(),
    width: null,
    collapsed: false,
    kind: "card",
    card,
    title,
  };
  arrangeFrom(runtime, main, (current) => insertLane(current, at, lane));
}

// What the canvas's lanes report, each set through `arrange` on the lanes as they are now.
function laneEdits(runtime: Runtime, main: ThreadId) {
  const edit = (change: (lanes: Lane[]) => Lane[]) => {
    arrangeFrom(runtime, main, change);
  };
  return {
    onCollapse: (id: LaneId, collapsed: boolean) => {
      edit((current) => collapseLane(current, id, collapsed));
    },
    onClose: (id: LaneId) => {
      edit((current) => closeLane(current, id));
    },
    onMove: (id: LaneId, to: number) => {
      edit((current) => moveLane(current, id, to));
    },
    onResize: (id: LaneId, px: number) => {
      edit((current) => resizeLane(current, id, px));
    },
  };
}

/**
 * A main thread's compose canvas (ADR-089, ADR-092), drawn from the snapshot: its lanes, left
 * to right, each thread lane loading its own turns. Close, collapse, reorder, widths and a card
 * dropped between lanes all set the lanes through `arrange`; a highlight or Create blank thread
 * makes a child with its lane in place. Each visit to a child's address brings its lane into view and
 * flashes it, and gives the lane back first if it was closed.
 */
export function MainCanvas({
  main,
  workspace,
  focus,
  visit,
}: {
  main: ThreadId;
  workspace: Workspace;
  focus: ThreadId | null;
  visit: string;
}) {
  const runtime = useRuntime();
  const { isMobile } = useSidebar();
  const lanes = lanesOf(workspace, main);
  const threads = new Map(workspace.threads.map((thread) => [thread.id, thread] as const));
  // Each visit to a child's address opens its lane, a second click on a row the address already
  // names included: that click changes the visit and nothing else.
  // The sidebar's order as it is when the visit lands, read without making each workspace change
  // a visit: closing the focused lane must not open it again.
  const childOrder = useEffectEvent(() => childrenOf(workspace, main).map((child) => child.id));
  useEffect(() => {
    if (focus === null) return;
    const order = childOrder(); // → the main's children, top to bottom as the sidebar lists them
    arrangeFrom(runtime, main, (current) => openChildLane(current, focus, order));
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `visit` is what runs it again
  }, [runtime, main, focus, visit]);
  const focused = lanes.find((lane) => lane.kind === "thread" && lane.threadId === focus);
  return (
    <Canvas
      lanes={lanes.flatMap((lane) => laneView(lane, threads))}
      focus={focused?.id ?? null}
      visit={visit}
      actions={laneEdits(runtime, main)}
      onBlank={() => {
        startChild(runtime, main, lanes.length, "");
      }}
      onCarry={(carried, at) => {
        land(runtime, main, carried, at);
      }}
      reorderable={!isMobile}
    />
  );
}
