import type { Agent } from "@yaklabs/catalog/agent";
import type { ReplyChunk } from "@yaklabs/catalog/reply";
import { linesOf } from "@yaklabs/runtime/ndjson";
import {
  simulationEvent,
  type SimulationEvent,
  type SimulationSelection,
} from "gateway/simulation-contract";

export type LabNotice =
  | SimulationEvent
  | { kind: "start" }
  | { kind: "cancelled" }
  | { kind: "error"; error: string };
const failure = (detail: string): ReplyChunk => ({
  kind: "failure",
  failure: { title: "Reply incomplete", detail, retry: false },
});
const toolLabel = () => "Requesting a refund";

// Project one response's real events into catalog activity; session ownership stays in the agent.
async function* readReply(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  observe: (event: SimulationEvent) => void,
): AsyncGenerator<ReplyChunk | string> {
  let traceCount = 0;
  let seenSnapshot = false;
  const tools: { id: string; tool: string }[] = [];
  for await (const line of linesOf(body)) {
    signal.throwIfAborted();
    const event = simulationEvent.parse(JSON.parse(line));
    observe(event);
    switch (event.kind) {
      case "session":
        break;
      case "text":
        yield event.text;
        break;
      case "tool-start":
        tools.push(event);
        yield {
          kind: "step",
          step: { id: event.id, label: toolLabel(), status: "running" },
        };
        yield { kind: "activity", text: toolLabel() };
        break;
      case "snapshot":
        if (!seenSnapshot) {
          traceCount = event.result.trace.length;
          seenSnapshot = true;
        }
        for (const entry of event.result.trace.slice(traceCount)) {
          const tool = tools.shift();
          if (tool)
            yield {
              kind: "step",
              step: {
                id: tool.id,
                label: toolLabel(),
                status: "done",
                outcome: entry.outcome.replaceAll("_", " "),
              },
            };
          yield { kind: "log", text: JSON.stringify(entry, null, 2) };
        }
        traceCount = event.result.trace.length;
        break;
      case "end": {
        const error = event.result.error;
        if (error === null) {
          for (const tool of tools)
            yield {
              kind: "step",
              step: {
                id: tool.id,
                label: toolLabel(),
                status: "done",
                outcome: "Refund request checked",
              },
            };
        } else {
          yield failure(error);
        }
        return;
      }
    }
  }
  throw new Error("Stream ended without final evidence");
}

/** Adapts actual NDJSON events to the existing catalog thread, without fake text or model reasoning. */
export function createLabAgent(options: {
  endpoint: "/api/simulation";
  initial: Partial<SimulationSelection> & { workflowId?: string };
  resume?: { id: string; closed: boolean };
  observe: (notice: LabNotice, id: number) => void;
}): Agent {
  let sessionId = options.resume?.id;
  let busy = false;
  let retired = options.resume?.closed ?? false;
  let sequence = 0;
  return {
    async *respond(request, signal) {
      if (request.kind === "question-rejected") return;
      if (busy || retired) {
        yield failure(
          busy
            ? "Wait for this reply before sending a follow-up."
            : "This session ended. Reset to start with fresh history and invoices.",
        );
        return;
      }
      busy = true;
      const id = ++sequence;
      const observe = (notice: LabNotice) => {
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
        const startId = sessionId ? undefined : crypto.randomUUID();
        // Save before HTTP: even a lost first response cannot silently start fresh invoices.
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
        yield* readReply(response.body, signal, function receiveEvent(event) {
          observe(event);
          if (event.kind === "session") sessionId = event.id;
          if (event.kind === "end" && event.result.error !== null) retired = true;
        });
      } catch {
        if (!signal.aborted) {
          retired = true;
          const error = "The live reply could not complete. No grade. Reset and try again.";
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
