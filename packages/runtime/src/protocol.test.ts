import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { commandSchema, noticeSchema, type threadMessageSchema } from "./protocol";

const attachment = {
  turnId: "a1",
  label: "Net profit · Sep 14–20",
  state: { measure: "Net profit" },
};
const init = (agent: unknown) => ({ kind: "init", agent, data: { kind: "device" } });
const gatewayInit = (baseUrl: string) => init({ kind: "gateway", baseUrl });
const send = {
  kind: "send",
  requestId: "r1",
  threadId: "profit",
  event: { kind: "message", text: "Why is Saturday high?", attachments: [attachment] },
};
const child = { kind: "child", parentId: "profit", at: 1, title: "Saturday", draft: "> Sat\n\n" };
const accepts = (command: unknown) => commandSchema.safeParse(command).success;
const saveShell = (shell: unknown) => ({ kind: "saveShell", requestId: "r1", shell });
// Whether a chunk notice carrying `value` parses.
const carries = (value: unknown) =>
  noticeSchema.safeParse({ kind: "chunk", requestId: "r1", chunk: value }).success;

describe("commandSchema checks what crosses into the worker", () => {
  it("accepts a send whose card choice rides along", () => {
    expect(commandSchema.parse(send)).toEqual(send);
  });

  it("rejects a command whose kind it does not know", () => {
    expect(accepts({ kind: "shred", requestId: "r1", threadId: "profit" })).toBe(false);
  });

  it("rejects a send whose event is malformed", () => {
    expect(accepts({ ...send, event: { kind: "message", text: "Hi" } })).toBe(false);
    expect(accepts({ ...send, event: { kind: "shout", text: "Hi" } })).toBe(false);
  });

  it("accepts a rejected question even when the question itself was missing", () => {
    const event = { kind: "question-rejected", reason: "no options", question: undefined };
    expect(accepts({ ...send, event })).toBe(true);
  });

  it("renames only to a name with something in it", () => {
    const rename = { kind: "rename", requestId: "r1", target: { kind: "thread", id: "profit" } };
    expect(accepts({ ...rename, name: "Weekend margins" })).toBe(true);
    expect(accepts({ ...rename, name: "" })).toBe(false);
  });

  it("only takes an absolute gateway address", () => {
    expect(accepts(gatewayInit("http://localhost:5173"))).toBe(true);
    expect(accepts(gatewayInit("/api"))).toBe(false);
  });
});

describe("commandSchema checks the workspace's writes", () => {
  it("carries the v1 canvas keys in a device start", () => {
    const legacy = { hidden: ["thread-a"], order: ["thread-b"] };
    expect(accepts({ ...init({ kind: "lab" }), data: { kind: "device", legacy } })).toBe(true);
  });

  it("creates a child only at a whole index and with a title", () => {
    expect(accepts({ kind: "create", requestId: "r1", item: child })).toBe(true);
    expect(accepts({ kind: "create", requestId: "r1", item: { ...child, at: 1.5 } })).toBe(false);
    expect(accepts({ kind: "create", requestId: "r1", item: { ...child, title: "" } })).toBe(false);
  });

  it("refuses a thread lane whose id is not l-<threadId>", () => {
    const lane = {
      id: "l-other",
      width: null,
      collapsed: false,
      kind: "thread",
      threadId: "thread-a",
    };
    const arrange = { kind: "arrange", requestId: "r1", mainId: "profit", base: [] };
    expect(accepts({ ...arrange, lanes: [{ ...lane, id: "l-thread-a" }] })).toBe(true);
    expect(accepts({ ...arrange, lanes: [lane] })).toBe(false);
  });

  it("arranges a lane only with whether it is collapsed", () => {
    const shared = { v: 1, kind: "catalog", payload: {} };
    const card = { id: "c-1", width: null, kind: "card", card: shared, title: "Card" };
    const arrange = { kind: "arrange", requestId: "r1", mainId: "profit", base: [] };
    expect(accepts({ ...arrange, lanes: [{ ...card, collapsed: true }] })).toBe(true);
    expect(accepts({ ...arrange, lanes: [card] })).toBe(false);
    expect(accepts({ ...arrange, lanes: [{ ...card, collapsed: 1 }] })).toBe(false);
  });

  it("keeps a shell only when it is a JSON object", () => {
    expect(accepts(saveShell({ version: 1, tabs: ["profit"] }))).toBe(true);
    expect(accepts(saveShell(["profit"]))).toBe(false);
    expect(accepts(saveShell({ opened: new Date(0) }))).toBe(false);
  });
});

const mark = (change: unknown) => ({ kind: "mark", requestId: "r1", threadId: "profit", change });

describe("commandSchema checks the thread menu's writes (ADR-126)", () => {
  const share = {
    id: "s1",
    threadId: "profit",
    link: "https://kay.example/share.html#t=s1.key",
    revokeToken: "r",
    createdAt: "2026-09-28T10:00:00.000Z",
    expiresAt: "2026-09-28T11:00:00.000Z",
  };

  it("marks with a pin, a snooze instant or an archive, and never with nothing", () => {
    expect(accepts(mark({ pinned: true }))).toBe(true);
    expect(accepts(mark({ snoozedUntil: "2026-09-29T09:00:00.000Z" }))).toBe(true);
    expect(accepts(mark({ snoozedUntil: null, archived: false }))).toBe(true);
    expect(accepts(mark({ snoozedUntil: "tomorrow" }))).toBe(false);
    expect(accepts(mark({}))).toBe(false);
  });

  it("deletes and restores by thread", () => {
    expect(accepts({ kind: "delete", requestId: "r1", threadId: "profit" })).toBe(true);
    expect(accepts({ kind: "restore", requestId: "r1", threadId: "profit" })).toBe(true);
    expect(accepts({ kind: "restore", requestId: "r1" })).toBe(false);
  });

  it("keeps a share with an absolute link, and forgets one by id", () => {
    expect(accepts({ kind: "share", requestId: "r1", share })).toBe(true);
    expect(accepts({ kind: "share", requestId: "r1", share: { ...share, link: "/share" } })).toBe(
      false,
    );
    expect(accepts({ kind: "unshare", requestId: "r1", shareId: "s1" })).toBe(true);
  });
});

describe("noticeSchema", () => {
  it("carries a reply's words and its events in a chunk (ADR-147)", () => {
    expect(carries("Saturday leads")).toBe(true);
    expect(carries({ kind: "card", payload: { component: "BarChart" } })).toBe(true);
    expect(carries({ kind: "step", step: { id: "s1", label: "Count", status: "done" } })).toBe(
      true,
    );
    expect(carries({ kind: "step", step: { id: "s1", label: "Count", status: "stuck" } })).toBe(
      false,
    );
    expect(carries({ kind: "shout", text: "Hi" })).toBe(false);
  });

  it("parses exactly a stored turn, so a field the catalog adds to one fails to compile", () => {
    expectTypeOf<z.infer<typeof threadMessageSchema>>().toEqualTypeOf<ThreadMessage>();
  });

  it("keeps a stored reply's thinking, so a reload still shows it", () => {
    const messages = [
      { id: "a1", role: "agent", text: "Friday.", time: "9:00", thinking: "The busiest day." },
    ];
    expect(noticeSchema.parse({ kind: "opened", requestId: "r1", messages })).toMatchObject({
      messages,
    });
  });

  it("rejects a stored turn with an unknown role", () => {
    const messages = [{ id: "s1", role: "system", text: "Hi", time: "9:00" }];
    expect(noticeSchema.safeParse({ kind: "opened", requestId: "r1", messages }).success).toBe(
      false,
    );
  });

  it("rejects a state whose times are not instants", () => {
    const workspace = {
      projects: [{ id: "p", name: "P", createdAt: "yesterday" }],
      threads: [],
      lanes: {},
      shell: null,
      notifications: [],
      shares: [],
    };
    const source = { kind: "device", storage: "opfs" };
    const state = { kind: "state", source, workspace, replying: [] };
    expect(noticeSchema.safeParse(state).success).toBe(false);
  });
});
