import type { CardAttachment } from "./interactive";
import type { ReplyChunk } from "./reply";

/** A file the user attached, described for the agent (the lab sends no file contents). */
export type SharedFile = { name: string; type: string; size: number };

/**
 * What the thread tells the agent (ADR-041). The UI only ever reports events; deciding what
 * to say back is the agent runtime's job, whether that is the lab stand-in or a real model.
 */
export type AgentEvent =
  /** The user sent a message, with any card choices (ADR-030) and files, such as a
   *  screenshot (ADR-063), riding along. A real runtime would upload the files themselves. */
  | { kind: "message"; text: string; attachments: CardAttachment[]; files?: SharedFile[] }
  /** The user answered the agent's "Needs you" question (ADR-039). */
  | { kind: "answer"; text: string }
  /** The agent's question failed the schema, so it was never shown (ADR-040). The user never
   *  sees `reason`; the agent uses it to ask again in plain words. */
  | { kind: "question-rejected"; reason: string; question: unknown };

/**
 * The seam between the thread and whatever produces replies (ADR-041). A reply streams in as
 * chunks: words, the way a model streams tokens, and the events around them (progress
 * narration, steps of work, cards, a question, a failure; see `reply.ts`). An agent that
 * streams words alone still fits, and one may yield nothing at all. Swap the lab stand-in for
 * a real model by passing another `Agent` to the thread panel.
 */
export type Agent = {
  respond(event: AgentEvent, signal: AbortSignal): AsyncIterable<ReplyChunk>;
};
