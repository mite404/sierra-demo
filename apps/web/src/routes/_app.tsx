import { Outlet, useOutletContext } from "react-router";
import { RuntimeProvider } from "../runtime";
import { RequireSession } from "../session";
import { Deck } from "../shell/deck";
import { ShellProvider, useShell } from "../shell/model";
import { Window } from "../shell/window";
import { DemoOverlay } from "../world/provider";
import { ShowBar } from "../world/ShowBar";
import type { ThemeChoice } from "../theme";

// The route's own page, drawn only while no tab is on screen. The deck shows the tab an address
// is on its way to at once, and the router keeps the page it is leaving until the next route
// has loaded, so a page left for a thread (the Lab) would otherwise draw under the new tab.
function Page() {
  const shell = useShell();
  return shell !== null && shell.active !== null ? null : <Outlet />;
}

/**
 * Everything under here needs a signed-in visitor when the build has sign-in (ADR-084), and
 * shares one runtime for as long as the visitor stays (ADR-076): the worker, with the scripted
 * Demo's overlay beside it on the device's data. The window's workspace holds the deck of open
 * tabs and the route in one grid cell, one or the other: the route draws only while no tab is
 * on screen. A show's controls take the banner row while one of its threads is on screen.
 */
export default function Protected() {
  const theme = useOutletContext<ThemeChoice>();
  return (
    <RequireSession>
      <RuntimeProvider>
        <DemoOverlay>
          <ShellProvider>
            <Window theme={theme} banner={<ShowBar />}>
              <Deck />
              <Page />
            </Window>
          </ShellProvider>
        </DemoOverlay>
      </RuntimeProvider>
    </RequireSession>
  );
}
