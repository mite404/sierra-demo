import type { Anthropic } from "@anthropic-ai/sdk";
import { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp } from "./app";
import type { TokenVerifier } from "./auth";
import { memoryShares, randomToken } from "./shares";
import { openRouterClient } from "./upstream";

const TOKEN = "workos-access-token";
const API_KEY = "sk-or-test-key";
const SYSTEM = "You are Kay, a calm assistant.";
const turns = [{ role: "user", content: "Say hello." }];

// A verifier that knows one token and throws for every other, as `workOsVerifier` does.
const verifyToken: TokenVerifier = (token) =>
  token === TOKEN
    ? Promise.resolve({ userId: "user_01TEST", sessionId: "session_01TEST" })
    : Promise.reject(new Error("unknown token"));

// A short text reply, event by event, in the shapes the SDK types for the Messages stream.
const helloWorld = [
  {
    type: "message_start",
    message: {
      id: "msg_01TEST",
      type: "message",
      role: "assistant",
      model: "moonshotai/kimi-k2.6",
      content: [],
      container: null,
      stop_details: null,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 12,
        output_tokens: 1,
        cache_creation: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        inference_geo: null,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: "standard",
      },
    },
  },
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "", citations: null },
  },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
  { type: "content_block_stop", index: 0 },
  {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null, stop_details: null, container: null },
    usage: {
      input_tokens: null,
      output_tokens: 3,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      output_tokens_details: null,
      server_tool_use: null,
    },
  },
  { type: "message_stop" },
] satisfies Anthropic.RawMessageStreamEvent[];

// The body the Messages API streams: one server-sent event per stream event.
const sseBody = helloWorld
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join("");

// Exactly what the gateway may send upstream: a stray field fails the parse.
const upstreamBodySchema = z.strictObject({
  model: z.string(),
  max_tokens: z.number(),
  thinking: z.strictObject({ type: z.literal("enabled"), budget_tokens: z.number() }),
  system: z.string().optional(),
  messages: z.array(z.unknown()),
  stream: z.boolean(),
});

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// An app whose OpenRouter client reaches a fake upstream through `fetch`, recording each request.
const appWithUpstream = (respond: () => Response) => {
  const requests: Request[] = [];
  const fetch = vi.fn<Fetch>((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(respond());
  });
  // No retries, so a refused request reaches the gateway at once.
  const upstream = openRouterClient(API_KEY, { fetch, maxRetries: 0 });
  const shares = { store: memoryShares(Date.now), now: () => new Date(), newToken: randomToken };
  return { app: createApp({ verifyToken, upstream, shares }), requests };
};

const streamingUpstream = (): Response =>
  new Response(sseBody, { headers: { "Content-Type": "text/event-stream" } });

const overloadedUpstream = (): Response =>
  Response.json(
    { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
    { status: 529 },
  );

const creditUpstream = (): Response =>
  Response.json(
    { type: "error", error: { type: "payment_required", message: "Insufficient credits" } },
    { status: 402 },
  );

// Posts a turn as the browser would; `authorization: null` sends no Authorization header.
const postMessages = (
  app: ReturnType<typeof createApp>,
  body: unknown,
  authorization: string | null = `Bearer ${TOKEN}`,
): Promise<Response> =>
  Promise.resolve(
    app.request("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization === null ? {} : { Authorization: authorization }),
      },
      body: JSON.stringify(body),
    }),
  );

describe("GET /api/health", () => {
  it("answers without a token", async () => {
    const { app } = appWithUpstream(streamingUpstream);

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("POST /api/messages refuses", () => {
  it("a request with no Authorization header", async () => {
    const { app, requests } = appWithUpstream(streamingUpstream);

    const response = await postMessages(app, { system: SYSTEM, messages: turns }, null);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(requests).toHaveLength(0);
  });

  it("a token the verifier throws on", async () => {
    const { app, requests } = appWithUpstream(streamingUpstream);

    const response = await postMessages(
      app,
      { system: SYSTEM, messages: turns },
      "Bearer forged-token",
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(requests).toHaveLength(0);
  });

  it("a body with no messages", async () => {
    const { app, requests } = appWithUpstream(streamingUpstream);

    const response = await postMessages(app, { system: SYSTEM });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid request" });
    expect(requests).toHaveLength(0);
  });
});

describe("POST /api/messages streams", () => {
  it("the model's reply as the SDK's own events", async () => {
    const { app } = appWithUpstream(streamingUpstream);

    const response = await postMessages(app, { system: SYSTEM, messages: turns });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    assert(response.body !== null, "the reply has a body");
    const reply = MessageStream.fromReadableStream(response.body);
    expect(await reply.finalText()).toBe("Hello world");
  });
});

describe("POST /api/messages sends upstream", () => {
  it("the gateway's model, settings and key, whatever the client asks for", async () => {
    const { app, requests } = appWithUpstream(streamingUpstream);

    const response = await postMessages(app, {
      system: SYSTEM,
      messages: turns,
      model: "claude-haiku-4-5",
      max_tokens: 64_000,
    });
    await response.body?.cancel();

    expect(requests).toHaveLength(1);
    const [upstream] = requests;
    assert(upstream !== undefined, "one upstream request");
    expect(upstream.url).toBe("https://openrouter.ai/api/v1/messages");
    expect(upstream.headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
    expect(upstream.headers.get("x-api-key")).toBeNull();
    const body = upstreamBodySchema.parse(await upstream.json());
    expect(body).toEqual({
      model: "moonshotai/kimi-k2.6",
      max_tokens: 8192,
      thinking: { type: "enabled", budget_tokens: 1024 },
      system: SYSTEM,
      messages: turns,
      stream: true,
    });
  });

  it("no system prompt when the client's is empty", async () => {
    const { app, requests } = appWithUpstream(streamingUpstream);

    const response = await postMessages(app, { system: "", messages: turns });
    await response.body?.cancel();

    const body = upstreamBodySchema.parse(await requests[0]?.json());
    expect(body.system).toBeUndefined();
  });
});

describe("POST /api/messages reports", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("an upstream failure as a 502 with only its status", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = appWithUpstream(overloadedUpstream);

    const response = await postMessages(app, { system: SYSTEM, messages: turns });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream", status: 529 });
    expect(logged.mock.calls).toEqual([[{ event: "upstream_failure", status: 529 }]]);
  });

  it("an out-of-credit refusal as a 402 with only its marker", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = appWithUpstream(creditUpstream);

    const response = await postMessages(app, { system: SYSTEM, messages: turns });

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "credit" });
    expect(logged.mock.calls).toEqual([[{ event: "upstream_failure", status: 402 }]]);
  });

  it("a malformed body as Hono's own 400, without logging it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = appWithUpstream(streamingUpstream);

    const response = await app.request("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: "{not json",
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Malformed JSON in request body");
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("an unexpected gateway error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers a bare 500 and logs only its marker", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const leaky = `KV refused key ${API_KEY} for ${TOKEN}`;
    const refuse = () => Promise.reject(new Error(leaky));
    const store = { put: refuse, get: refuse, delete: refuse };
    const shares = { store, now: () => new Date(), newToken: randomToken };
    const upstream = openRouterClient(API_KEY, { maxRetries: 0 });
    const app = createApp({ verifyToken, upstream, shares });

    const response = await app.request(`/api/shares/${randomToken()}?q=${TOKEN}`);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Internal Server Error");
    expect(logged.mock.calls).toEqual([[{ event: "gateway_error" }]]);
  });
});
