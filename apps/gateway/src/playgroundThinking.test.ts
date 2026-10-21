import type { PlaygroundEvent } from "@yaklabs/catalog/playground";
import { describe, expect, it, vi } from "vitest";
import { summarizeThinking } from "./playgroundThinking";
import { openRouterClient } from "./upstream";

const raw = "Private argument about batching tools and marking work done. ".repeat(8);
const first = "I plan to preserve missing weeks rather than invent values.";
const second = "I plan to preserve missing weeks and leave the empty escalation table empty.";
const end: PlaygroundEvent = { type: "end", seq: 99, reason: "answered" };

const response = (text: string, stop = "end_turn") =>
  Response.json({
    id: "summary",
    type: "message",
    role: "assistant",
    model: "moonshotai/kimi-k2.6",
    content: [{ type: "text", text }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  });

function harness() {
  const input = new TransformStream<PlaygroundEvent, PlaygroundEvent>();
  const writer = input.writable.getWriter();
  const replies: ((value: Response) => void)[] = [];
  const signals: (AbortSignal | null)[] = [];
  const requests: Request[] = [];
  const client = openRouterClient("test", {
    maxRetries: 0,
    fetch: (url, init) => {
      requests.push(new Request(url, init));
      signals.push(init?.signal ?? null);
      return new Promise<Response>((resolve) => {
        replies.push(resolve);
      });
    },
  });
  async function* source(): AsyncGenerator<PlaygroundEvent, void> {
    const reader = input.readable.getReader();
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) return;
        yield item.value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  const seen: PlaygroundEvent[] = [];
  const running = (async () => {
    for await (const event of summarizeThinking(
      { client, model: "moonshotai/kimi-k2.6" },
      source(),
      new AbortController().signal,
    ))
      seen.push(event);
  })();
  const send = (event: PlaygroundEvent) => writer.write(event);
  const think = (blockId = "r1b0", delta = raw) =>
    send({ type: "thinking", seq: 17, blockId, delta });
  const finish = async () => {
    await send(end);
    await writer.close();
    await running;
  };
  return { seen, think, send, finish, replies, requests, signals };
}

describe("thinking summaries", () => {
  it("updates during execution without exposing raw text or appending repeated summaries", async () => {
    const h = harness();
    await h.think();
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(1);
    });
    h.replies[0]?.(response(first));
    await vi.waitFor(() => {
      expect(h.seen).toEqual([{ type: "thinking", blockId: "approach", delta: first, seq: 0 }]);
    });
    await h.think("r2b0");
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(2);
    });
    h.replies[1]?.(response(second));
    await vi.waitFor(() => {
      expect(h.seen.at(-1)?.type).toBe("thinking");
    });
    await vi.waitFor(() => {
      expect(h.seen).toHaveLength(2);
    });
    await h.finish();
    expect(h.seen).toEqual([
      { type: "thinking", blockId: "approach", delta: first, seq: 0 },
      { type: "thinking", blockId: "approach", delta: second, seq: 1 },
      { ...end, seq: 2 },
    ]);
    expect(await h.requests[1]?.json()).toMatchObject({
      model: "moonshotai/kimi-k2.6",
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: JSON.stringify({ previous: first, reasoning: raw }) }],
    });
  });

  it("forwards tools and ends without waiting for a stalled summary, cancelling it", async () => {
    const h = harness();
    await h.think();
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(1);
    });
    const work: PlaygroundEvent = {
      type: "work",
      seq: 8,
      workId: "chart",
      label: "Preparing chart",
      status: "running",
    };
    await h.send(work);
    await vi.waitFor(() => {
      expect(h.seen).toEqual([{ ...work, seq: 0 }]);
    });
    await h.finish();
    expect(h.seen).toEqual([
      { ...work, seq: 0 },
      { ...end, seq: 1 },
    ]);
    expect(h.signals[0]?.aborted).toBe(true);
    h.replies[0]?.(response(first));
  });

  it("keeps answering after a summary request fails", async () => {
    const h = harness();
    await h.think();
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(1);
    });
    h.replies[0]?.(Response.json({ error: { message: "Unavailable" } }, { status: 503 }));
    await h.think("r2b0");
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(2);
    });
    h.replies[1]?.(response(first));
    await vi.waitFor(() => {
      expect(h.seen).toHaveLength(1);
    });
    await h.send({ type: "text", blockId: "answer", delta: "Answer.", seq: 8 });
    await h.finish();
    expect(h.seen).toEqual([
      { type: "thinking", blockId: "approach", delta: first, seq: 0 },
      { type: "text", blockId: "answer", delta: "Answer.", seq: 1 },
      { ...end, seq: 2 },
    ]);
  });

  it("does not emit unchanged summaries", async () => {
    const h = harness();
    for (const [i, text] of [first, first, second].entries()) {
      await h.think(`r${i + 1}b0`);
      await vi.waitFor(() => {
        expect(h.replies).toHaveLength(i + 1);
      });
      h.replies[i]?.(response(text));
    }
    await vi.waitFor(() => {
      expect(h.seen).toHaveLength(2);
    });
    await h.finish();
    expect(h.seen).toEqual([
      { type: "thinking", blockId: "approach", delta: first, seq: 0 },
      { type: "thinking", blockId: "approach", delta: second, seq: 1 },
      { ...end, seq: 2 },
    ]);
  });

  it.each([
    ["", "end_turn"],
    ["x".repeat(481), "end_turn"],
    ["word ".repeat(71), "end_turn"],
    ["I intend to", "max_tokens"],
  ])("rejects invalid summary output without raw fallback (%#)", async (text, stop) => {
    const h = harness();
    await h.think();
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(1);
    });
    h.replies[0]?.(response(text, stop));
    await h.think("r2b0");
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(2);
    });
    h.replies[1]?.(response(first));
    await vi.waitFor(() => {
      expect(h.seen.at(-1)).toMatchObject({ type: "thinking", delta: first });
    });
    await h.send({ type: "text", blockId: "answer", delta: "Answer.", seq: 3 });
    await h.finish();
    expect(h.seen).toEqual([
      { type: "thinking", blockId: "approach", delta: first, seq: 0 },
      { type: "text", blockId: "answer", delta: "Answer.", seq: 1 },
      { ...end, seq: 2 },
    ]);
  });

  it("reserves requests for later rounds instead of spending them on repeated deliberation", async () => {
    const h = harness();
    await h.think("r1b0", raw.repeat(10));
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(1);
    });
    h.replies[0]?.(response(first));
    await vi.waitFor(() => {
      expect(h.seen).toHaveLength(1);
    });
    await h.think("r1b0", raw.repeat(10));
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(2);
    });
    h.replies[1]?.(response(second));
    await vi.waitFor(() => {
      expect(h.seen).toHaveLength(2);
    });
    await h.think("r1b0", raw.repeat(10));
    await h.send({ type: "text", blockId: "answer", delta: "Still working.", seq: 42 });
    await vi.waitFor(() => {
      expect(h.seen).toHaveLength(3);
    });
    expect(h.requests).toHaveLength(2);
    await h.think("r2b0");
    await vi.waitFor(() => {
      expect(h.replies).toHaveLength(3);
    });
    await h.finish();
    h.replies[2]?.(response(second));
  });

  it("bounds total summary requests while keeping tool events", async () => {
    const h = harness();
    for (let i = 0; i < 16; i++) {
      await h.think(`r${Math.floor(i / 2) + 1}b0`, raw.repeat(10));
      await vi.waitFor(() => {
        expect(h.replies).toHaveLength(i + 1);
      });
      h.replies[i]?.(response(`${first} ${i}`));
      await vi.waitFor(() => {
        expect(h.seen).toHaveLength(i + 1);
      });
    }
    await h.think("r9b0");
    await h.finish();
    expect(h.requests).toHaveLength(16);
    expect(h.seen.at(-1)).toEqual({ ...end, seq: 16 });
  });
});
