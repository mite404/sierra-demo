import type { AgentEvent } from "@yaklabs/catalog/agent";
import { resolveAwaiting } from "@yaklabs/catalog/awaiting";
import { cancelReply, completeReply, type AgentMessage } from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { awaitingOf } from "@yaklabs/catalog/transcript";
import { titleFor } from "./workspace";

/** A thread's turns and the opening draft a dropped highlight left: what a reply rewrites. */
export type Transcript = { messages: ThreadMessage[]; draft: string; updatedAt: string };

/** When something happened: the instant for `updatedAt`, and the time of day a turn shows. */
export type Stamp = { at: string; time: string };

// "u" → u<n+1>, where n is the highest u-number so far; the same for "a". Seeds pair u1 with
// a1, u2 with a2, and a new turn keeps that pattern.
function nextId(messages: ThreadMessage[], prefix: "u" | "a"): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const used = messages
    .map((message) => pattern.exec(message.id)?.[1])
    .filter((digits) => digits !== undefined)
    .map(Number); // → number[]
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

// The wording of the question the thread waits on, as the reader saw it docked: only one that
// passes the catalog's check is ever docked (ADR-040), so any other was never asked of them.
function dockedWording(messages: ThreadMessage[]): string | undefined {
  const checked = resolveAwaiting(awaitingOf(messages)); // → AwaitingResult
  return checked.kind === "approved" ? checked.question.question : undefined;
}

// The user's side of an event, or nothing: a rejected question never reached the user. An
// answer carries the question it answered, so the thread shows the two together.
function userTurn(
  event: AgentEvent,
  messages: ThreadMessage[],
  id: string,
  time: string,
): ThreadMessage | undefined {
  switch (event.kind) {
    case "message": {
      const { text, attachments, files = [] } = event;
      const labels = files.map((file, i) => ({ id: `${id}-f${i + 1}`, label: file.name }));
      return {
        id,
        role: "user",
        text,
        time,
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(labels.length > 0 ? { files: labels } : {}),
      };
    }
    case "answer": {
      const question = dockedWording(messages); // → string | undefined
      return {
        id,
        role: "user",
        text: event.text,
        time,
        ...(question === undefined ? {} : { question }),
      };
    }
    case "question-rejected":
      return undefined;
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

/**
 * The transcript with the user's side of `event` added and the draft spent, or unchanged when
 * the event has no user side.
 */
export function withUserTurn(transcript: Transcript, event: AgentEvent, stamp: Stamp): Transcript {
  const { messages } = transcript;
  const turn = userTurn(event, messages, nextId(messages, "u"), stamp.time);
  if (turn === undefined) return transcript;
  return { messages: [...messages, turn], draft: "", updatedAt: stamp.at };
}

/**
 * A streamed turn settled as its stream ended: a turn a failure already ended stays as it is,
 * one the user stopped is cancelled with its running steps, and any other is complete.
 */
export function settleReply(turn: AgentMessage, stopped: boolean): AgentMessage {
  if (turn.ended !== undefined) return turn;
  return stopped ? cancelReply(turn) : completeReply(turn);
}

/**
 * The transcript with the agent's settled turn added at `at`, as the reply folded it, under the
 * next free `a<n>` id: minted as it is saved, since the id the reply started with is the
 * request's, and the loop runs a thread's replies one at a time, so the next id is its own.
 */
export function withAgentTurn(transcript: Transcript, turn: AgentMessage, at: string): Transcript {
  const saved: AgentMessage = { ...turn, id: nextId(transcript.messages, "a") };
  return { ...transcript, messages: [...transcript.messages, saved], updatedAt: at };
}

/**
 * The title a thread takes from its first message (Ethan), so the sidebar tells one from the
 * next: the message's first words, cut as a lane's header cuts them. Undefined once the thread
 * has a user turn, for an event other than a typed message, and for a message with no words.
 */
export function firstAskTitle(messages: ThreadMessage[], event: AgentEvent): string | undefined {
  const first = event.kind === "message" && !messages.some((message) => message.role === "user");
  const title = first ? titleFor(event.text) : "";
  return title === "" ? undefined : title;
}
