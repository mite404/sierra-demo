import type { Match } from "./threadReading";

/** What a thread's search is showing: its words, and the match it stepped to, if any. */
export type Find = { query: string; current: Match | undefined };

// Inside a turn, what a search reads past: the cards it carries, the work behind it, controls,
// labels and the question over an answer. The same words `matchesOf` reads, in the DOM.
const NOT_WORDS = [
  ".card",
  ".prose-card",
  ".work-details",
  "button",
  "dt",
  ".prose-limitation-prompt",
  ".turn-ended",
  ".turn-stamp",
  ".turn-activity",
  ".turn-pending",
  ".sent-context",
  ".search-rings",
].join(", ");
// The boxes that end a line of words, so a match never runs from one paragraph into the next.
const BLOCKS = "p, h1, h2, h3, h4, li, dd, dt, blockquote, pre, div, article";
// The highlight names thread.css paints (`::highlight()`): every match, and the one showing.
const ALL = "thread-search";
const CURRENT = "thread-search-current";
// How long the ring around the match stepped to stays, as long as a jumped-to turn's glow.
const RING_MS = 1200;

// A text node and where its words start in the turn's text.
type Piece = { node: Text; start: number };

// Each ring layer's pending clear, so a second jump's rings never go with the first's timer.
const ringTimers = new WeakMap<HTMLElement, number>();

// Each mounted thread's marks, so threads side by side on a canvas each keep their own while
// the page has one highlight of each name.
const marks = new Map<HTMLElement, { all: Range[]; current: Range | undefined }>();

// The turn's words as one string, a line apart at every block, with where each text node sits.
function wordsOf(turn: HTMLElement): { text: string; pieces: Piece[] } {
  const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      (node.parentElement?.closest(NOT_WORDS) ?? null) === null
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const pieces: Piece[] = [];
  let text = "";
  let block: Element | null = null;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    const own = node.parentElement?.closest(BLOCKS) ?? null; // → the block it reads in
    if (pieces.length > 0 && own !== block) text += "\n";
    block = own;
    pieces.push({ node, start: text.length });
    text += node.textContent ?? "";
  }
  return { text, pieces };
}

// The text node and offset that `index` in the turn's words falls at: the last piece starting
// at or before it, or, for the end of a match, before it, so a match never ends at the start of
// the next node.
function pointAt(pieces: Piece[], index: number, end: boolean): [Text, number] {
  let at = pieces[0];
  for (const piece of pieces) if (end ? piece.start < index : piece.start <= index) at = piece;
  return [at.node, index - at.start];
}

/**
 * Every occurrence of `query` in a turn's own words, in reading order, ignoring case and never
 * overlapping: the occurrences `matchesOf` counts, as ranges on the page.
 */
export function rangesIn(turn: HTMLElement, query: string): Range[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [];
  const { text, pieces } = wordsOf(turn);
  const haystack = text.toLocaleLowerCase();
  const ranges: Range[] = [];
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    const range = document.createRange();
    range.setStart(...pointAt(pieces, at, false));
    range.setEnd(...pointAt(pieces, at + needle.length, true));
    ranges.push(range);
  }
  return ranges;
}

// The thread's turns: a turn of either role, or one answer on a surface of answers.
function turnsIn(scroller: HTMLElement): HTMLElement[] {
  return [...scroller.querySelectorAll<HTMLElement>("[data-turn-id]")].filter(
    (turn) => turn.querySelector("[data-turn-id]") === null,
  );
}

// Paints what every thread's marks hold. Where the browser has no Custom Highlight API the words
// go unpainted, and the ring alone shows where the match is.
function paint(): void {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const all = [...marks.values()].flatMap((mark) => mark.all);
  const current = [...marks.values()].flatMap((mark) => mark.current ?? []);
  CSS.highlights.set(ALL, new Highlight(...all));
  CSS.highlights.set(CURRENT, new Highlight(...current));
}

/**
 * Marks a thread's search on the page: every match tinted, and the match stepped to painted as a
 * text selection is. Null clears the thread's marks, as when its search closes or it unmounts.
 * @returns The range of the match stepped to, or undefined when it is not on the page.
 */
export function markSearch(scroller: HTMLElement, find: Find | null): Range | undefined {
  if (find === null) {
    marks.delete(scroller);
    paint();
    return undefined;
  }
  const byTurn = new Map(turnsIn(scroller).map((turn) => [turn.dataset.turnId, turn] as const));
  const all = [...byTurn.values()].flatMap((turn) => rangesIn(turn, find.query)); // → Range[]
  const { current } = find;
  const turn = current === undefined ? undefined : byTurn.get(current.turnId);
  const shown = turn === undefined ? undefined : rangesIn(turn, find.query)[current?.nth ?? 0];
  marks.set(scroller, { all, current: shown });
  paint();
  return shown;
}

/**
 * Rings the words of `range` once, so the eye finds them after a jump: one ring per line they
 * run over, drawn in the thread's ring layer, which scrolls with the turns.
 */
export function ringRange(layer: HTMLElement, range: Range): void {
  const scroller = layer.parentElement;
  if (scroller === null) return;
  layer.replaceChildren();
  const box = scroller.getBoundingClientRect();
  for (const line of range.getClientRects()) {
    const ring = document.createElement("span");
    ring.className = "search-ring";
    ring.style.top = `${line.top - box.top - scroller.clientTop + scroller.scrollTop}px`;
    ring.style.left = `${line.left - box.left - scroller.clientLeft + scroller.scrollLeft}px`;
    ring.style.width = `${line.width}px`;
    ring.style.height = `${line.height}px`;
    layer.append(ring);
  }
  window.clearTimeout(ringTimers.get(layer));
  ringTimers.set(
    layer,
    window.setTimeout(() => {
      layer.replaceChildren();
    }, RING_MS),
  );
}
