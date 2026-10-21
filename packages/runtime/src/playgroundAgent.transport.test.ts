import type { AgentEvent } from "@yaklabs/catalog/agent";
import { applyChunk, startReply, type ReplyChunk } from "@yaklabs/catalog/reply";
import { describe, expect, it, vi } from "vitest";
import type { Transcript } from "./conversation";
import { createPlaygroundAgent } from "./playgroundAgent";
import { COPY } from "./playgroundCopy";
import { threadIdSchema } from "./workspace";

type Fetch = typeof fetch;
type Asking = { accessToken?: string; event?: AgentEvent };

const live = threadIdSchema.parse("live");
const ask: AgentEvent = { kind: "message", text: "Chart the week.", attachments: [] };
// The thread as the worker leaves it before the agent runs: the user's turn already saved.
const saved: Transcript = {
  draft: "",
  updatedAt: "2026-09-30T10:00:00.000Z",
  messages: [{ id: "u1", role: "user", text: "Chart the week.", time: "10:00" }],
};
const store = { transcript: () => saved };
const encoder = new TextEncoder();
const signedIn: Asking = { accessToken: "token" };

// A body that sends `lines` and then closes, or with `open`, stays open like a gateway still
// thinking, until the request is aborted.
function body(lines: string[], { open = false } = {}): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      if (!open) controller.close();
    },
  });
}

const ndjson = (...events: object[]): string[] => events.map((e) => `${JSON.stringify(e)}\n`);
const start = { type: "start", seq: 0, v: 4 };

// A gateway that answers every request with `status` and `lines`.
const answering = (status: number, lines: string[] = [], open = false) =>
  vi.fn<Fetch>(() => Promise.resolve(new Response(body(lines, { open }), { status })));

// The chunks of one reply to `event`, signed in unless `accessToken` is left out.
async function reply(fetch: Fetch, { accessToken, event = ask }: Asking = signedIn) {
  const base = { baseUrl: "http://g.test", store, threadId: live, fetch };
  const agent = createPlaygroundAgent(accessToken === undefined ? base : { ...base, accessToken });
  const chunks: ReplyChunk[] = [];
  for await (const chunk of agent.respond(event, new AbortController().signal)) chunks.push(chunk);
  return chunks;
}

const failureOf = (chunks: ReplyChunk[]) =>
  chunks.reduce((turn, chunk) => applyChunk(turn, chunk), startReply("r1", "10:00")).failure;

it("yields fragmented thinking deltas before the gateway finishes its reply", async () => {
  let send: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send = controller;
      controller.enqueue(encoder.encode(ndjson(start).join("")));
    },
  });
  const agent = createPlaygroundAgent({
    baseUrl: "http://g.test",
    store,
    threadId: live,
    accessToken: "token",
    fetch: () => Promise.resolve(new Response(stream)),
  });
  const chunks: ReplyChunk[] = [];
  const reading = (async () => {
    for await (const chunk of agent.respond(ask, new AbortController().signal)) chunks.push(chunk);
  })();
  const first = ndjson({ type: "thinking", seq: 1, blockId: "r1b0", delta: "Compare " }).join("");
  send?.enqueue(encoder.encode(first.slice(0, 23)));
  send?.enqueue(encoder.encode(first.slice(23)));
  await vi.waitFor(() => {
    expect(chunks).toEqual([{ kind: "thinking", text: "Compare " }]);
  });
  const second = { type: "thinking", seq: 2, blockId: "r1b0", delta: "Compare the days." };
  send?.enqueue(encoder.encode(ndjson(second).join("")));
  await vi.waitFor(() => {
    expect(chunks).toEqual([
      { kind: "thinking", text: "Compare " },
      { kind: "thinking", text: "Compare the days." },
    ]);
  });
  send?.enqueue(
    encoder.encode(
      ndjson(
        { type: "text", seq: 3, blockId: "r1b1", delta: "Tuesday leads." },
        { type: "end", seq: 4, reason: "answered" },
      ).join(""),
    ),
  );
  send?.close();
  await reading;
  const turn = chunks.reduce((t, chunk) => applyChunk(t, chunk), startReply("r1", "10:00"));
  expect(turn.thinking).toBe("Compare the days.");
  expect(turn.text).toBe("Tuesday leads.");
  expect(turn.failure).toBeUndefined();
});

describe("the live agent refuses before sending", () => {
  it("with no token: sign-in is needed, Try again cannot help, and nothing is sent", async () => {
    const fetch = answering(200);
    expect(await reply(fetch, {})).toEqual([{ kind: "failure", failure: COPY.signIn }]);
    expect(COPY.signIn.retry).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("with a message longer than the gateway reads", async () => {
    const fetch = answering(200);
    const long: AgentEvent = { ...ask, text: "x".repeat(4001) };
    expect(failureOf(await reply(fetch, { ...signedIn, event: long }))).toEqual(COPY.rejected);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("with nothing at all for a question the host rejected", async () => {
    const rejected: AgentEvent = { kind: "question-rejected", reason: "x", question: {} };
    expect(await reply(answering(200), { ...signedIn, event: rejected })).toEqual([]);
  });
});

describe("the live agent reads a refusal in plain words", () => {
  it.each([
    [401, COPY.expired],
    [400, COPY.rejected],
    [402, COPY.credit],
    [502, COPY.unavailable],
    [200, COPY.cutOff],
  ])("answered %i before any line", async (status, failure) => {
    expect(failureOf(await reply(answering(status)))).toEqual(failure);
  });

  it("sends the token and the projected request", async () => {
    const fetch = answering(502);
    await reply(fetch);
    const request = { exchanges: [{ user: { kind: "say", text: "Chart the week." } }] };
    const [url, init] = fetch.mock.calls[0];
    expect(url).toEqual(new URL("http://g.test/api/playground"));
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token");
    expect(init?.body).toBe(JSON.stringify(request));
  });

  it("when the gateway cannot be reached", async () => {
    const fetch = vi.fn<Fetch>(() => Promise.reject(new TypeError("fetch failed")));
    expect(failureOf(await reply(fetch))).toEqual(COPY.unavailable);
  });
});

describe("the live agent ends a broken stream cut off", () => {
  it("showing the words it held when the body closes before `end`", async () => {
    const text = { type: "text", seq: 1, blockId: "r1b0", delta: "Friday was **bus" };
    const chunks = await reply(answering(200, ndjson(start, text)));
    const turn = chunks.reduce((t, c) => applyChunk(t, c), startReply("r1", "10:00"));
    expect(turn).toMatchObject({ text: "Friday was bus", ended: "interrupted" });
    expect(turn.failure).toEqual(COPY.cutOff);
  });

  it("at a line that is no event, or one cut off mid-way", async () => {
    expect(failureOf(await reply(answering(200, [...ndjson(start), "{oops\n"])))).toEqual(
      COPY.cutOff,
    );
    expect(failureOf(await reply(answering(200, [...ndjson(start), '{"type":"te'])))).toEqual(
      COPY.cutOff,
    );
  });
});

describe("the live agent stops", () => {
  it("quietly when the reader stops the reply", async () => {
    let asked = false;
    // A gateway that sends `start`, then holds the line open until the request is aborted.
    const holding: Fetch = (_url, init) => {
      asked = true;
      const lines = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjson(start).join("")));
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("Aborted", "AbortError"));
          });
        },
      });
      return Promise.resolve(new Response(lines));
    };
    const agent = createPlaygroundAgent({
      baseUrl: "http://g.test",
      store,
      threadId: live,
      accessToken: "token",
      fetch: holding,
    });
    const stop = new AbortController();
    const chunks: ReplyChunk[] = [];
    const reading = (async () => {
      for await (const chunk of agent.respond(ask, stop.signal)) chunks.push(chunk);
    })();
    await vi.waitFor(() => {
      expect(asked).toBe(true);
    });
    stop.abort();
    await reading;
    expect(chunks).toEqual([]);
  });
});
