import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  overloaded,
  playgroundApp,
  postPlayground,
  readEvents,
  round,
  say,
  sentMessages,
  text,
  thinking,
  tool,
} from "./playgroundTestKit";

// Exactly what the gateway may send upstream: a stray field fails the parse.
const upstreamBodySchema = z.strictObject({
  model: z.string(),
  max_tokens: z.number(),
  thinking: z.strictObject({ type: z.literal("enabled"), budget_tokens: z.number() }),
  system: z.string(),
  tools: z.array(z.looseObject({ name: z.string() })),
  messages: z.array(z.unknown()),
  stream: z.boolean(),
});

const answer = round(
  "end_turn",
  thinking(0, "Hmm."),
  text(1, " "),
  text(2, "Tuesday", " was busiest."),
);

describe("POST /api/playground refuses", () => {
  it("a request with no Authorization header", async () => {
    const { app, requests } = playgroundApp(answer);

    const response = await postPlayground(app, say("Hi"), { authorization: null });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(requests).toHaveLength(0);
  });

  it("a body outside the request schema", async () => {
    const { app, requests } = playgroundApp(answer);

    const response = await postPlayground(app, { exchanges: [], model: "other" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid request" });
    expect(requests).toHaveLength(0);
  });

  it("a first round the upstream refuses, as a 502 with only its status", async () => {
    const { app } = playgroundApp(overloaded);

    const response = await postPlayground(app, say("Hi"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream", status: 529 });
  });
});

describe("POST /api/playground streams", () => {
  it("NDJSON events that each parse, with seq counting up from 0", async () => {
    const { app } = playgroundApp(
      round(
        "tool_use",
        text(0, " "),
        tool(1, "update_work", { workId: "sum", label: "Adding up", status: "running" }),
      ),
      answer,
    );

    const response = await postPlayground(app, say("Chart this."));
    const events = await readEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index));
    expect(events.at(0)).toEqual({ type: "start", seq: 0, v: 4 });
    expect(events.at(-1)).toEqual({ type: "end", seq: events.length - 1, reason: "answered" });
  });

  it("answer text without raw thinking or whitespace-only blocks", async () => {
    const { app } = playgroundApp(answer);

    const events = await readEvents(await postPlayground(app, say("Which day?")));

    expect(events.slice(1, -1)).toEqual([
      { type: "text", seq: 1, blockId: "r1b2", delta: "Tuesday" },
      { type: "text", seq: 2, blockId: "r1b2", delta: " was busiest." },
    ]);
  });
});

describe("POST /api/playground streams thinking", () => {
  it("never exposes short raw deltas or sends them back next round", async () => {
    const work = { workId: "sum", label: "Adding up", status: "running" };
    const { app, requests } = playgroundApp(
      round("tool_use", thinking(0, "They want ", "", "a total."), tool(1, "update_work", work)),
      round("end_turn", thinking(0, "Done."), text(1, "Twelve.")),
    );

    const events = await readEvents(await postPlayground(app, say("Add these up.")));

    expect(events.filter((event) => event.type === "thinking")).toEqual([]);
    const [, assistant] = await sentMessages(requests, 1);
    expect(assistant).toEqual({
      role: "assistant",
      content: [{ type: "tool_use", id: "t1_1", name: "update_work", input: work }],
    });
  });
});

describe("POST /api/playground sends upstream", () => {
  it("the gateway's prompt, tools and budgets", async () => {
    const { app, requests } = playgroundApp(answer);

    await readEvents(await postPlayground(app, say("Which day?")));

    const body = upstreamBodySchema.parse(await requests[0]?.clone().json());
    expect(body).toMatchObject({
      model: "moonshotai/kimi-k2.6",
      max_tokens: 8192,
      thinking: { type: "enabled", budget_tokens: 1024 },
      stream: true,
    });
    expect(body.system).toContain("you must call report_failure");
    expect(await sentMessages(requests, 0)).toEqual([
      { role: "user", content: [{ type: "text", text: "Which day?" }] },
    ]);
    expect(body.tools.map(({ name }) => name)).toEqual([
      "update_work",
      "show_card",
      "ask_question",
      "report_outcome",
      "report_failure",
    ]);
  });
});
