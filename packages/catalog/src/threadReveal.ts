import { prefersReducedMotion } from "./reducedMotion";

/** A vertical span in a scroller's content coordinates (px from the top of its content). */
export type Span = { top: number; bottom: number };

/** The scroller's geometry: where it is, how tall it is, and what its padding keeps clear. */
export type Viewport = {
  scrollTop: number;
  height: number;
  /** Clear space at the top of the visible band (the thread's top padding). */
  insetTop: number;
  /** Clear space above the compose box: the thread's bottom padding plus any dock overlay. */
  insetBottom: number;
  maxScrollTop: number;
};

// How long after a click or key press a turn's growth still counts as that interaction's result.
const INTERACTION_WINDOW_MS = 1000;
// The scroller's custom property that holds the jump runway (thread.css adds it to the thread's
// bottom padding), and each scroller's runway in px, kept as a number beside it.
const RUNWAY = "--jump-runway";
const runways = new WeakMap<HTMLElement, number>();

// The user's latest click or key press inside the thread, and when it happened.
type Interaction = { target: HTMLElement; at: number };

function clamp(top: number, maxScrollTop: number): number {
  return Math.round(Math.min(Math.max(top, 0), Math.max(maxScrollTop, 0)));
}

// The union of several elements' spans, measured in the scroller's content coordinates.
function contentSpan(scroller: HTMLElement, elements: (Element | Range)[]): Span {
  const origin = scroller.getBoundingClientRect().top + scroller.clientTop - scroller.scrollTop;
  const rects = elements.map((element) => element.getBoundingClientRect());
  return {
    top: Math.min(...rects.map((rect) => rect.top)) - origin,
    bottom: Math.max(...rects.map((rect) => rect.bottom)) - origin,
  };
}

// The room a jump added below the thread's end, in px; 0 when there is none.
function runwayOf(scroller: HTMLElement): number {
  return runways.get(scroller) ?? 0;
}

// Sets the runway, or takes it away at 0.
function setRunway(scroller: HTMLElement, px: number): void {
  if (px > 0) {
    runways.set(scroller, px);
    scroller.style.setProperty(RUNWAY, `${px}px`);
  } else {
    runways.delete(scroller);
    scroller.style.removeProperty(RUNWAY);
  }
}

// The scroller's padding is the single source of the resting gap, so a nudged card lands
// exactly where the last card of the thread rests: 20px above the compose box or dock. A jump's
// runway is padding too, but not a gap: it is left out, so the band and the reach are the
// thread's own.
function viewport(scroller: HTMLElement): Viewport {
  const style = getComputedStyle(scroller);
  const runway = runwayOf(scroller);
  return {
    scrollTop: scroller.scrollTop,
    height: scroller.clientHeight,
    insetTop: parseFloat(style.paddingTop) || 0,
    insetBottom: (parseFloat(style.paddingBottom) || 0) - runway,
    maxScrollTop: scroller.scrollHeight - scroller.clientHeight - runway,
  };
}

// The control the user pressed, which a reveal keeps in view: the button, summary or link the
// press landed in, else what it landed on.
const pressedControl = (interaction: Interaction): HTMLElement =>
  interaction.target.closest<HTMLElement>("button, summary, a, [role='button']") ??
  interaction.target;

// What to reveal when `turn` grew: the card the user just clicked or keyed inside, when the
// growth came soon enough to be that interaction's result; undefined when nobody asked for it.
function askedToReveal(
  turn: HTMLElement,
  last: Interaction | undefined,
  now: number,
): HTMLElement | undefined {
  if (last === undefined || now - last.at > INTERACTION_WINDOW_MS) return undefined;
  if (!turn.contains(last.target)) return undefined;
  return last.target.closest<HTMLElement>(".card") ?? turn;
}

/**
 * The smallest scroll that keeps `target` clear of the compose box (ADR-038, ADR-071). A target
 * that is not clipped at the bottom stays put; a clipped one rises until its bottom edge rests
 * `insetBottom` above the compose box (or the card docked over it), like the last card in the
 * thread: seeing the bottom edge is how the user knows the whole card has been shown. Since it
 * only reveals what is below, the thread never scrolls up, which would move away from the click.
 * @param anchorTop Where the control the user pressed starts, in content coordinates: the rise
 * stops once that control reaches the top of the band, so what it opened reads on from right
 * under it rather than from somewhere further down (Ethan, ADR-159).
 */
export function nudgeScrollTop(target: Span, view: Viewport, anchorTop?: number): number {
  const bandBottom = view.scrollTop + view.height - view.insetBottom;
  if (target.bottom <= bandBottom) return view.scrollTop;
  const shown = target.bottom - view.height + view.insetBottom; // → the bottom edge in view
  const held =
    anchorTop === undefined ? shown : Math.max(view.scrollTop, anchorTop - view.insetTop);
  return clamp(Math.min(shown, held), view.maxScrollTop);
}

/**
 * The scroll that lands `target` vertically centered in the visible band, for jumps to a turn
 * (ADR-022): the eye goes to the middle. A target taller than the band starts at its top.
 */
export function centerScrollTop(target: Span, view: Viewport): number {
  const band = view.height - view.insetTop - view.insetBottom;
  const height = target.bottom - target.top;
  const top =
    height <= band ? target.top - view.insetTop - (band - height) / 2 : target.top - view.insetTop;
  return clamp(top, view.maxScrollTop);
}

/**
 * The room to add below the thread's end so `target` can land centered (ADR-022, ADR-143): a
 * turn near the end would otherwise stop short, low in the band, where the thread runs out.
 * 0 when the centered scroll is within reach, when the target is taller than the band (it
 * starts at the top instead), or when the thread fits its view and has nothing to scroll.
 */
export function runwayFor(target: Span, view: Viewport): number {
  const band = view.height - view.insetTop - view.insetBottom;
  const height = target.bottom - target.top;
  if (view.maxScrollTop <= 0 || height > band) return 0;
  const centered = target.top - view.insetTop - (band - height) / 2;
  return Math.max(Math.ceil(centered - view.maxScrollTop), 0);
}

// How far `scroller` stands from the end of its turns, in px, the jump runway left out: negative
// while a jump holds it inside the runway.
function distanceFromEnd(scroller: HTMLElement): number {
  return scroller.scrollHeight - runwayOf(scroller) - scroller.clientHeight - scroller.scrollTop;
}

/**
 * Calls `onChange` with `distanceFromEnd` whenever it may have changed: on every scroll, and as
 * turns come and grow (a streaming reply moves the end away from a reader who stays put). It
 * fires once as it starts, when the observer first measures.
 * @returns A cleanup function that stops watching.
 */
export function watchEndDistance(
  scroller: HTMLElement,
  onChange: (distance: number) => void,
): () => void {
  const measure = () => {
    onChange(distanceFromEnd(scroller));
  };
  const resized = new ResizeObserver(measure);
  const watchTurns = () => {
    for (const turn of scroller.children) resized.observe(turn);
  };
  const added = new MutationObserver(watchTurns);
  resized.observe(scroller);
  watchTurns();
  added.observe(scroller, { childList: true });
  scroller.addEventListener("scroll", measure, { passive: true });
  return () => {
    resized.disconnect();
    added.disconnect();
    scroller.removeEventListener("scroll", measure);
  };
}

// Each scroller's watch for the moment its runway can go, so a second jump replaces the first's.
const runwayWatches = new WeakMap<HTMLElement, () => void>();

/** Takes back the room a jump added below the thread's end, and stops watching for it. */
export function releaseRunway(scroller: HTMLElement): void {
  runwayWatches.get(scroller)?.();
  runwayWatches.delete(scroller);
  setRunway(scroller, 0);
}

// Releases the runway once the reader scrolls it out of view, when taking it back moves nothing.
// The jump's own scroll is waited out first: by arrival at `target`, or by the scroll turning
// away from it, which only the reader can do. Not by `scrollend`: on a slow machine the scroll
// before this one may end a frame late, and its `scrollend` would hand the runway back while the
// new scroll is still on its way into it.
function watchRunway(scroller: HTMLElement, target: number): void {
  runwayWatches.get(scroller)?.();
  let previous = scroller.scrollTop;
  let settled = Math.abs(previous - target) <= 1;
  const release = () => {
    const now = scroller.scrollTop;
    if (!settled) {
      // A smooth scroll's first event can report no movement yet; only real movement away from
      // the target means the reader took over.
      const away = Math.abs(now - target) > Math.abs(previous - target);
      previous = now;
      settled = Math.abs(now - target) <= 1 || away;
      if (!settled) return;
    }
    if (distanceFromEnd(scroller) >= 0) releaseRunway(scroller);
  };
  scroller.addEventListener("scroll", release, { passive: true });
  runwayWatches.set(scroller, () => {
    scroller.removeEventListener("scroll", release);
  });
}

/** Scrolls `scroller` to the end of its turns, taking back any runway a jump left there. */
export function scrollToEnd(scroller: HTMLElement): void {
  releaseRunway(scroller);
  scroller.scrollTo({
    top: scroller.scrollHeight,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

/**
 * Scrolls `scroller` by the smallest amount that keeps `elements` clear of the compose box, and
 * never so far that `anchor`, the control that opened them, leaves the top of the band.
 */
export function nudgeInScroller(
  scroller: HTMLElement,
  elements: HTMLElement[],
  anchor?: HTMLElement,
): void {
  if (elements.length === 0) return;
  const view = viewport(scroller);
  const anchorTop = anchor === undefined ? undefined : contentSpan(scroller, [anchor]).top;
  const top = nudgeScrollTop(contentSpan(scroller, elements), view, anchorTop);
  if (top !== view.scrollTop)
    scroller.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/**
 * Scrolls `scroller` so `element` (a turn, or a run of words in one) lands centered in the
 * visible band, adding a runway below the
 * thread's end when the element is too near it to center otherwise. The runway stays until the
 * reader scrolls it out of view or a new turn lands (`releaseRunway`).
 */
export function centerInScroller(scroller: HTMLElement, element: Element | Range): void {
  const target = contentSpan(scroller, [element]);
  const view = viewport(scroller);
  const runway = runwayFor(target, view); // → px
  setRunway(scroller, runway);
  const reach = scroller.scrollHeight - scroller.clientHeight; // re-measured: the runway grew it
  const top = centerScrollTop(target, { ...view, maxScrollTop: reach });
  if (runway === 0) releaseRunway(scroller);
  else watchRunway(scroller, top);
  scroller.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/**
 * How a jump frames its target (Ethan, ADR-159): a target already wholly in the visible band
 * stays where it is, and only its highlight says where it is ("stay"); a user's message out of
 * view is centered ("center", ADR-022); anything else out of view scrolls just far enough to
 * show it, and never so far that its top is cut off (a scrollTop).
 */
export function jumpPlan(
  target: Span,
  view: Viewport,
  center: boolean,
): "stay" | "center" | number {
  const bandTop = view.scrollTop + view.insetTop;
  const bandBottom = view.scrollTop + view.height - view.insetBottom;
  if (target.top >= bandTop && target.bottom <= bandBottom) return "stay";
  if (center) return "center";
  const topInView = target.top - view.insetTop; // → the scroll that shows its top first
  if (target.top < bandTop) return clamp(topInView, view.maxScrollTop);
  const bottomInView = target.bottom - view.height + view.insetBottom;
  return clamp(Math.min(bottomInView, topInView), view.maxScrollTop);
}

// Whether a jump's target is a user's message, or words in one: the only target a jump centers.
function inUserMessage(target: Element | Range): boolean {
  const node = target instanceof Range ? target.commonAncestorContainer : target;
  const element = node instanceof Element ? node : node.parentElement;
  return (element?.closest(".turn-user") ?? null) !== null;
}

/**
 * Brings a jump's target into view by `jumpPlan`: a user's message out of view lands centered
 * (`centerInScroller`), anything else out of view scrolls just into view, and a target already
 * in view does not move.
 */
export function jumpInScroller(scroller: HTMLElement, target: Element | Range): void {
  const plan = jumpPlan(contentSpan(scroller, [target]), viewport(scroller), inUserMessage(target));
  if (plan === "stay") return;
  if (plan === "center") {
    centerInScroller(scroller, target);
    return;
  }
  releaseRunway(scroller);
  scroller.scrollTo({ top: plan, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/** Where a thread's scroll stands: `reach` is the furthest `scrollTop` it can scroll to. */
export type ScrollStand = { reach: number; scrollTop: number };

/**
 * Whether a thread follows its end after a resize moved that end `moved` px further away (turns
 * growing, the view getting shorter): whether it rested at its end before the move. With scroll
 * anchoring off (thread.css), a resize moves the end but not the scroll, short of clamping it
 * to a nearer end, so the gap before was the gap now less `moved`. A reader who scrolled up,
 * even in the frame a streaming reply grew, left a gap the resize does not account for.
 */
export function restedAtEnd(now: ScrollStand, moved: number): boolean {
  return now.reach - now.scrollTop - moved < 2;
}

function standOf(scroller: HTMLElement): ScrollStand {
  return { reach: scroller.scrollHeight - scroller.clientHeight, scrollTop: scroller.scrollTop };
}

// What a batch of resizes did to the thread: how far it moved the end away from the scroll
// (turns growing, the view getting shorter) and which turns grew. Records each box's new height;
// a box's first measure moves nothing.
function measureResizes(
  scroller: HTMLElement,
  entries: ResizeObserverEntry[],
  heights: WeakMap<Element, number>,
): { moved: number; grown: HTMLElement[] } {
  let moved = 0;
  const grown: HTMLElement[] = [];
  for (const entry of entries) {
    const box = entry.target; // → Element; the thread itself or one of its `.turn`s
    if (!(box instanceof HTMLElement)) continue;
    const before = heights.get(box);
    const after = entry.borderBoxSize[0]?.blockSize ?? box.offsetHeight;
    heights.set(box, after);
    if (before === undefined) continue;
    if (box === scroller) moved += Math.max(before - after, 0);
    else if (after > before) {
      moved += after - before;
      grown.push(box);
    }
  }
  return { moved, grown };
}

/**
 * Enforces ADR-038 for every component in the thread, without each one opting in: when a turn
 * grows right after the user clicked or pressed a key inside it (a table, "Show my work", a
 * longer description), the card that grew is nudged clear of the compose box.
 * Growth nobody asked for (charts sizing, fonts loading, a reply streaming in) keeps a thread
 * that was at its end at its end, so the last card rests exactly where the gap says, not a few
 * pixels short; so does the view getting shorter as the compose box grows (ADR-103).
 * @returns A cleanup function that stops watching.
 */
export function keepExpansionsInView(scroller: HTMLElement): () => void {
  let interaction: Interaction | undefined;
  const heights = new WeakMap<Element, number>();

  const remember = (event: Event) => {
    if (event.target instanceof HTMLElement)
      interaction = { target: event.target, at: performance.now() };
  };

  const resized = new ResizeObserver((entries) => {
    const { moved, grown } = measureResizes(scroller, entries, heights); // → px, HTMLElement[]
    const now = performance.now();
    const asked = grown
      .map((turn) => askedToReveal(turn, interaction, now)) // → (HTMLElement | undefined)[]
      .filter((card) => card !== undefined); // → HTMLElement[]
    if (asked.length > 0 && interaction !== undefined)
      nudgeInScroller(scroller, asked, pressedControl(interaction));
    else if (moved > 0 && restedAtEnd(standOf(scroller), moved))
      scroller.scrollTop = scroller.scrollHeight;
  });

  const watchTurns = () => {
    scroller.querySelectorAll(":scope > .turn").forEach((turn) => {
      resized.observe(turn);
    });
  };
  const added = new MutationObserver(watchTurns);

  resized.observe(scroller, { box: "border-box" });
  watchTurns();
  added.observe(scroller, { childList: true });
  scroller.addEventListener("pointerdown", remember, true);
  scroller.addEventListener("keydown", remember, true);
  return () => {
    resized.disconnect();
    added.disconnect();
    scroller.removeEventListener("pointerdown", remember, true);
    scroller.removeEventListener("keydown", remember, true);
  };
}
