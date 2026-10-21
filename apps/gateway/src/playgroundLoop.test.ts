import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BAR_CARD,
  QUESTION,
  credit,
  eventsFor,
  overloaded,
  playgroundApp,
  postPlayground,
  round,
  say,
  sentMessages,
  shape,
  text,
  tool,
  toolJson,
} from "./playgroundTestKit";

const work = (status: "running" | "done") => ({
  workId: "sum",
  label: "Adding up the week",
  status,
});
const done = round("end_turn", text(0, "Friday was busiest."));
const working = round("tool_use", tool(0, "update_work", work("running")));
// The closing events of a turn that stopped short: the reason and its line, in `end` alone.
const cutShort = { type: "end", reason: "limit", line: "I stopped before finishing this reply." };
const noResponse = { type: "end", reason: "upstream", line: "The model stopped responding." };
const creditOut = {
  type: "end",
  reason: "upstream",
  line: "The model's credit ran out before it could finish.",
};
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the tool loop shows", () => {
  it("a valid card and tells the model it was shown", async () => {
    const card = { cardId: "week", card: BAR_CARD };
    const first = round(
      "tool_use",
      text(0, " "),
      tool(1, "update_work", work("running")),
      tool(2, "show_card", card),
    );

    const { events, requests } = await eventsFor("Chart it.", first, done);

    expect(events).toEqual([
      { type: "work", ...work("running") },
      { type: "card", cardId: "week", selection: BAR_CARD },
      { type: "text", blockId: "r2b0", delta: "Friday was busiest." },
      { type: "end", reason: "answered" },
    ]);
    const [, assistant, results] = await sentMessages(requests, 1);
    expect(assistant).toEqual({
      role: "assistant",
      content: [
        { type: "tool_use", id: "t1_1", name: "update_work", input: work("running") },
        { type: "tool_use", id: "t1_2", name: "show_card", input: card },
      ],
    });
    expect(results).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1_1", content: "ok" },
        { type: "tool_result", tool_use_id: "t1_2", content: "shown" },
      ],
    });
  });
});

describe("the tool loop turns", () => {
  it("an invalid card into an error the model can retry", async () => {
    const bad = { cardId: "week", card: { ...BAR_CARD, component: "PieChart" } };
    const retry = round("tool_use", tool(0, "show_card", { cardId: "week", card: BAR_CARD }));

    const { events, requests } = await eventsFor(
      "Chart it.",
      round("tool_use", tool(0, "show_card", bad)),
      retry,
      done,
    );

    expect(events.map(({ type }) => type)).toEqual(["card", "text", "end"]);
    const [, , results] = await sentMessages(requests, 1);
    expect(JSON.stringify(results)).toMatch(/"tool_use_id":"t1_0","content":"card\.component: /);
    expect(results).toMatchObject({ content: [{ is_error: true }] });
  });

  it("broken tool JSON into an error beside an empty input", async () => {
    const broken = round("tool_use", toolJson(0, "update_work", '{"workId":'));

    const { requests } = await eventsFor("Chart it.", broken, done);

    const [, assistant, results] = await sentMessages(requests, 1);
    expect(assistant).toMatchObject({ content: [{ id: "t1_0", input: {} }] });
    expect(results).toMatchObject({
      content: [{ is_error: true, content: "The input was not valid JSON." }],
    });
  });
});

describe("the tool loop keeps text as prose", () => {
  it("when it streams before the round's first tool call, and never relabels it", async () => {
    const first = round(
      "tool_use",
      text(0, "Adding Monday to Friday."),
      tool(1, "update_work", work("running")),
      tool(2, "show_card", { cardId: "week", card: BAR_CARD }),
    );

    const { events } = await eventsFor("Chart it.", first, done);

    expect(events).toEqual([
      { type: "text", blockId: "r1b0", delta: "Adding Monday to Friday." },
      { type: "work", ...work("running") },
      { type: "card", cardId: "week", selection: BAR_CARD },
      { type: "text", blockId: "r2b0", delta: "Friday was busiest." },
      { type: "end", reason: "answered" },
    ]);
  });

  it("when it streams after a tool call in the same round", async () => {
    const first = round(
      "tool_use",
      text(0, "Checking"),
      tool(1, "update_work", work("running")),
      text(2, "Friday is busiest."),
    );

    const { events } = await eventsFor("Chart it.", first, round("end_turn"));

    expect(events).toEqual([
      { type: "text", blockId: "r1b0", delta: "Checking" },
      { type: "work", ...work("running") },
      { type: "text", blockId: "r1b2", delta: "Friday is busiest." },
      { type: "end", reason: "answered" },
    ]);
  });
});

describe("the tool loop keeps text as prose before a question", () => {
  it("and the question still ends the turn", async () => {
    const asks = round(
      "tool_use",
      text(0, "Sizing the plan."),
      tool(1, "update_work", work("running")),
      tool(2, "ask_question", { question: QUESTION }),
    );

    const { events } = await eventsFor("Plan next week.", asks);

    expect(events.map(({ type }) => type)).toEqual(["text", "work", "question", "end"]);
  });
});

describe("the tool loop ends", () => {
  it("at a question, without a tool_result or another round", async () => {
    const asks = round("tool_use", text(0, " "), tool(1, "ask_question", { question: QUESTION }));

    const { events, requests } = await eventsFor("Plan next week.", asks);

    expect(events).toEqual([
      { type: "question", questionId: "t1_1", question: QUESTION },
      { type: "end", reason: "asked" },
    ]);
    expect(requests).toHaveLength(1);
  });

  it("after eight rounds", async () => {
    const rounds = Array.from({ length: 9 }, () => working);

    const { events, requests } = await eventsFor("Keep going.", ...rounds);

    expect(requests).toHaveLength(8);
    expect(events.slice(-2)).toEqual([{ type: "work", ...work("running") }, cutShort]);
    expect(events.filter(({ type }) => type === "failure")).toEqual([]);
  });

  it("when a round runs out of tokens, with its line in the end event", async () => {
    const { events } = await eventsFor("Which day?", round("max_tokens", text(0, "Friday was")));

    expect(events).toEqual([{ type: "text", blockId: "r1b0", delta: "Friday was" }, cutShort]);
  });
});

describe("the tool loop reports", () => {
  it("an upstream that refuses a later round, with its line in the end event", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { events } = await eventsFor("Chart it.", working, overloaded);

    expect(events).toEqual([{ type: "work", ...work("running") }, noResponse]);
    expect(logged.mock.calls).toEqual([
      [{ event: "playground_round_failed", cause: "upstream", status: 529 }],
    ]);
  });

  it("credit running out before a later round, with its line in the end event", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { events } = await eventsFor("Chart it.", working, credit);

    expect(events).toEqual([{ type: "work", ...work("running") }, creditOut]);
    expect(logged.mock.calls).toEqual([
      [{ event: "playground_round_failed", cause: "upstream", status: 402 }],
    ]);
  });

  it("a round's stream that ends before it says why", async () => {
    const { events } = await eventsFor("Which day?", round(null, text(0, "Friday")));

    expect(events).toEqual([{ type: "text", blockId: "r1b0", delta: "Friday" }, noResponse]);
  });
});

describe("the tool loop cancels", () => {
  it("the upstream request when the browser goes away", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app, requests } = playgroundApp(working, done);
    const browser = new AbortController();

    const response = await postPlayground(app, say("Chart it."), { signal: browser.signal });
    browser.abort();
    const events = await shape(response);

    expect(requests[0]?.signal.aborted).toBe(true);
    expect(requests).toHaveLength(1);
    // The fake's round was already buffered; the loop stops before a second one or an `end`.
    expect(events).toEqual([{ type: "work", ...work("running") }]);
    expect(warned).not.toHaveBeenCalled();
  });
});
