import type { ThreadId, ThreadSummary } from "@yaklabs/runtime";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@yaklabs/ui/components/resizable";
import { useIsMobile } from "@yaklabs/ui/hooks/use-mobile";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { trackHintLine } from "../components/divider";
import { MainCanvas } from "../components/main-canvas";
import { ThreadPane } from "../components/thread-pane";
import { Welcome } from "../components/welcome";
import { BrowserPane } from "./browser-pane";
import { useShell, type Shell } from "./model";
import { SPLIT, viewOf, type PaneKind, type View } from "./state";

// The panel group's imperative handle, named through the ui primitive's own props so the app
// needs no direct dependency on the panel library.
type GroupRef = NonNullable<ComponentProps<typeof ResizablePanelGroup>["groupRef"]>;
type GroupHandle = GroupRef extends Ref<infer Handle> ? NonNullable<Handle> : never;

// The panels' shares for a pane. The thread alone fills the width; on a wide screen the browser
// or the canvas shares it with the thread, and on a phone it fills the width alone.
function layoutFor(pane: PaneKind, split: number, narrow: boolean): Record<string, number> {
  if (pane === "thread") return { thread: 100, side: 0 };
  return narrow ? { thread: 0, side: 100 } : { thread: split, side: 100 - split };
}

// The thread's share a drag left behind, or null when the drag closed either pane at its edge,
// which only the layout switch may do.
function keptSplit(layout: Record<string, number>): number | null {
  const sizes = new Map(Object.entries(layout)); // → Map<panel id, percent>
  const thread = sizes.get("thread");
  return thread === undefined || thread === 0 || sizes.get("side") === 0 ? null : thread;
}

/** The id of the tab panel that holds a main thread's workspace, for the tab that controls it. */
export function panelId(main: ThreadId): string {
  return `panel-${main}`;
}

// Whether something has been on screen at least once.
function useSeen(shown: boolean): boolean {
  const [seen, setSeen] = useState(shown);
  if (shown && !seen) setSeen(true);
  return seen || shown;
}

// Mounts its children the first time it is shown and keeps them until it goes. Hidden, they
// keep their state, scroll and running replies, take no input (inert), and skip rendering
// (content-visibility, from [data-retain][inert] in index.css), which keeps what display: none
// drops.
function Retain({
  shown,
  children,
  ...rest
}: { shown: boolean; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const seen = useSeen(shown);
  if (!seen) return null;
  return (
    <div {...rest} inert={!shown} data-retain="" className="min-h-0 min-w-0 [grid-area:1/1]">
      {children}
    </div>
  );
}

// The main thread, on the pane itself: no window of its own, its text centred at the thread's
// measure and its welcome reaching the pane's edges. Only a lane on the canvas is a window.
// The layout it is in goes to the welcome, which offers its painting switch only when the thread
// has the window to itself. Hidden on a phone while the browser or the canvas has the width, it stays mounted but inert,
// like a retained pane.
function MainPane({
  thread,
  pane,
  hidden,
}: {
  thread: ThreadSummary;
  pane: PaneKind;
  hidden: boolean;
}) {
  return (
    <div
      inert={hidden}
      data-retain=""
      className="h-full min-w-0"
      style={{ ["--thread-height" as string]: "100%" }}
    >
      <ThreadPane
        key={thread.id}
        thread={thread}
        welcome={<Welcome thread={thread} pane={pane} />}
        bare
      />
    </div>
  );
}

// What a tab shows beside its thread.
type Beside = { shell: Shell; thread: ThreadSummary; view: View; focus: ThreadId | null };

// The browser and the canvas, each retained so a layout switch never stops a lane's reply.
function SidePanes({ shell, thread, view, focus }: Beside) {
  return (
    <>
      <Retain shown={view.pane === "browser"}>
        <BrowserPane shell={shell} main={thread.id} browser={view.browser} />
      </Retain>
      <Retain shown={view.pane === "canvas"}>
        <MainCanvas
          main={thread.id}
          workspace={shell.workspace}
          focus={focus}
          visit={shell.visitKey}
        />
      </Retain>
    </>
  );
}

// The panel group's handle, whether the screen is a phone's, and the step that lays the panels
// out as the view says; it runs whenever the view or the screen changes.
function usePlacement(view: View) {
  const group = useRef<GroupHandle>(null);
  const narrow = useIsMobile();
  const place = useCallback(() => {
    group.current?.setLayout(layoutFor(view.pane, view.split, narrow));
  }, [view.pane, view.split, narrow]);
  useEffect(() => {
    place();
  }, [place]);
  return { group, narrow, place };
}

// One tab's panes: the main thread, then a panel holding the browser and the canvas. The
// thread alone collapses that panel; the split is kept on release. On a phone one pane has the
// whole width, the one the layout switch names, and the other collapses. The panels' limits
// never change: the library takes new limits a render late, so a panel made collapsible in the
// render that collapses it refused to close and left a fifth of the tab blank. A drag can only
// close a pane by reaching its edge, and then the view's layout comes back, since the layout
// switch alone decides what is on screen.
function Workspace(beside: Beside) {
  const { shell, thread, view } = beside;
  const { group, narrow, place } = usePlacement(view);
  const single = view.pane === "thread" || narrow;
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full"
      groupRef={group}
      defaultLayout={layoutFor(view.pane, view.split, narrow)}
      onLayoutChanged={(layout, { isUserInteraction }) => {
        if (!isUserInteraction) return;
        const split = keptSplit(layout);
        if (split === null) place();
        else shell.setSplit(thread.id, split);
      }}
    >
      {/* Strings are percentages to the panel library; a bare number would be pixels. */}
      <ResizablePanel
        id="thread"
        minSize={`${SPLIT.min}`}
        collapsible
        collapsedSize="0"
        collapsedThreshold={`${SPLIT.min}`}
      >
        <MainPane thread={thread} pane={view.pane} hidden={narrow && view.pane !== "thread"} />
      </ResizablePanel>
      {/* Above the panes, so nothing positioned in them can cover its hit area. */}
      <ResizableHandle
        aria-label="Resize the thread and the pane beside it"
        disabled={single}
        className={single ? "hidden" : "drag-hint z-10"}
        onPointerMove={trackHintLine}
      />
      <ResizablePanel
        id="side"
        minSize={`${100 - SPLIT.max}`}
        collapsible
        collapsedSize="0"
        collapsedThreshold={`${100 - SPLIT.max}`}
        className="grid"
      >
        <SidePanes {...beside} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/**
 * The open tabs, stacked in one grid cell: each is a tab panel named by its thread, mounted
 * the first time it is shown and kept until its tab closes, so replies, drafts and scroll
 * survive a switch. Only the URL's tab is on screen; the rest are inert.
 */
export function Deck() {
  const shell = useShell();
  if (shell === null) return null;
  const { active } = shell;
  return shell.tabs.map((thread) => {
    const shown = active?.main === thread.id;
    return (
      <Retain
        key={thread.id}
        shown={shown}
        id={panelId(thread.id)}
        role="tabpanel"
        aria-label={thread.title}
      >
        <Workspace
          shell={shell}
          thread={thread}
          view={viewOf(shell.doc, thread.id)}
          focus={shown ? active.focus : null}
        />
      </Retain>
    );
  });
}
