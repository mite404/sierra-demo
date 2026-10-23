import { expect, it, vi } from "vitest";
import { simulationRun } from "./simulationContract";
import { listSimulationRuns } from "./simulationStorage";
import {
  actor,
  finished,
  heldApp,
  http,
  ownerReplies,
  required,
  saved,
  start,
  text,
  runTestStorage,
} from "./simulationRuns.test-helper";
import { createSimulationApp } from "./simulationWorker";

const { env, db } = runTestStorage();
type Held = ReturnType<typeof heldApp>;
const read = async (app: Held["app"], id: string) =>
  simulationRun.parse(await (await app.fetch(http(`simulation-runs/${id}`), env())).json());
const actions = [
  {
    name: "stop",
    act: (app: Held["app"], id: string, _response: Response, _stop: AbortController) =>
      app.fetch(http(`simulation-runs/${id}/stop`, undefined, "POST"), env()),
    consume: (response: Response) => response.text(),
  },
  {
    name: "delete",
    act: (app: Held["app"], id: string, _response: Response, _stop: AbortController) =>
      app.fetch(http(`simulation-runs/${id}`, undefined, "DELETE"), env()),
    consume: (response: Response) => response.text(),
  },
  {
    name: "disconnect",
    act: (_app: Held["app"], _id: string, response: Response, _stop: AbortController) =>
      required(response.body).cancel(),
    consume: () => Promise.resolve(""),
  },
  {
    name: "request abort",
    act: (_app: Held["app"], _id: string, _response: Response, stop: AbortController) => {
      stop.abort();
      return Promise.resolve();
    },
    consume: (response: Response) => response.text(),
  },
];

it.each(actions)(
  "$name retains ownership and committed evidence through actual termination",
  async ({ act, consume }) => {
    const { app, held, entered, aborted } = heldApp(ownerReplies().slice(0, 5));
    const id = crypto.randomUUID();
    const stop = new AbortController();
    const response = await app.fetch(new Request(start(id), { signal: stop.signal }), env());
    await entered.promise;
    expect(await read(app, id)).toMatchObject({
      active: true,
      evidence: {
        result: { status: "running", after: [{ refundedCents: 4200 }, { refundedCents: 0 }] },
      },
    });
    expect((await app.fetch(start(id), env())).status).toBe(409);
    await act(app, id, response, stop);
    expect(aborted()).toBe(true);
    expect((await app.fetch(start(), env())).status).toBe(409);
    const probe = await app.fetch(
      http("simulation", { case: "owner", version: "corrected", source: "probe", pressure: false }),
      env(),
    );
    expect(await probe.text()).toContain('"status":"completed"');
    held.resolve(text("Late false success must not replace partial evidence."));
    await vi.waitFor(async () => {
      const view = await read(app, id);
      expect(view).toMatchObject({
        active: false,
        persistence: "none",
        evidence: {
          result: {
            status: "cancelled",
            verdict: null,
            checks: [],
            trace: [{ outcome: "confirmation_required" }, { outcome: "refunded" }],
            after: [{ refundedCents: 4200, refundCount: 1 }, { refundedCents: 0 }],
          },
        },
      });
      expect(JSON.stringify(view)).not.toContain("Late false success");
    });
    await consume(response);
    const restarted = createSimulationApp();
    expect((await restarted.fetch(start(id), env())).status).toBe(409);
    expect((await restarted.fetch(http(`simulation-runs/${id}`), env())).status).toBe(410);
  },
);

const interceptDeadlines = () => {
  const deadlines = new Map<number, AbortController[]>();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    deadlines.set(ms, [...(deadlines.get(ms) ?? []), controller]);
    return controller.signal;
  });
  return { deadlines, timeout };
};
it.each([
  { role: "customer provider", budget: 20000, replies: () => [] },
  { role: "support provider", budget: 20000, replies: () => [actor("Refund my payment")] },
  { role: "support turn", budget: 45000, replies: () => [actor("Refund my payment")] },
  { role: "whole scenario", budget: 240000, replies: () => [] },
])("aborts $role at its exact budget without grading", async ({ budget, replies }) => {
  const { deadlines, timeout } = interceptDeadlines();
  const { app, entered } = heldApp(replies(), true);
  try {
    const response = await app.fetch(start(), env());
    await entered.promise;
    expect(deadlines.has(240000)).toBe(true);
    expect(deadlines.has(20000)).toBe(true);
    required(deadlines.get(budget)?.at(-1)).abort(
      new DOMException("Test deadline", "TimeoutError"),
    );
    const view = await finished(response);
    expect(view).toMatchObject({
      active: false,
      persistence: "none",
      evidence: {
        result: {
          status: "timed-out",
          trace: [],
          verdict: null,
          checks: [],
          after: [{ refundedCents: 0 }, { refundedCents: 0 }],
        },
      },
    });
  } finally {
    timeout.mockRestore();
  }
});

it("serializes simultaneous starts and cancellation before the first tool without evicting completions", async () => {
  const { app, entered, held, requests } = heldApp([]);
  const previous = await listSimulationRuns(db(), saved.id);
  const id = crypto.randomUUID();
  const responses = await Promise.all([
    app.fetch(start(id), env()),
    app.fetch(start(id), env()),
    app.fetch(start(), env()),
  ]);
  expect(responses.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
    200, 409, 409,
  ]);
  await entered.promise;
  await app.fetch(http(`simulation-runs/${id}/stop`, undefined, "POST"), env());
  held.resolve(actor("Late request"));
  const view = await finished(required(responses.find((item) => item.status === 200)));
  expect(view.evidence?.result).toMatchObject({
    status: "cancelled",
    trace: [],
    conversation: [],
    verdict: null,
  });
  expect(requests()).toBe(1);
  expect(await listSimulationRuns(db(), saved.id)).toEqual(previous);
});
