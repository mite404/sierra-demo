import { useSidebar } from "@yaklabs/ui/components/sidebar";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type RefObject,
  type TransitionEvent,
} from "react";
import { useLocation } from "react-router";
import { handFocusToToggle, isHeld, listen } from "./peek-page";
import {
  isOut,
  nextPeek,
  peekIntent,
  putsAway,
  RESTING,
  type PeekAction,
  type PeekIntent,
  type PeekPhase,
  type PeekState,
} from "./peek";

// A pointer that hovers: a peek on hover means nothing to a touch screen.
const FINE_HOVER = "(hover: hover) and (pointer: fine)";
// Reduced motion: the peek comes and goes with no slide and no fade (index.css).
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// A slide back (220ms, index.css) that never reports its end, a transition cut short, still
// settles by then.
const LEAVE_FALLBACK_MS = 400;

/** The peek as the panel draws it. */
export type SidebarPeek = {
  phase: PeekPhase;
  /** The step into this phase is drawn with no motion. */
  instant: boolean;
  /** Whether the panel can peek at all: closed, on a desktop, under a hovering pointer. */
  enabled: boolean;
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
};

function subscribeHover(onChange: () => void): () => void {
  const query = window.matchMedia(FINE_HOVER);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

function canHover(): boolean {
  return window.matchMedia(FINE_HOVER).matches;
}

// The peek, the peek as last drawn (for the listeners and timers that outlive a render), and
// the way to step it. A step that puts the panel away (Escape, a visit by a key, the end of a
// slide back) first hands focus in it to the toggle: an away panel is inert, and focus on a row
// that turns inert would drop to the page's body, however the row was reached.
function usePeek() {
  const [peek, dispatch] = useReducer(nextPeek, RESTING);
  const latest = useRef(peek);
  useLayoutEffect(() => {
    latest.current = peek;
  }, [peek]);
  const step = useCallback((action: PeekAction) => {
    if (putsAway(latest.current, action)) handFocusToToggle();
    dispatch(action);
  }, []);
  return { peek, latest, step };
}

// Wires the page's pointer, keys and focus to the peek's timing while the panel can peek, and
// rests the peek whenever it cannot.
function usePeekIntent(
  enabled: boolean,
  {
    container,
    rail,
  }: { container: RefObject<HTMLDivElement | null>; rail: RefObject<HTMLDivElement | null> },
  latest: RefObject<PeekState>,
  dispatch: Dispatch<PeekAction>,
): RefObject<PeekIntent | null> {
  const intent = useRef<PeekIntent | null>(null);
  useEffect(() => {
    const panel = container.current;
    if (!enabled || panel === null) {
      dispatch({ type: "rest" });
      return () => {};
    }
    const hosts = { panel, rail: rail.current };
    const peek = peekIntent({
      phase: () => latest.current.phase,
      held: () => isHeld(hosts),
      dispatch,
      still: () => window.matchMedia(REDUCED_MOTION).matches,
    });
    intent.current = peek;
    const unlisten = listen(peek, hosts, () => isOut(latest.current.phase));
    return () => {
      unlisten();
      intent.current = null;
    };
  }, [enabled, container, rail, latest, dispatch]);
  return intent;
}

// Draws each step's start before the next: the slide's start (off to the left) before it
// slides, and a step with no motion before motion comes back. Reading the panel's box makes
// the browser compute its styles there and then, which is what a transition starts from.
function useSettle(
  panel: RefObject<HTMLDivElement | null>,
  { phase, instant }: { phase: PeekPhase; instant: boolean },
  dispatch: Dispatch<PeekAction>,
): void {
  useLayoutEffect(() => {
    if (phase !== "entering") return;
    panel.current?.getBoundingClientRect();
    dispatch({ type: "entered" });
  }, [panel, phase, dispatch]);
  useLayoutEffect(() => {
    if (!instant) return;
    panel.current?.getBoundingClientRect();
    dispatch({ type: "settled" });
  }, [panel, instant, dispatch]);
}

// Whether a transition that just ended on the panel was its last: the slide and the fade end
// together today (index.css), and neither may put the panel away while the other runs.
function lastToEnd(event: TransitionEvent<HTMLDivElement>): boolean {
  return event.target === event.currentTarget && event.currentTarget.getAnimations().length === 0;
}

// The slide back ends behind the rail's edge: once the panel's last transition ends, or by a
// fallback if that never comes.
function useLeave(phase: PeekPhase, dispatch: Dispatch<PeekAction>) {
  useEffect(() => {
    if (phase !== "leaving") return () => {};
    const fallback = setTimeout(() => {
      dispatch({ type: "left" });
    }, LEAVE_FALLBACK_MS);
    return () => {
      clearTimeout(fallback);
    };
  }, [phase, dispatch]);
  return (event: TransitionEvent<HTMLDivElement>) => {
    if (phase === "leaving" && lastToEnd(event)) dispatch({ type: "left" });
  };
}

// A visit somewhere new (a row, a place, a "+") closes the peek, at once when a key made it.
function useClosesOnArrival(intent: RefObject<PeekIntent | null>): void {
  const { key } = useLocation();
  const seen = useRef(key);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    intent.current?.arrive();
  }, [key, intent]);
}

/**
 * The projects panel's peek (ADR-144), for the panel whose container is `container`: while it is
 * closed on a desktop, it slides out from behind the rail's edge over the workspace once the
 * pointer rests on the title bar's toggle, on the rail off its places and account, or on the
 * strip just past the rail, and slides back 250ms after the pointer leaves them all, the rail
 * and the panel alike. A menu either opened, or keyboard focus in the panel (not on the rail,
 * which stays), holds it out; Escape, a visit to a thread and docking the panel close it. A
 * key's close is drawn with no motion. Focus in the panel moves to the toggle as it goes away.
 * @param rail The rail it slides from.
 */
export function useSidebarPeek(
  container: RefObject<HTMLDivElement | null>,
  rail: RefObject<HTMLDivElement | null>,
): SidebarPeek {
  const { state, isMobile } = useSidebar();
  const hovers = useSyncExternalStore(subscribeHover, canHover, () => false);
  const enabled = state === "collapsed" && !isMobile && hovers;
  const { peek, latest, step } = usePeek();
  const intent = usePeekIntent(enabled, { container, rail }, latest, step);
  useSettle(container, peek, step);
  useClosesOnArrival(intent);
  const onTransitionEnd = useLeave(peek.phase, step);
  return { ...peek, enabled, onTransitionEnd };
}

/**
 * What the panel takes from its peek: the phase to draw (none at rest), whether the step is
 * drawn with no motion, and the end of the slide back.
 */
export function peekProps(peek: SidebarPeek) {
  return {
    peek: peek.phase === "away" ? undefined : peek.phase,
    "data-peek-instant": peek.instant || undefined,
    onTransitionEnd: peek.onTransitionEnd,
  };
}

/**
 * The strip just past the rail's edge (6px over the workspace, at the stage's left) where the
 * pointer can rest for the panel to peek, as it can on the rail itself. It takes no clicks of
 * its own.
 */
export function PeekHotZone() {
  return (
    <div
      data-slot="sidebar-hot-zone"
      aria-hidden="true"
      className="absolute inset-y-0 left-0 z-10 w-1.5"
    />
  );
}
