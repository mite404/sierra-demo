import { SidebarFooter, useSidebar } from "@yaklabs/ui/components/sidebar";
import type { Ref } from "react";
import { Account, type Looks } from "./account";
import { RailPlaces } from "./rail-places";

// The places' own height, not the rail's, so the rail's empty stretch below them stays; on a
// window too short for them all they shrink and scroll, with no scrollbar, and the account
// keeps the rail's foot.
const PLACES_BOX = "min-h-0 overflow-y-auto [scrollbar-width:none]";

/**
 * The desktop's icon rail, the app's navigation (ADR-144): the places as squares that name
 * themselves in pills, in a navigation landmark named Places, and the account at its foot,
 * outside it (ADR-121). It is drawn in every state and never moves: the projects panel docks
 * beside it or slides out from behind its edge. A phone has none; its drawer lists the places.
 */
export function Rail({ theme, chrome, ref }: Looks & { ref: Ref<HTMLDivElement> }) {
  const { isMobile } = useSidebar();
  if (isMobile) return null;
  return (
    <div
      ref={ref}
      data-slot="rail"
      className="flex w-(--rail-width) shrink-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the catalog's tokens.css styles every bare nav (its gap, and the colour of each span in a button), which would restyle the places
        role="navigation"
        aria-label="Places"
        className={PLACES_BOX}
      >
        <RailPlaces look="square" />
      </div>
      <SidebarFooter className="mt-auto shrink-0">
        <Account theme={theme} chrome={chrome} side="top" align="start" />
      </SidebarFooter>
    </div>
  );
}
