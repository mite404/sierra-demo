import type { Agent, AgentEvent } from "@yaklabs/catalog/agent";
import type { Failure, ReplyChunk } from "@yaklabs/catalog/reply";
import { COPY } from "./playgroundCopy";
import { endShort, newReply, readLine, receive } from "./playgroundReply";
import { historyBefore, planRequest } from "./playgroundRequest";
import type { Store } from "./store";
import type { ThreadId } from "./workspace";

/** What the live agent needs for one message: the gateway, the thread, and who is asking. */
export type PlaygroundAgentOptions = {
  baseUrl: string;
  store: Pick<Store, "transcript">;
  threadId: ThreadId;
  /** The signed-in user's WorkOS token; without one nothing is sent (ADR-084, ADR-085). */
  accessToken?: string;
  /** Replaces the network, for tests that route requests to an in-process gateway. */
  fetch?: typeof fetch;
};

// How a request went before its stream: refused with the reader's words, stopped by the
// reader, or streaming.
type Opened =
  | { kind: "refused"; failure: Failure }
  | { kind: "stopped" }
  | { kind: "streaming"; body: ReadableStream<Uint8Array> };
type Asked = Extract<AgentEvent, { kind: "message" | "answer" }>;

const refused = (failure: Failure): Opened => ({ kind: "refused", failure });

// What a refusal before the first byte tells the reader; never the status, never the body.
function refusalOf(status: number): Failure {
  if (status === 401) return COPY.expired;
  if (status === 400) return COPY.rejected;
  if (status === 402) return COPY.credit;
  return COPY.unavailable;
}

// Posts the request. A status other than 200, or no body, is a refusal; a fetch that throws
// (unreachable, or aborted) throws.
async function post(
  options: PlaygroundAgentOptions,
  body: string,
  token: string,
  signal: AbortSignal,
): Promise<Opened> {
  const send = options.fetch ?? fetch;
  const response = await send(new URL("/api/playground", options.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body,
    signal,
  });
  if (response.status === 200 && response.body !== null)
    return { kind: "streaming", body: response.body };
  await response.body?.cancel(); // the body may hold details the reader must never see
  return refused(refusalOf(response.status));
}

// The body's lines as they arrive, blank ones dropped; a last line with no newline is kept,
// and reads as unreadable if it was cut off mid-way. Leaving early cancels the body, which
// stops the gateway's rounds.
async function* linesOf(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a stream is read in order
      const chunk = await reader.read(); // → { done, value: Uint8Array }
      if (chunk.done) break;
      const read = buffered + decoder.decode(chunk.value, { stream: true });
      const lines = read.split("\n"); // → string[], the last one maybe partial
      buffered = lines.pop() ?? "";
      yield* lines.filter((line) => line.trim() !== "");
    }
    buffered += decoder.decode();
    if (buffered.trim() !== "") yield buffered;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// The reply's chunks, folded from the stream. A line that is not an event, a body that closes
// before `end`, or a connection that drops ends it cut off, its held words shown first; the
// reader's own Stop ends it quietly.
async function* replyFrom(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ReplyChunk> {
  let state = newReply;
  try {
    for await (const line of linesOf(body)) {
      const event = readLine(line); // → Received | undefined
      const receipt = event === undefined ? endShort(state, COPY.cutOff) : receive(state, event);
      state = receipt.state;
      yield* receipt.chunks;
      if (receipt.done === true) return;
    }
  } catch {
    if (signal.aborted) return;
  }
  yield* endShort(state, COPY.cutOff).chunks;
}

// Sends the request for `event`, projected from the thread's turns, unless it cannot go: no
// token to send, or a request the gateway would not accept.
async function open(
  options: PlaygroundAgentOptions,
  event: Asked,
  signal: AbortSignal,
): Promise<Opened> {
  const { store, threadId, accessToken } = options;
  const transcript = store.transcript(threadId); // → Transcript | undefined
  if (transcript === undefined) throw new Error(`No thread ${threadId}`);
  if (accessToken === undefined) return refused(COPY.signIn);
  const plan = planRequest(historyBefore(transcript.messages, event), event); // → Plan
  if (plan.kind === "refuse") return refused(COPY.rejected);
  try {
    return await post(options, JSON.stringify(plan.request), accessToken, signal);
  } catch {
    return signal.aborted ? { kind: "stopped" } : refused(COPY.unavailable);
  }
}

/**
 * The model with tools behind the gateway (ADR-155), as the worker's agent for one message.
 * It keeps nothing between replies: it reads the thread's turns from the store, projects them
 * into a request, streams POST /api/playground and yields the reply as the seam's chunks, so
 * the thread shows Work details, cards and the question dock. Every failure reaches the reader
 * as a terminal `failure` in plain words; Stop ends the reply quietly.
 *
 * @throws From `respond`, only when the store has no such thread.
 */
export function createPlaygroundAgent(options: PlaygroundAgentOptions): Agent {
  return {
    async *respond(event, signal) {
      // The gateway checks a question with the catalog's own schema, so none is rejected here.
      if (event.kind === "question-rejected") return;
      const opened = await open(options, event, signal); // → Opened
      if (opened.kind === "refused") yield { kind: "failure", failure: opened.failure };
      if (opened.kind === "streaming") yield* replyFrom(opened.body, signal);
    },
  };
}
