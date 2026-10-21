import { describe, expect, it } from "vitest";
import { BAR_CARD, QUESTION } from "./playgroundTestKit";
import {
  initialTurn,
  toolsFor,
  translateToolUse,
  type ToolCall,
  type Translation,
  type TurnState,
} from "./playgroundTools";

const call = (name: string, value: unknown, id = "t1_0"): ToolCall => ({
  id,
  name,
  input: { ok: true, value },
});

// Runs calls one after another, as a turn would, and returns every translation.
const run = (calls: readonly ToolCall[]): Translation[] => {
  const translations: Translation[] = [];
  for (const next of calls)
    translations.push(translateToolUse(translations.at(-1)?.state ?? initialTurn, next));
  return translations;
};

// A translation's tool_result as the model reads it; a question has none.
const reply = (translation: Translation | undefined) => {
  const result = translation?.result;
  if (result === undefined || result === "asked") return { isError: false, text: "" };
  const text = typeof result.content === "string" ? result.content : "";
  return { isError: result.is_error === true, text };
};

const oneValueTrend = {
  ...BAR_CARD,
  component: "LineChart",
  props: { ...BAR_CARD.props, variant: "trend", rows: [{ label: "Mon", value: 12 }] },
};

// A turn where `name` has failed `count` times.
const failed = (name: string, count: number): TurnState => ({
  ...initialTurn,
  failures: { [name]: count },
});

// The names of the tools a turn still offers.
const names = (state: TurnState): string[] => toolsFor(state).map((tool) => tool.name);

describe("translateToolUse rejects", () => {
  it("a tool's second invalid input in a turn and asks for prose", () => {
    const [first, second] = run([
      call("update_work", { workId: "Bad Id" }),
      call("update_work", {}),
    ]);

    expect(first?.events).toEqual([]);
    expect(reply(first).isError).toBe(true);
    expect(reply(first).text).not.toContain("prose");
    expect(reply(second).text).toMatch(/Answer in prose instead\.$/);
  });

  it("an unknown tool as an error naming the real ones", () => {
    const [only] = run([call("draw_chart", {})]);

    expect(reply(only).isError).toBe(true);
    expect(reply(only).text).toContain("show_card");
  });

  it("an unknown tool as an error naming only the tools still on offer", () => {
    const [, , third] = run([call("show_card", {}), call("show_card", {}), call("draw_chart", {})]);

    expect(reply(third).text).toContain("update_work");
    expect(reply(third).text).not.toContain("show_card");
  });

  it("an unknown tool with nothing left on offer as a prose ask", () => {
    const tools = ["update_work", "show_card", "ask_question", "report_outcome", "report_failure"];
    const retired = tools.flatMap((name) => [call(name, {}), call(name, {})]);
    const results = run([...retired, call("draw_chart", {})]);

    expect(reply(results.at(-1)).text).toBe("Unknown tool draw_chart. Answer in prose.");
  });

  it("a malformed question as an error the user never sees", () => {
    const [only] = run([call("ask_question", { question: { question: "What?" } })]);

    expect(only?.events).toEqual([]);
    expect(reply(only).isError).toBe(true);
  });
});

describe("translateToolUse limits", () => {
  it("a turn to six distinct cards, while an update by cardId still goes through", () => {
    const cards = ["a", "b", "c", "d", "e", "f", "g"].map((cardId) =>
      call("show_card", { cardId, card: BAR_CARD }),
    );
    const results = run([...cards, call("show_card", { cardId: "a", card: BAR_CARD })]);

    expect(results[6]?.events).toEqual([]);
    expect(reply(results[6])).toEqual({ isError: true, text: "card limit reached" });
    expect(results[7]?.events).toMatchObject([{ type: "card", cardId: "a" }]);
  });

  it("a turn to sixteen tool calls", () => {
    const results = run(
      Array.from({ length: 17 }, () => call("report_failure", { limitation: "No data." })),
    );

    expect(results[15]?.events).toHaveLength(1);
    expect(results[16]?.events).toEqual([]);
    expect(reply(results[16]).isError).toBe(true);
  });
});

describe("toolsFor offers", () => {
  it("every tool while nothing has failed twice", () => {
    expect(names(initialTurn)).toEqual([
      "update_work",
      "show_card",
      "ask_question",
      "report_outcome",
      "report_failure",
    ]);
    expect(names(failed("show_card", 1))).toHaveLength(5);
  });

  it("no longer a tool whose failures reached its limit, keeping the rest", () => {
    expect(names(failed("show_card", 2))).toEqual([
      "update_work",
      "ask_question",
      "report_outcome",
      "report_failure",
    ]);
  });

  it("every tool for a name the roster does not know", () => {
    expect(names(failed("draw_chart", 5))).toHaveLength(5);
  });
});

describe("translateToolUse retires", () => {
  it("a tool whose input failed twice, refusing a later call flat and counting nothing", () => {
    const [first, second, third] = run([
      call("show_card", { cardId: "Bad Id", card: BAR_CARD }),
      call("show_card", { cardId: "Also Bad", card: BAR_CARD }),
      call("show_card", { cardId: "week", card: BAR_CARD }),
    ]);

    expect(first?.state.failures["show_card"]).toBe(1);
    expect(reply(second).text).toMatch(/Answer in prose instead\.$/);
    // The third call is well-formed; the retired tool refuses it before the handler runs.
    expect(third?.events).toEqual([]);
    expect(reply(third)).toEqual({
      isError: true,
      text: "show_card is no longer available this turn.",
    });
    expect(third?.state.failures["show_card"]).toBe(2);
  });

  it("a retired question as a refusal, not a question that ends the turn", () => {
    const [, , third] = run([
      call("ask_question", { question: { question: "What?" } }),
      call("ask_question", { question: { question: "What?" } }),
      call("ask_question", { question: QUESTION }),
    ]);

    expect(third?.result).not.toBe("asked");
    expect(third?.events).toEqual([]);
    expect(reply(third).text).toBe("ask_question is no longer available this turn.");
  });

  it("keeps the turn's other tools after one retires", () => {
    const [, , third] = run([
      call("show_card", {}),
      call("show_card", {}),
      call("update_work", { workId: "sum", label: "Adding up", status: "running" }),
    ]);

    expect(third?.events).toMatchObject([{ type: "work", workId: "sum", status: "running" }]);
  });
});

describe("translateToolUse shows", () => {
  it("a one-value trend as a table with its reason", () => {
    const [only] = run([call("show_card", { cardId: "trend", card: oneValueTrend })]);

    expect(only?.events).toMatchObject([{ type: "card", selection: { component: "DataTable" } }]);
    expect(reply(only).text).toMatch(/^shown as a table: A trend needs at least two known/);
  });

  it("a failure with its recovery prompt and a fixed send label", () => {
    const [only] = run([
      call("report_failure", {
        limitation: "I cannot fetch data.",
        recovery_prompt: "Use these numbers.",
      }),
    ]);

    expect(only?.events).toEqual([
      {
        type: "failure",
        seq: 0,
        workId: null,
        limitation: "I cannot fetch data.",
        recovery: { label: "Send this", prompt: "Use these numbers." },
      },
    ]);
  });
});
