import { playgroundEventSchema, type PlaygroundEvent } from "@yaklabs/catalog/playground";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp } from "./app";
import { postPlayground, round, say, text, thinking, tool } from "./playgroundTestKit";
import { memoryShares, randomToken } from "./shares";
import { openRouterClient } from "./upstream";

const raw =
  "Preserve missing weeks, leave the table empty, and replace the existing chart. ".repeat(5);
const summary = "I plan to preserve missing weeks and replace the existing chart.";
const work = { workId: "chart", label: "Preparing chart", status: "running" };
const requestSchema = z.object({ stream: z.boolean().optional() });
const cleanups: (() => Promise<void>)[] = [];

function item<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`Provider request ${index} did not arrive.`);
  return value;
}

const summaryResponse = (value = summary) =>
  Response.json({
    id: "summary",
    type: "message",
    role: "assistant",
    model: "moonshotai/kimi-k2.6",
    content: [{ type: "text", text: value }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  });

function channel(signal: AbortSignal) {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const abort = () => {
    void writer.abort(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const append = async (response: Response, initial = false) => {
    const body = await response.text();
    const fragment = initial ? body : body.replace(/^event: message_start[\s\S]*?\n\n/, "");
    await writer.write(new TextEncoder().encode(fragment));
  };
  const close = async () => {
    signal.removeEventListener("abort", abort);
    await writer.close();
  };
  return {
    signal,
    append,
    close,
    response: new Response(stream.readable, { headers: { "Content-Type": "text/event-stream" } }),
  };
}

function provider() {
  const execution: ReturnType<typeof channel>[] = [];
  const summaries: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  const upstream = openRouterClient("test", {
    maxRetries: 0,
    fetch: async (url, init) => {
      const request = new Request(url, init);
      const body = requestSchema.parse(await request.json());
      const signal = init?.signal ?? request.signal;
      if (body.stream === true) {
        const next = channel(signal);
        execution.push(next);
        return next.response;
      }
      return new Promise<Response>((resolve, reject) => {
        summaries.push({ signal, resolve });
        signal.addEventListener(
          "abort",
          () => {
            reject(signal.reason);
          },
          { once: true },
        );
      });
    },
  });
  const app = createApp({
    upstream,
    verifyToken: async () => ({ userId: "test-user", sessionId: "test-session" }),
    shares: { store: memoryShares(Date.now), now: () => new Date(), newToken: randomToken },
  });
  return { app, execution, summaries };
}

async function start() {
  const p = provider();
  const abort = new AbortController();
  const response = await postPlayground(p.app, say("Use the supplied data."), {
    signal: abort.signal,
  });
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("Gateway response body is missing.");
  const events: PlaygroundEvent[] = [];
  const errors: unknown[] = [];
  const done = (async () => {
    for (;;) {
      const next = await reader.read();
      if (next.done) return;
      const bytes = z.instanceof(Uint8Array).parse(next.value);
      for (const line of new TextDecoder().decode(bytes).trim().split("\n"))
        events.push(playgroundEventSchema.parse(JSON.parse(line)));
    }
  })().catch((error: unknown) => {
    errors.push(error);
  });
  cleanups.push(async () => {
    abort.abort();
    await done;
  });
  await item(p.execution, 0).append(round(null, thinking(0, raw))(), true);
  await vi.waitFor(() => {
    expect(p.summaries).toHaveLength(1);
  });
  return { ...p, reader, events, errors, done };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("finishes a tool round and terminal reply while a summary is stalled, aborting it", async () => {
  const h = await start();
  await item(h.execution, 0).append(round("tool_use", tool(1, "update_work", work))());
  await item(h.execution, 0).close();
  await vi.waitFor(() => {
    expect(h.execution).toHaveLength(2);
  });
  expect(h.events).toEqual([
    { type: "start", seq: 0, v: 4 },
    { type: "work", seq: 1, ...work },
  ]);
  expect(item(h.summaries, 0).signal.aborted).toBe(false);
  await item(h.execution, 1).append(round("end_turn", text(0, "Answer."))(), true);
  await item(h.execution, 1).close();
  await h.done;
  expect(h.events).toEqual([
    { type: "start", seq: 0, v: 4 },
    { type: "work", seq: 1, ...work },
    { type: "text", seq: 2, blockId: "r2b0", delta: "Answer." },
    { type: "end", seq: 3, reason: "answered" },
  ]);
  expect(h.errors).toEqual([]);
  expect(item(h.summaries, 0).signal.aborted).toBe(true);
  item(h.summaries, 0).resolve(summaryResponse());
  expect(h.events).toHaveLength(4);
});

it("cancels both active requests while the response has a pending read", async () => {
  const h = await start();
  let cancelled = false;
  const cancellation = h.reader.cancel().then(() => {
    cancelled = true;
    return;
  });
  cleanups.push(() => cancellation);
  await vi.waitFor(() => {
    expect(cancelled).toBe(true);
  });
  await h.done;
  expect(item(h.execution, 0).signal.aborted).toBe(true);
  expect(item(h.summaries, 0).signal.aborted).toBe(true);
  expect(h.events).toEqual([{ type: "start", seq: 0, v: 4 }]);
  expect(h.errors).toEqual([]);
});

it.each(["headers", "body"])(
  "times out a summary stalled before %s completion and recovers next round",
  async (phase) => {
    const h = await start();
    const began = performance.now();
    const first = item(h.summaries, 0);
    if (phase === "body") {
      const stalled = channel(first.signal);
      first.resolve(
        new Response(stalled.response.body, { headers: { "Content-Type": "application/json" } }),
      );
      await stalled.append(new Response('{"id":"unfinished"'), true);
    }
    await item(h.execution, 0).append(round("tool_use", tool(1, "update_work", work))());
    await item(h.execution, 0).close();
    await vi.waitFor(() => {
      expect(h.execution).toHaveLength(2);
    });
    await item(h.execution, 1).append(round(null, thinking(0, raw))(), true);
    expect(first.signal.aborted).toBe(false);
    expect(h.events).toEqual([
      { type: "start", seq: 0, v: 4 },
      { type: "work", seq: 1, ...work },
    ]);
    await vi.waitFor(
      () => {
        expect(first.signal.aborted).toBe(true);
      },
      { timeout: 9000 },
    );
    expect(performance.now() - began).toBeGreaterThan(7500);
    expect(item(h.execution, 1).signal.aborted).toBe(false);
    first.resolve(summaryResponse("The old, timed-out summary must not appear."));
    await vi.waitFor(() => {
      expect(h.summaries).toHaveLength(2);
    });
    item(h.summaries, 1).resolve(summaryResponse());
    await vi.waitFor(() => {
      expect(h.events.at(-1)).toEqual({
        type: "thinking",
        seq: 2,
        blockId: "approach",
        delta: summary,
      });
    });
    await item(h.execution, 1).append(round("end_turn", text(1, "Answer."))());
    await item(h.execution, 1).close();
    await h.done;
    expect(h.events).toEqual([
      { type: "start", seq: 0, v: 4 },
      { type: "work", seq: 1, ...work },
      { type: "thinking", seq: 2, blockId: "approach", delta: summary },
      { type: "text", seq: 3, blockId: "r2b1", delta: "Answer." },
      { type: "end", seq: 4, reason: "answered" },
    ]);
    expect(h.errors).toEqual([]);
    expect(h.summaries).toHaveLength(2);
  },
  15000,
);
