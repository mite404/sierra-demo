// The projects panel's peek (sidebar-peek.tsx), as data and timing: while the panel is closed,
// it slides out from behind the rail's edge over the workspace once the pointer has rested on
// the title bar's toggle, on the rail or just past it, and slides back once the pointer has been
// gone a moment. What the pointer is over is the host's to say; this decides when to move.

/** Where the peek is: away (at rest behind the rail), about to slide out, out, or sliding back. */
export type PeekPhase = "away" | "entering" | "open" | "leaving";

// The phase, and whether the step into it is drawn with no motion: a key closed it, or it has
// finished sliding back and rests behind the rail's edge.
export type PeekState = { phase: PeekPhase; instant: boolean };

// What moves the peek: show and hide from the pointer and keys; entered once the slide's start
// is drawn, left once the slide back ends; rest when the panel can no longer peek; settled
// once a step with no motion is drawn.
export type PeekAction =
  | { type: "show" }
  | { type: "hide"; instant: boolean }
  | { type: "entered" }
  | { type: "left" }
  | { type: "rest" }
  | { type: "settled" };

/** The peek as it starts: at rest behind the rail. */
export const RESTING: PeekState = { phase: "away", instant: false };

/** How long the pointer rests on a place that peeks before the panel slides out. */
export const PEEK_OPEN_MS = 80;
/** How long the pointer may be away from the peek before it slides back. */
export const PEEK_CLOSE_MS = 250;

// Where show takes each phase: out from behind the rail, or back out from partway home.
const SHOWN: Partial<Record<PeekPhase, PeekPhase>> = { away: "entering", leaving: "open" };

/** Whether the peek is out, or on its way out. */
export function isOut(phase: PeekPhase): boolean {
  return phase === "entering" || phase === "open";
}

function hidden(state: PeekState, instant: boolean): PeekState {
  if (instant && state.phase !== "away") return { phase: "away", instant: true };
  return isOut(state.phase) ? { phase: "leaving", instant: false } : state;
}

// Every action but hide, which alone carries more than its name.
const STEPS: Record<Exclude<PeekAction["type"], "hide">, (state: PeekState) => PeekState> = {
  show: (state) => {
    const phase = SHOWN[state.phase]; // → the next phase, or undefined when already out
    return phase === undefined ? state : { phase, instant: false };
  },
  entered: (state) => (state.phase === "entering" ? { phase: "open", instant: false } : state),
  left: (state) => (state.phase === "leaving" ? { phase: "away", instant: true } : state),
  rest: (state) => (state.phase === "away" && !state.instant ? state : RESTING),
  settled: (state) => (state.instant ? { ...state, instant: false } : state),
};

/** The peek after an action; an action that does not apply to the phase changes nothing. */
export function nextPeek(state: PeekState, action: PeekAction): PeekState {
  return action.type === "hide" ? hidden(state, action.instant) : STEPS[action.type](state);
}

/**
 * Whether an action puts the panel away behind the rail: a key's close, or the end of the slide
 * back. Resting puts nothing away, since it follows what stops the peek, such as docking, which
 * keeps the panel in view.
 */
export function putsAway(state: PeekState, action: PeekAction): boolean {
  if (action.type === "rest" || state.phase === "away") return false;
  return nextPeek(state, action).phase === "away"; // → true for a key's close or "left"
}

/** What the host tells the peek's timing. */
export type PeekIntent = {
  /** The pointer moved; `inZone` says whether it is on a place that peeks. */
  point: (inZone: boolean) => void;
  /** Something that held the peek out let go of it: focus left it, or its menu closed. */
  release: () => void;
  /** The last input was a key (true) or the pointer, for a close that follows it. */
  input: (keyboard: boolean) => void;
  /** Closes the peek now, with no motion when a key asked. It waits for the pointer to leave. */
  close: (instant: boolean) => void;
  /** Closes the peek as the last input would: a visit to a thread from a row. */
  arrive: () => void;
  /** Stops every timer. */
  dispose: () => void;
};

// What the peek's timing reads from its host, and where its actions go.
type PeekHost = {
  phase: () => PeekPhase;
  held: () => boolean;
  dispatch: (action: PeekAction) => void;
  still?: () => boolean;
};

// One pending timer at a time: starting another replaces it.
function oneTimer() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    start: (ms: number, run: () => void) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    },
    stop: () => {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

/**
 * The peek's timing: open after the pointer has rested on a place that peeks for
 * `PEEK_OPEN_MS`, so passing over the toggle never opens it; close once it has been away
 * `PEEK_CLOSE_MS`, unless `held` (focus or a menu inside it), and at once if it comes back. A
 * pin, an unpin or a close waits for the pointer to leave before it can peek again, so the
 * toggle a pointer has just clicked never peeks under it.
 * @param still Whether motion is reduced: every close is then drawn with no motion, as a key's
 * is, since there is no slide back to wait for (design pillars, rule 24).
 */
export function peekIntent({ phase, held, dispatch, still = () => false }: PeekHost): PeekIntent {
  let hovered: boolean | null = null; // → unknown until the pointer first moves
  let suppressed = true;
  let keyboard = false;
  const timer = oneTimer();
  const show = () => {
    dispatch({ type: "show" });
  };
  const closeSoon = () => {
    timer.start(PEEK_CLOSE_MS, () => {
      if (!held()) dispatch({ type: "hide", instant: still() });
    });
  };
  const close = (instant: boolean) => {
    timer.stop();
    suppressed = true;
    if (phase() !== "away") dispatch({ type: "hide", instant });
  };
  return {
    point(inZone) {
      if (inZone === hovered) return;
      hovered = inZone;
      timer.stop();
      if (!inZone) suppressed = false;
      if (!inZone && isOut(phase())) closeSoon();
      if (!inZone || suppressed || isOut(phase())) return;
      if (phase() === "leaving") show();
      else timer.start(PEEK_OPEN_MS, show);
    },
    release() {
      if (hovered !== true && isOut(phase()) && !held()) closeSoon();
    },
    input(isKey) {
      keyboard = isKey;
    },
    close,
    arrive() {
      if (isOut(phase())) close(keyboard || still());
    },
    dispose: timer.stop,
  };
}
