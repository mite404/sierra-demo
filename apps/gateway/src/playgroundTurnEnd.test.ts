import { afterEach, describe, expect, it, vi } from "vitest";
import {
  eventsFor,
  playgroundApp,
  postPlayground,
  rawRound,
  round,
  say,
  shape,
  text,
  thinking,
  tool,
} from "./playgroundTestKit";

const running = { workId: "sum", label: "Adding up the week", status: "running" };
// A turn that stops short ends with its reason and line in one event.
const noResponse = { type: "end", reason: "upstream", line: "The model stopped responding." };
const emptyAnswer = { type: "end", reason: "upstream", line: "I finished without an answer." };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a turn never ends silently", () => {
  it("when the reply answers with nothing to show", async () => {
    const { events } = await eventsFor("Which day?", round("end_turn", text(0, " ")));

    expect(events).toEqual([emptyAnswer]);
  });

  it("when the reply only thought", async () => {
    const { events } = await eventsFor("Which day?", round("end_turn", thinking(0, "Hmm.")));

    expect(events.map(({ type }) => type)).toEqual(["end"]);
    expect(events.at(-1)).toEqual(emptyAnswer);
  });

  it("and adds nothing to a reply that answered", async () => {
    const { events } = await eventsFor("Which day?", round("end_turn", text(0, "Friday.")));

    expect(events.map(({ type }) => type)).toEqual(["text", "end"]);
  });

  it("and counts text written before a tool call as the answer", async () => {
    const first = round(
      "tool_use",
      text(0, "Adding Monday to Friday."),
      tool(1, "update_work", running),
    );

    const { events } = await eventsFor("Chart it.", first, round("end_turn"));

    expect(events.map(({ type }) => type)).toEqual(["text", "work", "end"]);
    expect(events.at(-1)).toEqual({ type: "end", reason: "answered" });
  });
});

describe("a round that breaks", () => {
  it("for a reason other than the upstream is logged as a marker, and still ends the turn", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const garbled = rawRound("event: message_start\ndata: {not json sk-or-test-key\n\n");

    const { events } = await eventsFor("Which day?", garbled);

    expect(events).toEqual([noResponse]);
    expect(logged.mock.calls).toEqual([
      [{ event: "playground_round_failed", cause: "internal", status: null }],
    ]);
  });

  it("because the upstream sent an error is logged without its message", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
    const busy = rawRound(
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Busy"}}\n\n',
    );

    const { events } = await eventsFor("Which day?", busy);

    expect(events).toEqual([noResponse]);
    expect(logged.mock.calls).toEqual([
      [{ event: "playground_round_failed", cause: "upstream", status: null }],
    ]);
  });
});

describe("a round the browser leaves", () => {
  it("while it opens is not logged as a failure", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
    const opening = Promise.withResolvers<void>();
    // The second round answers only by failing once its request is aborted.
    const hanging = (init?: RequestInit): Promise<Response> => {
      opening.resolve();
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("", "AbortError"));
        });
      });
    };
    const { app, requests } = playgroundApp(
      round("tool_use", tool(0, "update_work", running)),
      hanging,
    );
    const browser = new AbortController();

    const response = await postPlayground(app, say("Chart it."), { signal: browser.signal });
    const events = shape(response);
    await opening.promise;
    browser.abort();

    expect(await events).toEqual([{ type: "work", ...running }]);
    expect(requests).toHaveLength(2);
    expect(logged).not.toHaveBeenCalled();
  });
});
