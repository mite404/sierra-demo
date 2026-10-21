import type { Agent, AgentEvent } from "@yaklabs/catalog/agent";
import {
  applyChunk,
  cancelReply,
  completeReply,
  startReply,
  type AgentMessage,
  type ReplyChunk,
} from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { userTurn, wordingOf } from "../demo/replies";
import type { Stage } from "./stage";

// When a turn is made: the wall clock, as an instant, so a reply reads "just now" and ages.
const now = (): string => new Date().toISOString();

// The wording a chunk docks as the thread's question, if it docks one.
function docked(chunk: ReplyChunk): { wording: string | undefined } | undefined {
  if (typeof chunk === "string" || chunk.kind !== "question") return undefined;
  return { wording: wordingOf(chunk.question) };
}

/**
 * One reply on one overlay thread, whoever answers it: the user's turn, then `agent`'s, folded
 * with `applyChunk` and kept under a lease as it streams, settled (complete or cancelled) when
 * it ends. A docked question's wording is kept for the thread, for the answer's turn. The
 * structured turn is what the thread keeps, so a panel that mounts again reads it back whole.
 * Once a reset revokes the lease, the reply stops and writes nothing more.
 * @throws For a thread the overlay lacks, or whatever `agent` throws.
 */
export async function* converse(
  stage: Stage,
  id: string,
  event: AgentEvent,
  agent: Agent,
  signal: AbortSignal,
): AsyncGenerator<ReplyChunk> {
  const lease = stage.lease([id]);
  const before = stage.turnsOf(id); // → throws for a thread the overlay lacks
  const asked = userTurn(event, `${id}-${before.length + 1}`, now(), stage.questionOf(id));
  const at = before.length + asked.length; // → the reply's index in the turns
  let reply: AgentMessage = startReply(`${id}-${at + 1}`, now());
  const put = (turns: ThreadMessage[]) => turns.with(at, reply);
  lease.keep(id, () => [...before, ...asked, reply]);
  lease.begin(id);
  try {
    for await (const chunk of agent.respond(event, signal)) {
      if (signal.aborted || lease.revoked()) break;
      reply = applyChunk(reply, chunk);
      const question = docked(chunk);
      if (question !== undefined) lease.asked(id, question.wording);
      lease.hold(id, put);
      yield chunk;
    }
  } finally {
    if (signal.aborted) reply = cancelReply(reply);
    else if (reply.ended === undefined) reply = completeReply(reply);
    lease.keep(id, put);
    lease.end(id);
  }
}
