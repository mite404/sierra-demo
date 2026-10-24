import type { Block, Inline } from "@yaklabs/catalog/prose";
import type { ReplyChunk } from "@yaklabs/catalog/reply";
import { parseQuietProse, settledQuietProse } from "./markdown";

/**
 * One block of markdown streaming in: its source so far, and the blocks already yielded as
 * chunks. Pure data, so a reply's fold can carry it.
 */
export type MarkdownEmitter = Readonly<{ source: string; shown: readonly Block[] }>;

/** What one step of the emitter yields: its next state and the chunks to send. */
export type Emitted = { emitter: MarkdownEmitter; chunks: ReplyChunk[] };

// How a block or a list item opens.
type BlockOpener = Extract<ReplyChunk, { kind: "block" }>["block"];

/** An emitter before its first delta. */
export const newEmitter: MarkdownEmitter = { source: "", shown: [] };

// Runs of one mark side by side join, as the reply fold joins them, so blocks compare the
// way a turn holds them.
function joinRuns(content: readonly Inline[]): Inline[] {
  const joined: Inline[] = [];
  for (const segment of content) {
    const last = joined.at(-1);
    if (last?.kind === "run" && segment.kind === "run" && last.mark === segment.mark)
      joined[joined.length - 1] = { ...last, text: last.text + segment.text };
    else joined.push(segment);
  }
  return joined;
}

function joinBlock(block: Block): Block {
  if (block.kind === "list") return { ...block, items: block.items.map((item) => joinRuns(item)) };
  if (block.kind === "card" || block.kind === "limitation") return block;
  return { ...block, content: joinRuns(block.content) };
}

function inlineChunk(segment: Inline): ReplyChunk {
  if (segment.kind === "link") return { kind: "link", text: segment.text, href: segment.href };
  const { text, mark } = segment;
  return mark === undefined ? { kind: "text", text } : { kind: "text", text, mark };
}

// Inline content as chunks, after `opener` when a block or list item opens with it.
function contentChunks(content: readonly Inline[], opener?: BlockOpener): ReplyChunk[] {
  const chunks: ReplyChunk[] = opener === undefined ? [] : [{ kind: "block", block: opener }];
  for (const segment of content) chunks.push(inlineChunk(segment));
  return chunks;
}

// A whole block as chunks: each opens with its own `block`, so it never runs into the last.
function blockChunks(block: Block): ReplyChunk[] {
  switch (block.kind) {
    case "paragraph":
    case "heading":
      return contentChunks(block.content, block.kind);
    case "list":
      return block.items.flatMap((item, i) => contentChunks(item, i === 0 ? "list" : "item"));
    case "card":
      return [
        {
          kind: "card",
          payload: block.payload,
          ...(block.id === undefined ? {} : { id: block.id }),
        },
      ];
    case "limitation":
      return [{ ...block }];
    default: {
      const unhandled: never = block;
      return unhandled;
    }
  }
}

// The words `after` adds to a run already shown: a settled run only ever grows, so anything
// but a prefix breaks the emitter's contract and the reply fails rather than corrupt.
function restOf(after: string, before: string): string {
  if (!after.startsWith(before))
    throw new Error(`A run already shown changed: "${before}" became "${after}"`);
  return after.slice(before.length);
}

// The chunks that grow inline content `before` into `after`: the rest of the last run, then
// every segment after it.
function contentGrowth(before: readonly Inline[], after: readonly Inline[]): ReplyChunk[] {
  const last = before.at(-1);
  const next = after.at(before.length - 1);
  const rest = last?.kind === "run" && next?.kind === "run" ? restOf(next.text, last.text) : "";
  const head = next === undefined || rest === "" ? [] : [inlineChunk({ ...next, text: rest })];
  return [...head, ...contentChunks(after.slice(before.length))];
}

// A block's runs of words: a list's items, or a paragraph's or heading's one run.
function partsOf(block: Block): Inline[][] {
  switch (block.kind) {
    case "list":
      return block.items;
    case "paragraph":
    case "heading":
      return [block.content];
    case "card":
    case "limitation":
      return [];
    default: {
      const unhandled: never = block;
      return unhandled;
    }
  }
}

// The chunks that grow a block already shown into what it has become: the rest of its last
// run of words, then each list item after it.
function blockGrowth(before: Block, after: Block | undefined): ReplyChunk[] {
  const shown = partsOf(before);
  const grown = after?.kind === before.kind ? partsOf(after) : [];
  const last = shown.length - 1;
  if (last < 0 || grown.length === 0) return [];
  const more = grown.slice(last + 1).flatMap((item) => contentChunks(item, "item"));
  return [...contentGrowth(shown[last] ?? [], grown[last] ?? []), ...more];
}

// The chunks that grow `before` into `after`, where `before` is a prefix of `after`.
function growth(before: readonly Block[], after: readonly Block[]): ReplyChunk[] {
  const last = before.at(-1);
  const grown = last === undefined ? [] : blockGrowth(last, after.at(before.length - 1));
  return [...grown, ...after.slice(before.length).flatMap((block) => blockChunks(block))];
}

/**
 * Takes one delta of a markdown block and yields what is now settled: the lines it closed as
 * `block`, `text` and `link` chunks, and inside the open line the words up to the last space
 * before anything still unclosed. Nothing yielded is ever taken back.
 */
export function writeMarkdown(emitter: MarkdownEmitter, delta: string): Emitted {
  const source = emitter.source + delta;
  const settled = settledQuietProse(source).map((block) => joinBlock(block)); // → Block[]
  const chunks = growth(emitter.shown, settled); // → ReplyChunk[]
  return { emitter: { source, shown: chunks.length === 0 ? emitter.shown : settled }, chunks };
}

/**
 * Closes the block: yields the rest, so the chunks this emitter yielded, folded into a turn,
 * add exactly `parseQuietProse` of the whole source.
 */
export function closeMarkdown(emitter: MarkdownEmitter): ReplyChunk[] {
  const whole = parseQuietProse(emitter.source).map((block) => joinBlock(block)); // → Block[]
  return growth(emitter.shown, whole);
}
