import type { Block, Inline } from "@yaklabs/catalog/prose";
import type { ReplyChunk, ReplyEvent } from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";

// Time between streamed words at 1x: about fourteen words a second, quick enough to read as a
// live reply and slow enough that a watcher can follow the emphasis as it lands (goal 4).
const WORD_MS = 70;

/** One chunk of a reply and the pause before it, in milliseconds at 1x. */
export type Timed = { after: number; chunk: ReplyChunk };

/**
 * One beat of a scripted conversation. A user beat is performed through the thread's own
 * controls (the compose box, the docked question, Stop, Try again); a reply beat is what the
 * scripted agent answers the request before it with. A user beat waits `after` ms once the
 * reply before it has settled, or, with `overlap`, once the user beat before it was performed,
 * so a second request can go out while the first reply still streams. A choose beat steps a
 * card and sends nothing; the request after it carries the choice.
 */
export type Beat =
  | { kind: "user"; after: number; text: string; overlap?: true }
  | { kind: "answer"; after: number; text: string }
  /** Steps the latest interactive card to the stop named, so the choice rides with the next request. */
  | { kind: "choose"; after: number; measure: string }
  | { kind: "stop"; after: number }
  | { kind: "retry"; after: number }
  | { kind: "reply"; events: Timed[] };

/** A child thread the agent spawns: what the sidebar calls it and the request it was given. */
export type ChildScript = { title: string; request: string };

/**
 * A run that already happened while the user was away, for a scenario that opens on its record
 * rather than on an empty thread: the main thread's turns as the run left them, and how long
 * ago the user last spoke. Every child a step of those turns names is made with the request
 * and the outcome the run would have left it, as a live run does. The turns' times are set when
 * the demo loads, that many minutes before now, so the recap and the stamp count from them;
 * whatever `time` they are written with is ignored.
 */
export type Opening = { awayMinutes: number; turns: ThreadMessage[] };

/** One scenario: the workspace it plays in, its children, and its beats in order. */
export type Script = {
  id: string;
  /** What the scenario picker calls it. */
  label: string;
  /** One line on what this scenario shows, for the picker's description. */
  shows: string;
  /**
   * What of this scenario is the product's and what is proposed, in one line under the demo's
   * name, so a watcher never takes a prototype for shipped work or the other way round.
   */
  standing: string;
  // TODO(U5b): the World spec names the project (world/demo.ts); drop this once U5b lands.
  project: string;
  thread: string;
  children: Record<string, ChildScript>;
  /** What the thread holds before the first beat; none for a scenario that starts empty. */
  opening?: Opening;
  beats: Beat[];
};

// The words of a run, each with the whitespace that precedes it, so joining them back gives
// the run exactly; a code run is one word, since splitting a token would show broken code.
function wordsOf(run: Extract<Inline, { kind: "run" }>): string[] {
  if (run.mark === "code") return [run.text];
  return run.text.match(/\s*\S+\s*/g) ?? [];
}

// One inline as timed chunks, a word at a time.
function inlineChunks(inline: Inline, first: boolean): Timed[] {
  if (inline.kind === "link") return [{ after: first ? 0 : WORD_MS, chunk: inline }];
  return wordsOf(inline).map((word, i) => ({
    after: first && i === 0 ? 0 : WORD_MS,
    chunk: { kind: "text", text: word, mark: inline.mark } satisfies ReplyEvent,
  }));
}

function contentChunks(content: Inline[]): Timed[] {
  return content.flatMap((inline, i) => inlineChunks(inline, i === 0));
}

/**
 * Authored blocks as the stream an agent would send them in: a block boundary, then its words
 * one at a time, `WORD_MS` apart; a card or a limitation arrives whole, as its event carries
 * it. `pause` is the wait before the first.
 */
export function stream(blocks: Block[], pause = 0): Timed[] {
  return blocks.flatMap((block, at) => {
    const lead = at === 0 ? pause : WORD_MS * 4;
    if (block.kind === "card" || block.kind === "limitation")
      return [{ after: lead, chunk: block }];
    if (block.kind === "list")
      return block.items.flatMap((item, i) => [
        {
          after: i === 0 ? lead : WORD_MS * 2,
          chunk: { kind: "block", block: i === 0 ? "list" : "item" } as const,
        },
        ...contentChunks(item),
      ]);
    return [
      { after: lead, chunk: { kind: "block", block: block.kind } as const },
      ...contentChunks(block.content),
    ];
  });
}

/** One event after a pause. */
export const at = (after: number, chunk: ReplyChunk): Timed => ({ after, chunk });

/** Progress narration after a pause. */
export const activity = (after: number, text: string): Timed =>
  at(after, { kind: "activity", text });

/** A technical line after a pause. */
export const log = (after: number, text: string): Timed => at(after, { kind: "log", text });

/** What the work amounted to, for the disclosure's label once the reply settles. */
export const sumUp = (after: number, text: string): Timed => at(after, { kind: "summary", text });

/** How long a reply's events take at 1x, for a check that a scenario fits the walkthrough. */
export function durationOf(events: Timed[]): number {
  return events.reduce((sum, timed) => sum + timed.after, 0);
}
