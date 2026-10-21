import { describe, expect, it } from "vitest";
import { awaitingSchema, resolveAwaiting, rowForKey, stagedRows } from "./awaiting";
import { threads } from "./thread";

// The thread's question, parsed once so each test can vary one field of a known-good card.
const valid = awaitingSchema.parse(threads.awaiting.awaiting); // → AwaitingInput

// The card's question when approved, or undefined when it would never be shown.
function card(payload: unknown) {
  const result = resolveAwaiting(payload);
  return result.kind === "approved" ? result.question : undefined;
}

it("accepts the forecast question", () => {
  expect(card(valid)?.options).toHaveLength(1);
});

it("never shows a card for a question with no branch to choose", () => {
  expect(card({ ...valid, options: [] })).toBeUndefined();
});

it("never shows a card for a question carrying anything extra, such as styling", () => {
  expect(card({ ...valid, color: "red" })).toBeUndefined();
});

it("lets the agent word the way out, and falls back when it doesn't", () => {
  const { elsewhere, ...rest } = valid;
  expect(card(valid)?.elsewhere).toBe(elsewhere);
  expect(card(rest)?.elsewhere).toBeUndefined();
});

describe("every row stays short enough for four to look considered", () => {
  it("accepts a question of two short sentences", () => {
    expect(
      card({ ...valid, question: "The forecast view is missing. Should I request it?" }),
    ).toBeDefined();
  });

  it("sends a third sentence back to the agent to ask in the thread instead", () => {
    const question = "The forecast view is missing. It was never built. Should I request it?";
    expect(resolveAwaiting({ ...valid, question }).kind).toBe("malformed");
  });

  it("sends two long sentences back too", () => {
    const question =
      "The forecast view you asked for is missing from the catalog this quarter and next. Should I request it for the whole team now?";
    expect(resolveAwaiting({ ...valid, question }).kind).toBe("malformed");
  });

  it("holds option details to the same two short sentences", () => {
    const options = [{ label: "Request it", detail: "One. Two. Three." }];
    expect(resolveAwaiting({ ...valid, options }).kind).toBe("malformed");
  });

  it("keeps an option label to one line", () => {
    const options = [{ label: "Request a forecast view for every team and every week" }];
    expect(resolveAwaiting({ ...valid, options }).kind).toBe("malformed");
  });

  it("keeps the typed-answer prompt inside its one-line field", () => {
    const answer = { placeholder: "How many weeks ahead should the forecast go?" };
    expect(resolveAwaiting({ ...valid, answer }).kind).toBe("malformed");
  });
});

it("names what broke in a malformed question, so the agent can ask another way", () => {
  const result = resolveAwaiting(threads.malformed.awaiting);
  expect(result.kind === "malformed" && result.reason).toMatch(/^answer\.placeholder: /);
});

describe("rowForKey", () => {
  it("steps down and up, wrapping at the ends", () => {
    expect(rowForKey("ArrowDown", undefined, 3)).toBe(0);
    expect(rowForKey("ArrowDown", 2, 3)).toBe(0);
    expect(rowForKey("ArrowUp", undefined, 3)).toBe(2);
    expect(rowForKey("ArrowUp", 0, 3)).toBe(2);
  });

  it("picks a row by its badge number and nothing for other keys", () => {
    expect(rowForKey("1", undefined, 3)).toBe(0);
    expect(rowForKey("3", 0, 3)).toBe(2);
    expect(rowForKey("4", 0, 3)).toBeUndefined();
    expect(rowForKey("0", 0, 3)).toBeUndefined();
    expect(rowForKey("Enter", 0, 3)).toBeUndefined();
    expect(rowForKey("a", 0, 3)).toBeUndefined();
  });
});

describe("stagedRows", () => {
  const labels = ["Hold them", "Pay what arrived"];

  it("shows the user's own choice when nothing is staged", () => {
    expect(stagedRows(labels, undefined, 1)).toEqual({ hovered: undefined, selected: 1 });
  });

  it("hovers a staged answer's tile, then selects it", () => {
    expect(stagedRows(labels, { text: "Hold them", phase: "hover" }, 1)).toEqual({
      hovered: 0,
      selected: 1,
    });
    expect(stagedRows(labels, { text: "Hold them", phase: "selected" }, 1)).toEqual({
      hovered: undefined,
      selected: 0,
    });
    expect(stagedRows(labels, { text: "Hold them", phase: "pressed" }, 1)).toEqual({
      hovered: undefined,
      selected: 0,
    });
  });

  it("leaves the user's choice alone for an answer no tile carries", () => {
    expect(stagedRows(labels, { text: "Something else", phase: "selected" }, 1)).toEqual({
      hovered: undefined,
      selected: 1,
    });
  });
});
