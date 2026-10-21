import { afterEach, assert, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  QUESTION,
  overloaded,
  playgroundApp,
  postPlayground,
  rawRound,
  round,
  say,
  shape,
  text,
  tool,
} from "./playgroundTestKit";

type Respond = (init?: RequestInit) => Response | Promise<Response>;

const running = { workId: "sum", label: "Adding up the week", status: "running" };
const working = round("tool_use", tool(0, "update_work", running));
const answer = round("end_turn", text(0, "Friday."));

let now = 0;
let logged: MockInstance<typeof console.info>;

// Each upstream request takes `ms` of wall time before it answers.
const after =
  (ms: number, respond: Respond): Respond =>
  (init) => {
    now += ms;
    return respond(init);
  };

// An upstream request that answers only by failing once it is aborted; `opened` resolves
// when it is sent.
const hanging = () => {
  const opened = Promise.withResolvers<void>();
  let signal: AbortSignal | null | undefined;
  const respond = (init?: RequestInit): Promise<Response> => {
    signal = init?.signal;
    opened.resolve();
    return new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("", "AbortError"));
      });
    });
  };
  return { respond, opened: opened.promise, aborted: () => signal?.aborted };
};

// The reply's body, read one NDJSON line at a time.
const readerOf = (response: Response) => {
  assert(response.body !== null);
  return response.body.getReader();
};

const summary = (outcome: string, rounds: number, elapsedMs: number) => [
  { event: "playground_turn", outcome, rounds, elapsedMs },
];

beforeEach(() => {
  now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  logged = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a playground turn that ends logs one summary", () => {
  it("when it answers, with every round and the time to the answer", async () => {
    const { app } = playgroundApp(after(200, working), after(300, answer));

    const events = await shape(await postPlayground(app, say("Chart it.")));

    expect(events.at(-1)).toEqual({ type: "end", reason: "answered" });
    expect(logged.mock.calls).toEqual([summary("answered", 2, 500)]);
  });

  it("when it asks", async () => {
    const asks = round("tool_use", tool(0, "ask_question", { question: QUESTION }));
    const { app } = playgroundApp(after(40, asks));

    const events = await shape(await postPlayground(app, say("Plan next week.")));

    expect(events.at(-1)).toEqual({ type: "end", reason: "asked" });
    expect(logged.mock.calls).toEqual([summary("asked", 1, 40)]);
  });

  it("when it hits the token limit", async () => {
    const { app } = playgroundApp(after(40, round("max_tokens", text(0, "Mon"))));

    const events = await shape(await postPlayground(app, say("Which day?")));

    expect(events.at(-1)).toEqual({
      type: "end",
      reason: "limit",
      line: "I stopped before finishing this reply.",
    });
    expect(logged.mock.calls).toEqual([summary("limit", 1, 40)]);
  });
});

describe("a playground turn that stops short logs one summary", () => {
  it("when it answers with nothing to show", async () => {
    const { app } = playgroundApp(after(40, round("end_turn", text(0, " "))));

    const events = await shape(await postPlayground(app, say("Which day?")));

    expect(events).toEqual([
      { type: "end", reason: "upstream", line: "I finished without an answer." },
    ]);
    expect(logged.mock.calls).toEqual([summary("upstream", 1, 40)]);
  });

  it("when the upstream refuses the first round", async () => {
    const { app } = playgroundApp(after(40, overloaded));

    const response = await postPlayground(app, say("Hi"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream", status: 529 });
    expect(logged.mock.calls).toEqual([summary("upstream", 1, 40)]);
  });

  it("when the upstream refuses a later round", async () => {
    const { app } = playgroundApp(after(200, working), after(30, overloaded));

    const events = await shape(await postPlayground(app, say("Chart it.")));

    expect(events.at(-1)).toEqual({
      type: "end",
      reason: "upstream",
      line: "The model stopped responding.",
    });
    expect(logged.mock.calls).toEqual([summary("upstream", 2, 230)]);
  });

  it("when a round breaks mid-stream", async () => {
    const busy = rawRound(
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Busy"}}\n\n',
    );
    const { app } = playgroundApp(after(40, busy));

    const events = await shape(await postPlayground(app, say("Which day?")));

    expect(events).toEqual([
      { type: "end", reason: "upstream", line: "The model stopped responding." },
    ]);
    expect(logged.mock.calls).toEqual([summary("upstream", 1, 40)]);
  });
});

describe("a playground turn the browser leaves logs one cancelled summary", () => {
  it("while the first round opens", async () => {
    const first = hanging();
    const { app } = playgroundApp(after(40, first.respond));
    const browser = new AbortController();

    const responding = postPlayground(app, say("Hi"), { signal: browser.signal });
    await first.opened;
    now += 10;
    browser.abort();
    const response = await responding;

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream", status: null });
    expect(first.aborted()).toBe(true);
    expect(logged.mock.calls).toEqual([summary("cancelled", 1, 50)]);
  });

  it("while a later round opens", async () => {
    const second = hanging();
    const { app } = playgroundApp(after(200, working), after(30, second.respond));
    const browser = new AbortController();

    const response = await postPlayground(app, say("Chart it."), { signal: browser.signal });
    const events = shape(response);
    await second.opened;
    browser.abort();

    expect(await events).toEqual([{ type: "work", ...running }]);
    expect(second.aborted()).toBe(true);
    expect(logged.mock.calls).toEqual([summary("cancelled", 2, 230)]);
  });
});

describe("a playground turn whose stream is cancelled logs one summary", () => {
  it("as cancelled while a round opens", async () => {
    const second = hanging();
    const { app } = playgroundApp(after(200, working), after(30, second.respond));
    const response = await postPlayground(app, say("Chart it."));
    const reader = readerOf(response);

    await reader.read();
    await reader.read();
    await second.opened;
    await reader.cancel();

    expect(second.aborted()).toBe(true);
    expect(logged.mock.calls).toEqual([summary("cancelled", 2, 230)]);
  });

  it("as its outcome once the turn has ended", async () => {
    const { app } = playgroundApp(after(40, answer));
    const response = await postPlayground(app, say("Which day?"));
    const reader = readerOf(response);

    await reader.read();
    await reader.read();
    const end: unknown = (await reader.read()).value;
    assert(end instanceof Uint8Array);
    expect(new TextDecoder().decode(end)).toContain('"type":"end"');
    now += 1_000;
    await reader.cancel();

    expect(logged.mock.calls).toEqual([summary("answered", 1, 40)]);
  });
});
