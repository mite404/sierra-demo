import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import { simulationRun } from "./simulationContract";
import { listSimulationRuns, reserveSimulationRun, saveSimulationRun } from "./simulationStorage";
import {
  appWith,
  finished,
  http,
  ownerReplies,
  required,
  saved,
  start,
  runTestStorage,
} from "./simulationRuns.test-helper";
import { createSimulationApp } from "./simulationWorker";

const { env, db, directory, dispose } = runTestStorage();
const seed = (definition: typeof saved) =>
  db()
    .prepare("INSERT INTO simulation_definitions VALUES (?, ?, ?)")
    .bind(definition.id, definition.revision, JSON.stringify(definition))
    .run();

const threeCompletions = async () => {
  const definition = { ...saved, id: crypto.randomUUID() };
  await seed(definition);
  const requests: unknown[] = [];
  const app = appWith(
    [...ownerReplies(), ...ownerReplies(), ...ownerReplies(), ...ownerReplies()],
    requests,
  );
  const first = await finished(await app.fetch(start(crypto.randomUUID(), definition), env()));
  const second = await finished(await app.fetch(start(crypto.randomUUID(), definition), env()));
  expect(first.evidence?.result.before).toEqual(second.evidence?.result.before);
  expect(first.evidence?.result.trace.map((entry) => entry.outcome)).toEqual(
    second.evidence?.result.trace.map((entry) => entry.outcome),
  );
  const revised = {
    ...definition,
    revision: 2,
    definition: { ...definition.definition, name: "Revised definition" },
  };
  await seed(revised);
  const third = await finished(await app.fetch(start(crypto.randomUUID(), revised), env()));
  return { app, requests, definition, revised, first, second, third };
};

it("retains two across revisions and deduplicates immutable delivery", async () => {
  const { app, definition, first, second, third } = await threeCompletions();
  const retained = await listSimulationRuns(db(), definition.id);
  expect(retained.map((run) => run.id)).toEqual([third.id, second.id]);
  expect(retained.map((run) => run.evidence?.result.simulation?.revision)).toEqual([2, 1]);
  await saveSimulationRun(db(), required(first.evidence));
  expect((await listSimulationRuns(db(), definition.id)).map((run) => run.id)).toEqual([
    third.id,
    second.id,
  ]);
  await expect(
    saveSimulationRun(db(), {
      ...required(first.evidence),
      completedAt: "2026-10-24T00:00:00.000Z",
    }),
  ).rejects.toThrow("conflict");
  expect((await app.fetch(http(`simulation-runs/${first.id}`), env())).status).toBe(410);
});

it("rolls back failed pruning and retries only saving, preserving human review", async () => {
  const { app, requests, definition, revised, second, third } = await threeCompletions();
  const review = { status: "needs-improvement", note: "Human judgment, not an automatic grade." };
  expect((await app.fetch(http(`simulation-runs/${third.id}/review`, review), env())).status).toBe(
    200,
  );
  await db()
    .prepare(
      `CREATE TRIGGER fail_run_prune BEFORE DELETE ON simulation_runs BEGIN SELECT RAISE(ABORT, 'test prune failure'); END`,
    )
    .run();
  const failedSave = await finished(await app.fetch(start(crypto.randomUUID(), revised), env()));
  expect(failedSave.persistence).toBe("unsaved");
  expect(failedSave.evidence?.result.status).toBe("completed");
  expect((await listSimulationRuns(db(), definition.id)).map((run) => run.id)).toEqual([
    third.id,
    second.id,
  ]);
  expect(
    await db()
      .prepare("SELECT evidence_hash FROM simulation_run_handles WHERE id = ?")
      .bind(failedSave.id)
      .first("evidence_hash"),
  ).toBeNull();
  await db().prepare("DROP TRIGGER fail_run_prune").run();
  const callsBeforeRetry = requests.length;
  const retries = await Promise.all([
    app.fetch(http(`simulation-runs/${failedSave.id}/save`, undefined, "POST"), env()),
    app.fetch(http(`simulation-runs/${failedSave.id}/save`, undefined, "POST"), env()),
  ]);
  expect(retries.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([200, 409]);
  expect(
    simulationRun.parse(await required(retries.find((response) => response.status === 200)).json()),
  ).toMatchObject({ persistence: "saved", evidence: failedSave.evidence });
  expect(requests.length).toBe(callsBeforeRetry);
  expect((await listSimulationRuns(db(), definition.id)).map((run) => run.id)).toEqual([
    failedSave.id,
    third.id,
  ]);
  const restarted = createSimulationApp();
  const readback = simulationRun.parse(
    await (
      await restarted.fetch(http(`simulation-runs/${third.id}`), { SIMULATION_DB: db() })
    ).json(),
  );
  expect(readback.humanReview).toEqual(review);
  expect(readback.evidence).toEqual(third.evidence);
});

it("does not evict newer completions when an older unsaved result finally commits", async () => {
  const app = appWith([...ownerReplies(), ...ownerReplies()]);
  const first = await finished(await app.fetch(start(), env()));
  const second = await finished(await app.fetch(start(), env()));
  const oldId = crypto.randomUUID();
  expect(await reserveSimulationRun(db(), oldId, saved)).toBe(true);
  expect(
    await saveSimulationRun(db(), {
      ...required(first.evidence),
      id: oldId,
      completedAt: "2020-01-01T00:00:00.000Z",
    }),
  ).toBe(false);
  expect((await listSimulationRuns(db(), saved.id)).map((run) => run.id)).toEqual([
    second.id,
    first.id,
  ]);
});

it("reads exactly two completions after real Wrangler restart without replaying unfinished handles", async () => {
  const { definition, revised, first, second, third } = await threeCompletions();
  await saveSimulationRun(db(), required(first.evidence));
  const unfinished = crypto.randomUUID();
  expect(await reserveSimulationRun(db(), unfinished, revised)).toBe(true);
  await dispose();
  const assets = join(directory(), "assets");
  await mkdir(assets);
  const worker = await unstable_dev(
    fileURLToPath(new URL("./simulationWorker.ts", import.meta.url)),
    {
      config: "wrangler.simulation.jsonc",
      local: true,
      ip: "127.0.0.1",
      port: 0,
      inspectorPort: 0,
      persistTo: directory(),
      assets,
      logLevel: "none",
      experimental: { disableExperimentalWarning: true },
    },
  );
  try {
    const latest = await worker.fetch(http(`simulation-definitions/${definition.id}/runs`).url);
    expect(await latest.json()).toEqual([third, second]);
    expect((await worker.fetch(http(`simulation-runs/${first.id}`).url)).status).toBe(410);
    expect((await worker.fetch(http(`simulation-runs/${unfinished}`).url)).status).toBe(410);
    const request = start(unfinished, revised);
    expect(
      (
        await worker.fetch(request.url, {
          method: "POST",
          body: await request.text(),
          headers: Object.fromEntries(request.headers),
        })
      ).status,
    ).toBe(409);
  } finally {
    await worker.stop();
  }
});
