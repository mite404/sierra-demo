import { SidebarProvider, useSidebar } from "@yaklabs/ui/components/sidebar";
import { useRef, type ReactNode } from "react";
import { useChrome } from "../chrome";
import type { ThemeChoice } from "../theme";
import { useMatch } from "react-router";
import { Rail } from "./rail";
import { SharePermissions } from "./share-permissions";
import { AppSidebar } from "./sidebar";
import { sidebarVars, useSidebarOpen, useSidebarWidth } from "./sidebar-choice";
import { TitleBar } from "./title-bar";

// The workspace beside the panel, inset like Kay's content pane, with the deck and the route
// in one grid cell. It is the page's main landmark, except on /lab, whose workbench brings its
// own main: two, one inside the other, leave no single main to skip to. It is a div on every
// route, since swapping the element would remount the deck and lose every open tab.
function Workspace({ children }: { children: ReactNode }) {
  const onLab = useMatch("/lab") !== null;
  const { isMobile, openMobile } = useSidebar();
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a main element cannot drop its role on /lab
      role={onLab ? undefined : "main"}
      // Pushed aside by the phone's drawer, it shows at the edge but takes no focus (ADR-121).
      inert={isMobile && openMobile}
      className="relative grid min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-background *:[grid-area:1/1] md:rounded-tl-(--workspace-radius) md:border-t md:border-l md:border-hairline"
    >
      {children}
    </div>
  );
}

/**
 * The app drawn as a desktop window (ADR-094): a rounded frame on a desk of its own with a
 * margin around it, full-bleed on a narrow screen (ADR-111). The green title bar runs its whole
 * width (ADR-110); below it, the rail of places (ADR-144), then the stage: the projects panel
 * (shadcn's sidebar-16 pattern) and, inset like Kay's content pane, the workspace. The stage
 * clips at the rail's edge, the gate the panel slides out from behind when it peeks.
 * @param theme The visitor's light, dark or system look, which the account menu changes.
 * @param banner A full-width row between the title bar and the body, such as a scripted demo's
 * controls; nothing by default.
 */
export function Window({
  theme,
  banner,
  children,
}: {
  theme: ThemeChoice;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const choice = useSidebarOpen();
  const sized = useSidebarWidth();
  const chrome = useChrome();
  const rail = useRef<HTMLDivElement>(null);
  return (
    <>
      <div data-slot="desk" aria-hidden="true" className="fixed inset-0 bg-[var(--desk)]" />
      <div
        data-slot="window"
        className="fixed inset-0 flex flex-col overflow-hidden bg-paper md:inset-4 md:rounded-[12px] md:border md:border-hairline md:shadow-[0_8px_32px_var(--shadow)]"
      >
        <SidebarProvider
          open={choice.open}
          onOpenChange={choice.onOpenChange}
          className="min-h-0 flex-1 flex-col transition-transform duration-300 ease-out motion-reduce:transition-none max-md:data-mobile-open:translate-x-(--sidebar-width-mobile)"
          style={sidebarVars(sized.width)}
        >
          <TitleBar chrome={chrome} />
          {banner}
          <div data-slot="window-body" className="relative flex min-h-0 flex-1">
            <Rail ref={rail} theme={theme} chrome={chrome} />
            {/* The stage: the panel's containing block, beside the workspace it sits over. It
                clips, never hides (overflow: clip is no scroll container, so nothing a focus
                or a scroll into view does can scroll it), and only on a desktop: the phone's
                drawer is fixed to the sliding wrapper above it. */}
            <div
              data-slot="stage"
              className="relative flex min-h-0 min-w-0 flex-1 md:overflow-clip"
            >
              <AppSidebar theme={theme} chrome={chrome} rail={rail} {...sized} />
              <Workspace>{children}</Workspace>
            </div>
          </div>
        </SidebarProvider>
      </div>
      <SharePermissions />
    </>
  );
}
