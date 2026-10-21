import { expect, it } from "vitest";
import {
  BAR_CARD,
  QUESTION,
  eventsFor,
  round,
  sentMessages,
  sentTools,
  text,
  tool,
} from "./playgroundTestKit";

const bad = { cardId: "week", card: { ...BAR_CARD, component: "PieChart" } };
const work = (status: "running" | "done") => ({
  workId: "sum",
  label: "Adding up the week",
  status,
});
const done = round("end_turn", text(0, "Here it is in words."));
const cutShort = { type: "end", reason: "limit", line: "I stopped before finishing this reply." };

it("retires a tool after two failures while other tools remain usable", async () => {
  const { events, requests } = await eventsFor(
    "Chart it.",
    round("tool_use", tool(0, "show_card", bad)),
    round("tool_use", tool(0, "show_card", bad)),
    round("tool_use", tool(0, "update_work", work("done"))),
    done,
  );

  expect(events).toEqual([
    { type: "work", ...work("done") },
    { type: "text", blockId: "r4b0", delta: "Here it is in words." },
    { type: "end", reason: "answered" },
  ]);
  expect(await sentTools(requests, 1)).toContain("show_card");
  expect(await sentTools(requests, 2)).toEqual([
    "update_work",
    "ask_question",
    "report_outcome",
    "report_failure",
  ]);
});

it("refuses a valid retired-tool call and opens only one prose-only recovery round", async () => {
  const { events, requests } = await eventsFor(
    "Chart it.",
    round("tool_use", tool(0, "show_card", bad)),
    round("tool_use", tool(0, "show_card", bad)),
    round("tool_use", tool(0, "show_card", { cardId: "week", card: BAR_CARD })),
    done,
  );

  expect(requests).toHaveLength(4);
  expect((await sentMessages(requests, 3)).at(-1)).toEqual({
    role: "user",
    content: [
      {
        type: "tool_result",
        content: "show_card is no longer available this turn.",
        is_error: true,
        tool_use_id: "t3_0",
      },
    ],
  });
  expect(await requests[3]?.clone().json()).toMatchObject({
    tools: [],
    tool_choice: { type: "none" },
  });
  expect(events).toEqual([
    { type: "text", blockId: "r4b0", delta: "Here it is in words." },
    { type: "end", reason: "answered" },
  ]);
});

it("applies retirement within a round while other tools remain usable", async () => {
  const { events, requests } = await eventsFor(
    "Chart it.",
    round("tool_use", tool(0, "show_card", bad)),
    round(
      "tool_use",
      tool(0, "show_card", bad),
      tool(1, "update_work", work("done")),
      tool(2, "show_card", { cardId: "week", card: BAR_CARD }),
      tool(3, "ask_question", { question: QUESTION }),
    ),
    done,
  );

  expect(events).toEqual([
    { type: "work", ...work("done") },
    { type: "text", blockId: "r3b0", delta: "Here it is in words." },
    { type: "end", reason: "answered" },
  ]);
  expect(requests).toHaveLength(3);
  const recoveryRequest: unknown = await requests[2]?.clone().json();
  expect(await sentTools(requests, 2)).toEqual([]);
  expect(recoveryRequest).toHaveProperty("tool_choice.type", "none");
  expect(recoveryRequest).toHaveProperty(
    "system",
    expect.stringContaining("Tools are disabled for this final reply."),
  );
  expect(recoveryRequest).toHaveProperty("system", expect.not.stringContaining("call update_work"));
  expect((await sentMessages(requests, 2)).slice(-2)).toMatchObject([
    {
      role: "assistant",
      content: [
        { type: "tool_use", id: "t2_0", name: "show_card" },
        { type: "tool_use", id: "t2_1", name: "update_work" },
        { type: "tool_use", id: "t2_2", name: "show_card" },
        { type: "tool_use", id: "t2_3", name: "ask_question" },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t2_0", is_error: true },
        { type: "tool_result", tool_use_id: "t2_1", content: "ok" },
        { type: "tool_result", tool_use_id: "t2_2", is_error: true },
        { type: "tool_result", tool_use_id: "t2_3", is_error: true },
      ],
    },
  ]);
});

it.each([
  ["ask_question", { question: QUESTION }],
  ["show_card", { cardId: "week", card: BAR_CARD }],
  ["update_work", work("done")],
])(
  "terminates on recovery %s without executing it or opening another round",
  async (name, input) => {
    const { events, requests } = await eventsFor(
      "Chart it.",
      round("tool_use", tool(0, "show_card", bad), tool(1, "show_card", bad)),
      round("tool_use", tool(0, "show_card", { cardId: "week", card: BAR_CARD })),
      round(
        "tool_use",
        text(0, "The earlier result still stands."),
        tool(1, name, input),
        text(2, "This must not reach the page."),
      ),
      done,
    );

    expect(events).toEqual([
      { type: "text", blockId: "r3b0", delta: "The earlier result still stands." },
      cutShort,
    ]);
    expect(requests).toHaveLength(3);
    expect(requests[2]?.signal.aborted).toBe(true);
    expect(await requests[2]?.clone().json()).toMatchObject({
      tools: [],
      tool_choice: { type: "none" },
    });
  },
);

it.each([
  {
    triggerRound: 7,
    eighthTools: [],
    closing: [
      { type: "text", blockId: "r8b0", delta: "Here it is in words." },
      { type: "end", reason: "answered" },
    ],
  },
  {
    triggerRound: 8,
    eighthTools: ["update_work", "show_card", "ask_question", "report_outcome", "report_failure"],
    closing: [cutShort],
  },
])("bounds recovery triggered in round $triggerRound to eight requests", async (testCase) => {
  const preceding = Array.from({ length: testCase.triggerRound - 1 }, () =>
    round("tool_use", tool(0, "update_work", work("running"))),
  );
  const { events, requests } = await eventsFor(
    "Chart it.",
    ...preceding,
    round(
      "tool_use",
      tool(0, "show_card", bad),
      tool(1, "show_card", bad),
      tool(2, "show_card", { cardId: "week", card: BAR_CARD }),
    ),
    done,
  );

  expect(requests).toHaveLength(8);
  expect(await sentTools(requests, 7)).toEqual(testCase.eighthTools);
  expect(events).toEqual([
    ...Array.from({ length: testCase.triggerRound - 1 }, () => ({
      type: "work",
      ...work("running"),
    })),
    ...testCase.closing,
  ]);
});

it("offers one prose-only round when every tool has retired", async () => {
  const invalid = [
    "update_work",
    "show_card",
    "ask_question",
    "report_outcome",
    "report_failure",
  ].flatMap((name, index) => [tool(index * 2, name, {}), tool(index * 2 + 1, name, {})]);

  const { events, requests } = await eventsFor("Chart it.", round("tool_use", ...invalid), done);

  expect(events).toEqual([
    { type: "text", blockId: "r2b0", delta: "Here it is in words." },
    { type: "end", reason: "answered" },
  ]);
  expect(requests).toHaveLength(2);
  expect(await requests[1]?.clone().json()).toMatchObject({
    tools: [],
    tool_choice: { type: "none" },
  });
});

it("offers one prose-only round after the tool-call budget is exceeded", async () => {
  const calls = Array.from({ length: 17 }, (_, index) =>
    tool(index, "update_work", work("running")),
  );

  const { events, requests } = await eventsFor("Keep going.", round("tool_use", ...calls), done);

  expect(events).toEqual([
    ...Array.from({ length: 16 }, () => ({ type: "work", ...work("running") })),
    { type: "text", blockId: "r2b0", delta: "Here it is in words." },
    { type: "end", reason: "answered" },
  ]);
  expect(requests).toHaveLength(2);
  expect(await requests[1]?.clone().json()).toMatchObject({
    tools: [],
    tool_choice: { type: "none" },
  });
});
