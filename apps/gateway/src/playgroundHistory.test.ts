import type { Anthropic } from "@anthropic-ai/sdk";
import type { PlaygroundRequest } from "@yaklabs/catalog/playground";
import { describe, expect, it } from "vitest";
import { toUpstreamMessages } from "./playgroundHistory";
import { BAR_CARD, QUESTION } from "./playgroundTestKit";

type Agent = NonNullable<PlaygroundRequest["exchanges"][number]["agent"]>;

const quiet: Agent = { text: "", cards: [], outcomes: [], failures: [] };
const charted: Agent = {
  text: "Friday was busiest.",
  cards: [{ cardId: "week", selection: BAR_CARD }],
  outcomes: [{ workId: "sum", result: "Totalled the week." }],
  failures: [{ limitation: "I cannot fetch last year's numbers." }],
};
const asking: Agent = { ...quiet, question: { questionId: "t1_1", question: QUESTION } };

const blocks = (message: Anthropic.MessageParam | undefined) =>
  message === undefined || typeof message.content === "string" ? [] : message.content;
const toolUseIds = (message: Anthropic.MessageParam | undefined) =>
  blocks(message).flatMap((block) => (block.type === "tool_use" ? [block.id] : []));
const toolResultIds = (message: Anthropic.MessageParam | undefined) =>
  blocks(message).flatMap((block) => (block.type === "tool_result" ? [block.tool_use_id] : []));

// Every tool_use is answered in the very next message, and roles alternate from the user.
const expectWellFormed = (messages: readonly Anthropic.MessageParam[]) => {
  const roles = messages.map((_, index) => (index % 2 === 0 ? "user" : "assistant"));
  expect(messages.map(({ role }) => role)).toEqual(roles);
  expect(messages.at(-1)?.role).toBe("user");
  const unanswered = messages.flatMap((message, index) =>
    toolUseIds(message).filter((id) => !toolResultIds(messages[index + 1]).includes(id)),
  );
  expect(unanswered).toEqual([]);
};

describe("toUpstreamMessages rebuilds", () => {
  it("a past agent turn as prose, tool calls and paired results", () => {
    const messages = toUpstreamMessages({
      exchanges: [
        { user: { kind: "say", text: "Chart it." }, agent: charted },
        { user: { kind: "say", text: "Thanks." } },
      ],
    });

    expectWellFormed(messages);
    expect(messages[1]?.content).toEqual([
      { type: "text", text: "Friday was busiest." },
      {
        type: "tool_use",
        id: "h0_0",
        name: "show_card",
        input: { cardId: "week", card: BAR_CARD },
      },
      {
        type: "tool_use",
        id: "h0_1",
        name: "report_outcome",
        input: { workId: "sum", result: "Totalled the week.", evidence: [] },
      },
      {
        type: "tool_use",
        id: "h0_2",
        name: "report_failure",
        input: { limitation: "I cannot fetch last year's numbers." },
      },
    ]);
    expect(messages[2]?.content).toEqual([
      { type: "tool_result", tool_use_id: "h0_0", content: "shown" },
      { type: "tool_result", tool_use_id: "h0_1", content: "ok" },
      { type: "tool_result", tool_use_id: "h0_2", content: "ok" },
      { type: "text", text: "Thanks." },
    ]);
  });
});

describe("toUpstreamMessages answers a question", () => {
  it("with the user's answer and no extra user text", () => {
    const messages = toUpstreamMessages({
      exchanges: [
        { user: { kind: "say", text: "Plan next week." }, agent: asking },
        { user: { kind: "answer", questionId: "t1_1", text: "Coverage" } },
      ],
    });

    expectWellFormed(messages);
    expect(messages[2]?.content).toEqual([
      { type: "tool_result", tool_use_id: "h0_0", content: "The user answered: Coverage" },
    ]);
  });

  it("as skipped when the user skips it or sends a new message", () => {
    const skipped = toUpstreamMessages({
      exchanges: [
        { user: { kind: "say", text: "Plan." }, agent: asking },
        { user: { kind: "skip", questionId: "t1_1" } },
      ],
    });
    const movedOn = toUpstreamMessages({
      exchanges: [
        { user: { kind: "say", text: "Plan." }, agent: asking },
        { user: { kind: "say", text: "Never mind." } },
      ],
    });

    expectWellFormed(skipped);
    expectWellFormed(movedOn);
    expect(blocks(skipped[2])).toMatchObject([{ content: "The user skipped this question." }]);
    expect(blocks(movedOn[2])).toMatchObject([
      { content: "The user skipped this question." },
      { type: "text", text: "Never mind." },
    ]);
  });
});

describe("toUpstreamMessages keeps", () => {
  it("roles alternating across an empty agent turn, with unique tool ids", () => {
    const messages = toUpstreamMessages({
      exchanges: [
        { user: { kind: "say", text: "Hello?" }, agent: quiet },
        { user: { kind: "say", text: "Anyone there?" }, agent: charted },
        { user: { kind: "say", text: "Again." }, agent: charted },
        { user: { kind: "say", text: "Go on." } },
      ],
    });

    expectWellFormed(messages);
    expect(messages[0]?.content).toEqual([
      { type: "text", text: "Hello?" },
      { type: "text", text: "Anyone there?" },
    ]);
    const ids = messages.flatMap((message) => toolUseIds(message));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
