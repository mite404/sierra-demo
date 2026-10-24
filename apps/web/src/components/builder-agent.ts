import type { Agent } from "@yaklabs/catalog/agent";
import type { ReplyChunk } from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { parseQuietProse } from "@yaklabs/runtime/markdown";
import { newEmitter, writeMarkdown, closeMarkdown } from "@yaklabs/runtime/markdown-emitter";
import { linesOf } from "@yaklabs/runtime/ndjson";
import {
  builderEvent,
  type BuilderEvent,
  type SimulationAuthorSource,
  type sessionMessages,
} from "gateway/simulation-contract";

/** Lifecycle and server events for interactive workflow and simulation authoring only. */
export type BuilderNotice =
  | BuilderEvent
  | { kind: "start" }
  | { kind: "cancelled" }
  | { kind: "error"; error: string };

const failure = (detail: string): ReplyChunk => ({
  kind: "failure",
  failure: { title: "Reply incomplete", detail, retry: false },
});
const toolLabel = (name: string) =>
  name === "ask_user"
    ? "Choosing workflow preferences"
    : name === "propose_refund_workflow"
      ? "Preparing workflow proposal"
      : "Preparing simulation proposal";

async function* readBuilderReply(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  observe: (event: BuilderEvent) => void,
  endpoint: BuilderOptions["endpoint"],
): AsyncGenerator<ReplyChunk> {
  let emitter = newEmitter;
  const tools: { id: string; tool: string }[] = [];
  try {
    for await (const line of linesOf(body)) {
      signal.throwIfAborted();
      const event = builderEvent.parse(JSON.parse(line));
      if (
        (event.kind === "workflow-end" && endpoint !== "/api/workflow") ||
        (event.kind === "author-end" && endpoint !== "/api/simulation-author")
      )
        throw new Error("Unexpected builder completion");
      observe(event);
      switch (event.kind) {
        case "session":
          break;
        case "text": {
          const written = writeMarkdown(emitter, event.text);
          emitter = written.emitter;
          yield* written.chunks;
          break;
        }
        case "question":
          yield event;
          break;
        case "tool-start":
          tools.push(event);
          yield {
            kind: "step",
            step: { id: event.id, label: toolLabel(event.tool), status: "running" },
          };
          yield { kind: "activity", text: toolLabel(event.tool) };
          break;
        case "workflow-end":
        case "author-end":
          yield* closeMarkdown(emitter);
          emitter = newEmitter;
          if (event.error === null) {
            for (const tool of tools)
              yield {
                kind: "step",
                step: {
                  id: tool.id,
                  label: toolLabel(tool.tool),
                  status: "done",
                  outcome: "Ready for employee review",
                },
              };
          } else {
            yield failure(event.error);
          }
          return;
        default: {
          const unhandled: never = event;
          throw new Error(`Unexpected builder event: ${String(unhandled)}`);
        }
      }
    }
    throw new Error("Builder stream ended without completion");
  } finally {
    yield* closeMarkdown(emitter);
  }
}

type BuilderOptions = {
  resume?: { id: string; closed: boolean };
  observe: (notice: BuilderNotice, id: number) => void;
} & (
  | { endpoint: "/api/workflow"; initial: Record<string, never> }
  | { endpoint: "/api/simulation-author"; initial: { source: SimulationAuthorSource } }
);

/** Restores human replies with the same formatting as a completed stream, retaining questions. */
export function builderMessages(
  messages: ReturnType<typeof sessionMessages.parse>,
): ThreadMessage[] {
  return messages.map((message): ThreadMessage =>
    message.role === "agent"
      ? { ...message, role: "agent", blocks: parseQuietProse(message.text) }
      : { ...message, role: "user" },
  );
}

/** Streams human builder prose through the original append-only Markdown emitter. */
export function createBuilderAgent(options: BuilderOptions): Agent {
  let sessionId = options.resume?.id;
  let busy = false;
  let retired = options.resume?.closed ?? false;
  let sequence = 0;
  return {
    async *respond(request, signal) {
      if (request.kind === "question-rejected" || signal.aborted) return;
      if (busy || retired) {
        yield failure(
          busy
            ? "Wait for this reply before sending a follow-up."
            : "This builder session ended. Start a new conversation explicitly.",
        );
        return;
      }
      busy = true;
      const id = ++sequence;
      const observe = (notice: BuilderNotice) => {
        options.observe(notice, id);
      };
      const cancelled = () => {
        retired = true;
        sessionId = undefined;
        observe({ kind: "cancelled" });
      };
      signal.addEventListener("abort", cancelled, { once: true });
      observe({ kind: "start" });
      try {
        signal.throwIfAborted();
        const startId = sessionId ? undefined : crypto.randomUUID();
        // Persist the opaque handle before HTTP, including when the first response is lost.
        if (startId) observe({ kind: "session", id: startId });
        const response = await fetch(options.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify(
            sessionId
              ? { sessionId, message: request.text }
              : { ...options.initial, startId, message: request.text },
          ),
        });
        if (!response.ok || !response.body) throw new Error("Request unavailable");
        yield* readBuilderReply(
          response.body,
          signal,
          (event) => {
            observe(event);
            if (event.kind === "session") sessionId = event.id;
            if (
              (event.kind === "workflow-end" || event.kind === "author-end") &&
              event.error !== null
            )
              retired = true;
          },
          options.endpoint,
        );
      } catch {
        if (!signal.aborted) {
          retired = true;
          const error =
            "The builder reply could not complete. Start a new conversation explicitly.";
          observe({ kind: "error", error });
          yield failure(error);
        }
      } finally {
        signal.removeEventListener("abort", cancelled);
        busy = false;
      }
    },
  };
}
