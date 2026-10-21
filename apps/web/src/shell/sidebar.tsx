import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "@yaklabs/ui/components/sidebar";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useLocation } from "react-router";
import { Account, type Looks } from "./account";
import { ProjectTree } from "./project-tree";
import { RailPlaces } from "./rail-places";
import { PeekHotZone, peekProps, useSidebarPeek, type SidebarPeek } from "./sidebar-peek";
import { SidebarResizeHandle } from "./sidebar-resize";

// On a phone the sidebar is a drawer that pushes the page aside (ADR-121), so every arrival
// somewhere new (by a row, a place or a "+") closes it: what was chosen is what shows.
function useSheetClosesOnArrival(): void {
  const { key } = useLocation();
  const { setOpenMobile } = useSidebar();
  const shownAt = useRef(key);
  useEffect(() => {
    if (shownAt.current === key) return;
    shownAt.current = key;
    setOpenMobile(false);
  }, [key, setOpenMobile]);
}

// What only the phone's drawer draws: the places as rows and the account, which the desktop's
// rail carries instead, so each is mounted once per device.
function PhoneOnly({ children }: { children: ReactNode }) {
  const { isMobile } = useSidebar();
  return isMobile ? children : null;
}

// Whether the panel rests behind the rail, where the strip past its edge can peek it.
function restsAway(peek: SidebarPeek): boolean {
  return peek.enabled && peek.phase === "away";
}

/** The id of the projects panel's navigation landmark, which the title bar's toggle controls. */
export const SIDEBAR_ID = "sidebar";

/** The panel's width as the window keeps it, and the way to change it. */
export type SidebarWidth = { width: number; onWidth: (px: number) => void };

/**
 * The projects panel below the title bar (ADR-144): shadcn's offcanvas Sidebar beside the
 * desktop's rail, one navigation landmark holding the project tree. Docked, it pushes the
 * workspace aside, and its right edge resizes it. Closed on a desktop it peeks: it slides out
 * from behind the rail's edge over the workspace (sidebar-peek.tsx), and the stage around it
 * clips it at that edge, so it never covers the rail. On a phone it is the drawer that pushes
 * the page aside (ADR-121), listing the places as rows above the tree, with the account at its
 * foot, outside the landmark.
 * @param rail The desktop's rail, where the pointer may rest for the panel to peek.
 */
export function AppSidebar({
  theme,
  chrome,
  width,
  onWidth,
  rail,
}: Looks & SidebarWidth & { rail: RefObject<HTMLDivElement | null> }) {
  const container = useRef<HTMLDivElement>(null);
  const peek = useSidebarPeek(container, rail);
  useSheetClosesOnArrival();
  return (
    <>
      <Sidebar
        ref={container}
        collapsible="offcanvas"
        mobile="push"
        {...peekProps(peek)}
        className="absolute h-full border-r-0 group-data-[side=left]:border-r-0"
      >
        <div
          id={SIDEBAR_ID}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the catalog's tokens.css styles every bare nav (its gap, and the colour of each span in a button), which would restyle the tree
          role="navigation"
          aria-label="Sidebar"
          className="flex min-h-0 flex-1 flex-col"
        >
          <PhoneOnly>
            <RailPlaces look="row" />
          </PhoneOnly>
          <SidebarContent>
            <ProjectTree />
          </SidebarContent>
        </div>
        <PhoneOnly>
          <SidebarFooter>
            <Account theme={theme} chrome={chrome} side="top" align="start" />
          </SidebarFooter>
        </PhoneOnly>
        <SidebarResizeHandle width={width} onWidth={onWidth} controls={SIDEBAR_ID} />
      </Sidebar>
      {restsAway(peek) && <PeekHotZone />}
    </>
  );
}
