import { SidebarTrigger, useSidebar } from "@yaklabs/ui/components/sidebar";
import { useRuntimeState } from "../runtime";
import type { Looks } from "./account";
import { Bell } from "./bell";
import { CollapseAll } from "./collapse-all";
import { LayoutSwitch } from "./layout-switch";
import { useShell } from "./model";
import { SIDEBAR_ID } from "./sidebar";
import { TabStrip } from "./tab-strip";
import { ProjectName, ThreadMenu } from "./thread-menu";

// Decorative, as a desktop window's: they do nothing, and a screen reader never meets them. On
// a phone the window is full-bleed, not a window, so they go; on the green bar they need no ring.
const LIGHTS = ["close", "minimise", "zoom"] as const;

// Each light keeps its 12px slot, 20px from the next, and draws 14px over it (Ethan: 2px
// larger), a pixel past the slot on every side: it grows about its own centre, 6px stay
// between lights, and the toggle and the tabs after them do not move (ADR-094).
const LIGHT = "size-3.5 -m-px rounded-full";

function TrafficLights() {
  return (
    <div
      data-slot="traffic-lights"
      aria-hidden="true"
      className="flex shrink-0 gap-2 pr-2 pl-4 max-md:hidden"
    >
      {LIGHTS.map((light) => (
        <span key={light} className={LIGHT} style={{ background: `var(--traffic-${light})` }} />
      ))}
    </div>
  );
}

// The sidebar's toggle is a disclosure: it says whether the projects panel is docked (on a
// phone, whether its drawer is open) and names the landmark it shows and hides; the rail stays
// either way (ADR-144). A peek is a pointer's preview, so it leaves the toggle collapsed. Open,
// it looks as it does closed; the ghost button's expanded fill is for a menu's trigger while
// its menu is up.
function SidebarToggle() {
  const { open, openMobile, isMobile } = useSidebar();
  return (
    <SidebarTrigger
      aria-label="Toggle sidebar"
      aria-expanded={isMobile ? openMobile : open}
      aria-controls={SIDEBAR_ID}
      className="shrink-0 text-soft-ink hover:text-ink aria-expanded:bg-transparent aria-expanded:text-soft-ink aria-expanded:hover:bg-muted aria-expanded:hover:text-ink dark:aria-expanded:hover:bg-muted"
    />
  );
}

// The bar's left end, the lights and the toggle, as wide as the rail and the docked panel below
// it less 4px, so the tabs (after the bar's 8px gap) start 4px past the panel's edge and follow
// it as it is dragged, as ChatGPT's desktop app does: both read `--sidebar-width`. Closed, the
// rail alone is narrower than the lights and the toggle, so the tabs start right after the
// toggle, and a peek over the workspace leaves them there. Docking or closing eases this width
// over the panel's own 250ms, on the same curve (index.css), so the two edges move as one, and like
// the panel it moves at once for a key, a drag or reduced motion. On a phone it stands aside and
// the bar's grid places the toggle itself (ADR-116).
function Lead() {
  const { state } = useSidebar();
  return (
    <div
      data-slot="title-lead"
      data-state={state}
      className="flex shrink-0 items-center gap-2 transition-[min-width] duration-(--panel-pin) ease-(--panel-ease) group-data-instant/sidebar-wrapper:transition-none motion-reduce:transition-none max-md:contents md:min-w-[calc(var(--rail-width)+var(--sidebar-width)-4px)] md:data-[state=collapsed]:min-w-[calc(var(--rail-width)-4px)]"
    >
      <TrafficLights />
      <SidebarToggle />
    </div>
  );
}

/**
 * The window's one title bar, across its whole width: decorative traffic lights, the sidebar
 * toggle and the open threads at the left; at the right, the layout, Collapse all (ADR-134)
 * and the bell, which is the last control in the corner. The tabs start 4px past the docked
 * panel's edge, wherever it is dragged to. The account is not in the bar: it sits at the rail's
 * foot, and at the drawer's on a phone (ADR-121, ADR-144). It is green chrome, flat or painted
 * (ADR-110, ADR-115). On a phone it is two rows (ADR-116): the project's name and what never
 * scrolls on top, Collapse all among them, with a "⋯" for the thread and project; below, the
 * views, Thread, Canvas and Browser.
 */
export function TitleBar({ chrome }: Pick<Looks, "chrome">) {
  const shell = useShell();
  const starting = useRuntimeState().kind === "starting";
  const { isMobile, openMobile } = useSidebar();
  return (
    <header
      data-slot="title-bar"
      inert={isMobile && openMobile}
      data-chrome={chrome.style}
      className="chrome-surface flex h-11 shrink-0 items-center gap-2 pr-3 select-none max-md:grid max-md:h-auto max-md:grid-cols-[auto_minmax(0,1fr)_repeat(3,auto)] max-md:grid-rows-[44px_auto] max-md:gap-x-1 max-md:gap-y-0 max-md:px-2 max-md:pb-1.5"
    >
      <Lead />
      <ProjectName shell={shell} />
      <TabStrip shell={shell} starting={starting} />
      <div className="flex shrink-0 items-center gap-2 max-md:contents">
        <LayoutSwitch shell={shell} />
        <CollapseAll shell={shell} />
        <Bell shell={shell} />
        <ThreadMenu shell={shell} />
      </div>
    </header>
  );
}
