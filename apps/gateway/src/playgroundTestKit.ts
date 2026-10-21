import type { Anthropic } from "@anthropic-ai/sdk";
import type { Selection } from "@yaklabs/catalog/catalog";
import { playgroundEventSchema, type PlaygroundEvent } from "@yaklabs/catalog/playground";
import { vi } from "vitest";
import { z } from "zod";
import { createApp } from "./app";
import type { TokenVerifier } from "./auth";
import { memoryShares, randomToken } from "./shares";
import { openRouterClient } from "./upstream";

// A scripted OpenRouter for the playground tests: each upstream request gets the next round.

type StreamEvent = Anthropic.RawMessageStreamEvent;
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// The one token the test verifier accepts.
const TOKEN = "workos-access-token";

/** A valid catalog card. */
export const BAR_CARD: Selection = {
  catalogVersion: "1",
  component: "BarChart",
  props: {
    title: "Cases by day",
    source: "Numbers you gave me",
    unit: "cases",
    variant: "comparison",
    rows: [
      { label: "Mon", value: 12 },
      { label: "Tue", value: 18 },
    ],
  },
};

/** A question that passes `awaitingSchema`. */
export const QUESTION = {
  question: "What matters most next week?",
  options: [{ label: "Cost" }, { label: "Coverage" }],
  answer: { placeholder: "Something else" },
};

const verifyToken: TokenVerifier = (token) =>
  token === TOKEN
    ? Promise.resolve({ userId: "user_01TEST", sessionId: "session_01TEST" })
    : Promise.reject(new Error("unknown token"));

const messageStart: StreamEvent = {
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
};

const messageEnd = (stopReason: Anthropic.StopReason): StreamEvent[] => [
  {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null, stop_details: null, container: null },
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
];

/** A text block streamed in `chunks`. */
export const text = (index: number, ...chunks: string[]): StreamEvent[] => [
  {
    type: "content_block_start",
    index,
    content_block: { type: "text", text: "", citations: null },
  },
  ...chunks.map((chunk): StreamEvent => ({
    type: "content_block_delta",
    index,
    delta: { type: "text_delta", text: chunk },
  })),
  { type: "content_block_stop", index },
];

/** A thinking block streamed in `chunks`, which the gateway shows but never sends back. */
export const thinking = (index: number, ...chunks: string[]): StreamEvent[] => [
  {
    type: "content_block_start",
    index,
    content_block: { type: "thinking", thinking: "", signature: "" },
  },
  ...chunks.map((chunk): StreamEvent => ({
    type: "content_block_delta",
    index,
    delta: { type: "thinking_delta", thinking: chunk },
  })),
  { type: "content_block_stop", index },
];

/** A tool call whose input JSON arrives in two fragments, as Kimi streams it. */
export const toolJson = (index: number, name: string, json: string): StreamEvent[] => {
  const half = Math.floor(json.length / 2);
  return [
    {
      type: "content_block_start",
      index,
      content_block: {
        type: "tool_use",
        id: `functions.${name}:${index}`,
        name,
        input: {},
        caller: { type: "direct" },
      },
    },
    ...[json.slice(0, half), json.slice(half)].map((partial): StreamEvent => ({
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: partial },
    })),
    { type: "content_block_stop", index },
  ];
};

/** A tool call with `input`. */
export const tool = (index: number, name: string, input: unknown): StreamEvent[] =>
  toolJson(index, name, JSON.stringify(input));

/** One round as the Messages API streams it: server-sent events ending with `stopReason`. */
export const round =
  (stopReason: Anthropic.StopReason | null, ...blocks: StreamEvent[][]) =>
  (): Response => {
    const events = [
      messageStart,
      ...blocks.flat(),
      ...(stopReason === null ? [] : messageEnd(stopReason)),
    ];
    const body = events
      .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      .join("");
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  };

/** The upstream refusing a request. */
export const overloaded = (): Response =>
  Response.json(
    { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
    { status: 529 },
  );

/** The upstream refusing because its credit ran out. */
export const credit = (): Response =>
  Response.json(
    { type: "error", error: { type: "payment_required", message: "Insufficient credits" } },
    { status: 402 },
  );

/**
 * An app whose OpenRouter client answers each upstream request with the next scripted round,
 * recording the requests. A request past the script fails the test's upstream.
 */
export const playgroundApp = (
  ...rounds: ((init?: RequestInit) => Response | Promise<Response>)[]
) => {
  const requests: Request[] = [];
  const fetch = vi.fn<Fetch>((input, init) => {
    requests.push(new Request(input, init));
    const respond = rounds[requests.length - 1] ?? overloaded;
    return Promise.resolve(respond(init));
  });
  const upstream = openRouterClient("sk-or-test-key", { fetch, maxRetries: 0 });
  const shares = { store: memoryShares(Date.now), now: () => new Date(), newToken: randomToken };
  return { app: createApp({ verifyToken, upstream, shares }), requests };
};

/** A request body with one exchange: the user saying `said`. */
export const say = (said: string) => ({ exchanges: [{ user: { kind: "say", text: said } }] });

/** Posts to /api/playground as the page would; `authorization: null` sends no header. */
export const postPlayground = (
  app: ReturnType<typeof createApp>,
  body: unknown,
  init: { authorization?: string | null; signal?: AbortSignal } = {},
): Promise<Response> => {
  const authorization = init.authorization === undefined ? `Bearer ${TOKEN}` : init.authorization;
  return Promise.resolve(
    app.request("/api/playground", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization === null ? {} : { Authorization: authorization }),
      },
      body: JSON.stringify(body),
      ...(init.signal === undefined ? {} : { signal: init.signal }),
    }),
  );
};

/** Every line of the reply, each parsed with the page's own schema (a bad line throws). */
export const readEvents = async (response: Response): Promise<PlaygroundEvent[]> => {
  const body = await response.text();
  return body
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => playgroundEventSchema.parse(JSON.parse(line)));
};

const upstreamBodySchema = z.object({ messages: z.array(z.unknown()) });

/** The messages the gateway sent upstream in request `n`. */
export const sentMessages = async (requests: readonly Request[], n: number): Promise<unknown[]> =>
  upstreamBodySchema.parse(await requests[n]?.clone().json()).messages;

const upstreamToolsSchema = z.object({ tools: z.array(z.object({ name: z.string() })) });

/** The names of the tools the gateway offered upstream in request `n`. */
export const sentTools = async (requests: readonly Request[], n: number): Promise<string[]> =>
  upstreamToolsSchema.parse(await requests[n]?.clone().json()).tools.map(({ name }) => name);

/** The events after `start`, without their seq, for readable expectations. */
export const shape = async (response: Response): Promise<Record<string, unknown>[]> =>
  (await readEvents(response))
    .slice(1)
    .map((event): Record<string, unknown> =>
      Object.fromEntries(Object.entries(event).filter(([key]) => key !== "seq")),
    );

/** The streamed events of one request, saying `said`, to an app scripted with `rounds`. */
export const eventsFor = async (said: string, ...rounds: (() => Response)[]) => {
  const { app, requests } = playgroundApp(...rounds);
  const events = await shape(await postPlayground(app, say(said)));
  return { events, requests };
};

/** A round whose server-sent events are exactly `body`, well-formed or not. */
export const rawRound = (body: string) => (): Response =>
  new Response(body, { headers: { "Content-Type": "text/event-stream" } });
