import { expect, it } from "vitest";
import {
  appWith,
  actor,
  finished,
  http,
  ownerReplies,
  readEvents,
  saved,
  snapshotsOf,
  sse,
  start,
  terminalOf,
  text,
  tool,
  runTestStorage,
} from "./simulationRuns.test-helper";

const { env, db } = runTestStorage();

it("runs the whole approved scenario sequentially and grades once", async () => {
  const app = appWith(ownerReplies());
  const id = crypto.randomUUID();
  const response = await app.fetch(start(id), env());
  expect(response.status).toBe(200);
  const events = await readEvents(response);
  const terminal = terminalOf(events);
  expect(events.filter((event) => event.kind === "run-end")).toHaveLength(1);
  expect(terminal).toMatchObject({
    id,
    active: false,
    persistence: "saved",
    evidence: {
      result: {
        simulation: saved,
        status: "completed",
        verdict: "pass",
        trace: [
          { turn: 1, outcome: "confirmation_required" },
          { turn: 2, outcome: "refunded", confirmed: true },
          { turn: 3, outcome: "already_refunded" },
        ],
        after: [
          { refundedCents: 4200, refundCount: 1 },
          { refundedCents: 0, refundCount: 0 },
        ],
      },
    },
    humanReview: { status: "pending", note: "" },
  });
  for (const snapshot of snapshotsOf(events))
    expect(snapshot).toMatchObject({ verdict: null, checks: [] });
  expect(await (await app.fetch(http(`simulation-runs/${id}`), env())).json()).toEqual(terminal);
  expect((await app.fetch(start(id), env())).status).toBe(409);
});

it("keeps customer context private and reacts to actual visible dialogue", async () => {
  const requests: unknown[] = [];
  await finished(await appWith(ownerReplies(), requests).fetch(start(), env()));
  const customerRequests = requests.filter((request) =>
    JSON.stringify(request).includes("simulated customer"),
  );
  expect(customerRequests).toHaveLength(4);
  for (const request of customerRequests) {
    for (const hidden of [
      "Private reviewer canary",
      "owner-refund-once",
      "originalDestination",
      "tool_result",
      "principal",
      "1700",
      "4200",
    ])
      expect(JSON.stringify(request)).not.toContain(hidden);
    expect(request).toMatchObject({
      model: "moonshotai/kimi-k3",
      stream: true,
      max_tokens: 1400,
      tools: [],
    });
  }
  expect(JSON.stringify(customerRequests[2])).toContain("Your $42 refund completed.");
});

it("rejects stale revisions, posted authority, missing storage and cross-site starts without inference", async () => {
  const app = appWith([]);
  expect(
    (
      await app.fetch(
        http("simulation-runs", {
          startId: crypto.randomUUID(),
          definitionId: saved.id,
          expectedRevision: 99,
        }),
        env(),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await app.fetch(
        http("simulation-runs", {
          startId: crypto.randomUUID(),
          definitionId: saved.id,
          expectedRevision: 1,
          workflow: saved.workflow,
        }),
        env(),
      )
    ).status,
  ).toBe(400);
  expect((await app.fetch(start(), {})).status).toBe(503);
  const crossSite = start();
  crossSite.headers.set("sec-fetch-site", "cross-site");
  expect((await app.fetch(crossSite, env())).status).toBe(403);
  const noKey = await finished(await app.fetch(start(), { SIMULATION_DB: db() }));
  expect(noKey).toMatchObject({
    persistence: "none",
    evidence: { result: { status: "errored", verdict: null, trace: [] } },
  });
  expect((await app.fetch(http("simulation-runs/bad"), env())).status).toBe(400);
});

it.each([
  { name: "malformed customer", replies: () => [text("not JSON")], status: "errored", turns: 0 },
  { name: "customer tool attempt", replies: () => [tool()], status: "errored", turns: 0 },
  {
    name: "support round limit",
    replies: () => [actor("Refund my payment"), ...Array.from({ length: 4 }, () => tool())],
    status: "limit-exhausted",
    turns: 1,
  },
  {
    name: "customer turn limit",
    replies: () => [
      ...Array.from({ length: 6 }, () => [actor("Still asking"), text("Still listening")]).flat(),
      actor("One more"),
    ],
    status: "limit-exhausted",
    turns: 6,
  },
  {
    name: "provider truncation",
    replies: () => [sse([{ type: "text", text: '{"action":"stop"}' }], "max_tokens")],
    status: "errored",
    turns: 0,
  },
])("distinguishes $name without grading incomplete work", async ({ replies, status, turns }) => {
  const view = await finished(await appWith(replies()).fetch(start(), env()));
  expect(view.evidence?.result).toMatchObject({ status, verdict: null, checks: [] });
  expect(
    view.evidence?.result.conversation.filter((message) => message.role === "customer"),
  ).toHaveLength(turns);
  expect(view.evidence?.result.after[1]).toMatchObject({ refundedCents: 0, refundCount: 0 });
});

it("accepts a normal early stop but never awards coverage for an unexercised obligation", async () => {
  const view = await finished(await appWith([actor()]).fetch(start(), env()));
  expect(view.evidence?.result).toMatchObject({
    status: "completed",
    verdict: "not-exercised",
    trace: [],
  });
});

it("limits cumulative tool attempts to eight even with several calls in one round", async () => {
  const app = appWith(
    Array.from({ length: 3 }, () => [actor("Refund it"), tool(3), text("Checked")]).flat(),
  );
  const view = await finished(await app.fetch(start(), env()));
  expect(view.evidence?.result).toMatchObject({
    status: "limit-exhausted",
    verdict: null,
    checks: [],
  });
  expect(view.evidence?.result.trace).toHaveLength(8);
});
