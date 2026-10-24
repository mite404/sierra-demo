import type { Agent, AgentEvent } from "@yaklabs/catalog/agent";
import { applyChunk, startReply, type ReplyChunk } from "@yaklabs/catalog/reply";
import { afterEach, describe, expect, it, vi } from "vitest";
import { builderMessages, createBuilderAgent, type BuilderNotice } from "./builder-agent";

const id = "ab653bf4-cd58-4212-a497-fc1992d4d17e";
const question = {
  question: "How should refunds work?",
  options: [{ label: "Warm and confirm first" }, { label: "Brief and immediate" }],
  answer: { placeholder: "Describe your preferences" },
};
const message: AgentEvent = { kind: "message", text: "Help with refunds", attachments: [] };
const end = { kind: "workflow-end", plan: null, error: null };
const encode = (event: unknown) => new TextEncoder().encode(`${JSON.stringify(event)}\n`);
const response = (events: unknown[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          const bytes = encode(event);
          // Split UTF-8 and JSON framing independently of model text deltas.
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        }
        controller.close();
      },
    }),
  );
const collect = async (
  agent: Agent,
  event: AgentEvent = message,
  signal = new AbortController().signal,
) => {
  const chunks: ReplyChunk[] = [];
  for await (const chunk of agent.respond(event, signal)) chunks.push(chunk);
  return chunks;
};
const fold = (chunks: ReplyChunk[]) => chunks.reduce(applyChunk, startReply("reply", "now"));
const bodyOf = (init: RequestInit | undefined): unknown => {
  if (typeof init?.body !== "string") throw new Error("Missing request body");
  return JSON.parse(init.body);
};
const setup = () => {
  const notices: BuilderNotice[] = [];
  const agent = createBuilderAgent({
    endpoint: "/api/workflow",
    initial: {},
    observe: (notice) => notices.push(notice),
  });
  return { agent, notices };
};
afterEach(() => vi.unstubAllGlobals());

describe("human builder adapter", () => {
  it("formats split human prose identically on stream and reload, retaining the question", async () => {
    const { agent } = setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([
            { kind: "session", id },
            ...[
              "## Your ",
              "workflow\n\nUse **wa",
              "rm** café replies.\n\n- Verify ownership\n- Refund once",
            ].map((text) => ({ kind: "text", text })),
            { kind: "question", question },
            end,
          ]),
        ),
    );
    const streamed = fold(await collect(agent));
    const expected = [
      { kind: "heading", content: [{ kind: "run", text: "Your workflow" }] },
      {
        kind: "paragraph",
        content: [
          { kind: "run", text: "Use " },
          { kind: "run", text: "warm", mark: "strong" },
          { kind: "run", text: " café replies." },
        ],
      },
      {
        kind: "list",
        items: [
          [{ kind: "run", text: "Verify ownership" }],
          [{ kind: "run", text: "Refund once" }],
        ],
      },
    ];
    expect(streamed.blocks).toEqual(expected);
    expect(streamed.asks).toEqual(question);
    const restored = builderMessages([
      {
        id: "reply",
        role: "agent",
        time: "now",
        asks: question,
        text: "## Your workflow\n\nUse **warm** café replies.\n\n- Verify ownership\n- Refund once",
      },
    ]);
    expect(restored[0]).toMatchObject({ blocks: expected, asks: question });
    expect(
      builderMessages([{ id: "user", role: "user", time: "now", text: "**literal request**" }])[0],
    ).not.toHaveProperty("blocks");
  });

  it("answers using only the existing opaque session, without resending initial context", async () => {
    const { agent, notices } = setup();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response([{ kind: "session", id }, { kind: "question", question }, end]),
      )
      .mockResolvedValueOnce(response([end]));
    vi.stubGlobal("fetch", fetch);
    await collect(agent);
    expect(notices[1]?.kind).toBe("session");
    const initial = bodyOf(fetch.mock.calls[0]?.[1]);
    expect(initial).toHaveProperty("startId", expect.any(String));
    expect(initial).toMatchObject({ message: message.text });
    await collect(agent, { kind: "answer", text: "Warm and confirm first" });
    expect(bodyOf(fetch.mock.calls[1]?.[1])).toEqual({
      sessionId: id,
      message: "Warm and confirm first",
    });
  });

  it.each([
    { kind: "question", question: { ...question, options: [] } },
    { kind: "author-end", draft: null, error: null },
    { kind: "snapshot", result: {} },
  ])("rejects invalid or wrong-role events without completing tools ($kind)", async (invalid) => {
    const { agent, notices } = setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([
            { kind: "text", text: "Partial **reply" },
            { kind: "tool-start", id: "tool", tool: "ask_user" },
            invalid,
          ]),
        ),
    );
    const chunks = await collect(agent);
    expect(fold(chunks).text).toBe("Partial reply");
    expect(chunks.at(-1)).toMatchObject({ kind: "failure" });
    expect(chunks).not.toContainEqual(expect.objectContaining({ kind: "question" }));
    expect(
      chunks.some(
        (chunk) =>
          typeof chunk !== "string" && chunk.kind === "step" && chunk.step.status === "done",
      ),
    ).toBe(false);
    expect(notices.at(-1)).toMatchObject({ kind: "error" });
    expect(notices).not.toContainEqual(invalid);
    expect(await collect(agent)).toEqual([expect.objectContaining({ kind: "failure" })]);
  });

  it.each(["eof", "transport", "cancel"])(
    "flushes partial prose on %s without a successful completion",
    async (mode) => {
      const { agent, notices } = setup();
      const stop = new AbortController();
      let stage = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream<Uint8Array>(
              {
                pull(controller) {
                  if (stage++ === 0)
                    controller.enqueue(encode({ kind: "text", text: "Unfinished **word" }));
                  else if (mode === "transport") controller.error(new Error("Connection lost"));
                  else {
                    if (mode === "cancel") {
                      stop.abort();
                      controller.enqueue(encode(end));
                    } else controller.close();
                  }
                },
              },
              { highWaterMark: 0 },
            ),
          ),
        ),
      );
      const chunks = await collect(agent, message, stop.signal);
      expect(fold(chunks).text).toBe("Unfinished word");
      expect(notices).not.toContainEqual(end);
      expect(notices.at(-1)).toMatchObject({ kind: mode === "cancel" ? "cancelled" : "error" });
      expect(await collect(agent)).toEqual([expect.objectContaining({ kind: "failure" })]);
    },
  );

  it("preserves authoring context only on creation and resumes restored server history", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => response([{ kind: "author-end", draft: null, error: null }]));
    vi.stubGlobal("fetch", fetch);
    const options = {
      endpoint: "/api/simulation-author",
      initial: { source: { workflowId: id } },
      observe: () => {},
    } as const;
    await collect(createBuilderAgent(options));
    expect(bodyOf(fetch.mock.calls[0]?.[1])).toMatchObject({ source: { workflowId: id } });
    await collect(createBuilderAgent({ ...options, resume: { id, closed: false } }));
    expect(bodyOf(fetch.mock.calls[1]?.[1])).toEqual({
      sessionId: id,
      message: message.text,
    });
    await collect(createBuilderAgent({ ...options, resume: { id, closed: true } }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
