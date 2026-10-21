import type { ThreadSummary } from "./workspace";

// A word is a run of letters and digits, the same split SQLite's unicode61 tokenizer makes.
const WORD_BREAK = /[^\p{L}\p{N}]+/u;
const ACCENT = /\p{M}/gu;

/**
 * The FTS5 query for every word of `query` as a prefix, folded the way the full-text index
 * folds its text ("Café, Sat." → `"cafe"* "sat"*`); undefined when `query` has no words.
 * Folded words hold only letters and digits, so quoting them needs no escaping.
 */
export function matchQuery(query: string): string | undefined {
  const words = query
    .normalize("NFKD")
    .replace(ACCENT, "")
    .toLowerCase()
    .split(WORD_BREAK)
    .filter((word) => word !== "");
  return words.length === 0 ? undefined : words.map((word) => `"${word}"*`).join(" ");
}

/** Newest first; the id breaks ties so the order never depends on insertion. */
export function newestFirst(a: ThreadSummary, b: ThreadSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}
