import { useLocation } from "react-router";

/**
 * What the rail's Home link carries to "/": a request for a first visit's page, a blank Live
 * Playground thread with its welcome, rather than the tab last on screen that a plain visit to
 * "/" resumes.
 */
export const HOME_HUB = { hub: true } as const;

// Whether a navigation's state is Home's request.
const asksForHub = (state: unknown): boolean =>
  typeof state === "object" && state !== null && "hub" in state && state.hub === true;

/** Whether this visit to "/" came from Home, and should open on a blank live thread. */
export function useHubAsked(): boolean {
  return asksForHub(useLocation().state);
}
