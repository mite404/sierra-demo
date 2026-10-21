import type { ThreadMessage } from "./thread";

// How much of a request its bookmark shows: enough to tell requests apart at a glance.
const BOOKMARK_CHARS = 48;

/** One request the user sent, as its bookmark shows it. */
export type Request = { id: string; label: string; text: string; time: string };

/**
 * The first `BOOKMARK_CHARS` characters of a request, counted by code point so an emoji is
 * never cut in half, with an ellipsis when there was more.
 */
export function bookmarkLabel(text: string): string {
  const chars = Array.from(text.trim().replaceAll(/\s+/g, " ")); // → one entry per code point
  const head = chars.slice(0, BOOKMARK_CHARS).join("").trimEnd();
  return chars.length > BOOKMARK_CHARS ? `${head}…` : head;
}

/**
 * Every request the user sent in the thread, oldest first. An answer to a docked question is
 * not a request: the question asked it, so it is left out.
 */
export function requestsOf(messages: ThreadMessage[]): Request[] {
  return messages
    .filter((message) => message.role === "user" && message.question === undefined) // → requests
    .map(({ id, text, time }) => ({ id, label: bookmarkLabel(text), text, time }));
}

/** One place the search found its words: the turn, and which occurrence in it, from 0. */
export type Match = { turnId: string; nth: number };

const sameMatch = (a: Match, b: Match): boolean => a.turnId === b.turnId && a.nth === b.nth;

// How many times `needle` occurs in `haystack`, side by side and never overlapping, as an
// editor's find counts them.
function occurrences(haystack: string, needle: string): number {
  let count = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  )
    count += 1;
  return count;
}

/**
 * Every occurrence of `query` in the thread, in reading order, ignoring case: each turn's in
 * the order they come. A blank query matches nothing. Only a turn's own words are searched,
 * not the cards it carries.
 */
export function matchesOf(messages: ThreadMessage[], query: string): Match[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [];
  return messages.flatMap((message) => {
    const count = occurrences(message.text.toLocaleLowerCase(), needle); // → occurrences in the turn
    return Array.from({ length: count }, (_, nth) => ({ turnId: message.id, nth }));
  });
}

/**
 * The match one step from `current` in `direction`, wrapping at either end. With no current
 * match, or one that is gone, forward lands on the first and back on the last.
 */
export function stepMatch(
  matches: Match[],
  current: Match | undefined,
  direction: 1 | -1,
): Match | undefined {
  if (matches.length === 0) return undefined;
  const at = current === undefined ? -1 : matches.findIndex((m) => sameMatch(m, current)); // → -1 when gone
  if (at === -1) return direction === 1 ? matches[0] : matches.at(-1);
  return matches[(at + direction + matches.length) % matches.length];
}

/** What the search's counter says: how many matches there are, and which one is showing. */
export function matchStatus(matches: Match[], current?: Match): string {
  if (matches.length === 0) return "No matches";
  const at = current === undefined ? -1 : matches.findIndex((m) => sameMatch(m, current));
  if (at === -1) return matches.length === 1 ? "1 match" : `${matches.length} matches`;
  return `${at + 1} of ${matches.length}`;
}
