import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev } from "wrangler";

const root = fileURLToPath(new URL("../", import.meta.url));
const definitionsPath = process.argv[2];
const output = resolve(process.argv[3] ?? "/tmp/eth89-live-evidence.json");
assert.ok(definitionsPath, "Pass an export of already approved saved definitions");
assert.ok(
  process.env.OPENROUTER_API_KEY !== undefined && process.env.OPENROUTER_API_KEY.length > 0,
  "Real K3 acceptance requires OPENROUTER_API_KEY",
);
const definitions = JSON.parse(await readFile(definitionsPath, "utf8"));
assert.equal(definitions.length, 2);
const scratch = await mkdtemp(join(tmpdir(), "eth89-live-"));
const config = join(root, "wrangler.simulation.jsonc");
const persistTo = join(scratch, "data");
const assets = join(scratch, "assets");
const evidence = { definitions, runs: [], restart: null };
let worker;

const sql = (args) =>
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", ...args, "--config", config, "--local", "--persist-to", persistTo],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    },
  );
const launch = () =>
  unstable_dev(join(root, "src/simulationWorker.ts"), {
    config,
    local: true,
    ip: "127.0.0.1",
    port: 0,
    inspectorPort: 0,
    persistTo,
    assets,
    logLevel: "none",
    experimental: { disableExperimentalWarning: true },
    vars: { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY },
  });
const send = (path, body) =>
  worker.fetch(
    `http://localhost/api/${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
const execute = async (definition) => {
  const id = crypto.randomUUID();
  const began = Date.now();
  const response = await send("simulation-runs", {
    startId: id,
    definitionId: definition.id,
    expectedRevision: definition.revision,
  });
  assert.equal(response.status, 200);
  const events = [];
  let pending = "";
  for await (const chunk of response.body) {
    pending += new TextDecoder().decode(chunk);
    const lines = pending.split("\n");
    pending = lines.pop();
    events.push(
      ...lines.filter(Boolean).map((line) => ({ ms: Date.now() - began, event: JSON.parse(line) })),
    );
  }
  const terminal = events.at(-1)?.event;
  evidence.runs.push({ id, events });
  await writeFile(output, JSON.stringify(evidence, null, 2));
  assert.equal(terminal?.kind, "run-end");
  assert.equal(terminal.run.evidence.result.status, "completed", JSON.stringify(terminal.run));
  assert.equal(terminal.run.persistence, "saved");
  assert.deepEqual(terminal.run.evidence.result.simulation, definition);
  assert.ok(
    events.some(({ event, ms }) => event.kind === "customer-delta" && ms < events.at(-1).ms),
  );
  assert.ok(
    events.some(
      ({ event, ms }) =>
        event.kind === "support" && event.event.kind === "text" && ms < events.at(-1).ms,
    ),
  );
  return terminal.run;
};

try {
  await mkdir(assets);
  sql(["migrations", "apply", "SIMULATION_DB"]);
  const seed = join(scratch, "approved.sql");
  await writeFile(
    seed,
    definitions
      .map(
        (definition) =>
          `INSERT INTO simulation_definitions VALUES ('${definition.id}', ${definition.revision}, '${JSON.stringify(definition).replaceAll("'", "''")}');`,
      )
      .join("\n"),
  );
  sql(["execute", "SIMULATION_DB", "--file", seed]);
  worker = await launch();
  const spouse = await execute(definitions[0]);
  const owner = await execute(definitions[1]);
  assert.equal(
    owner.evidence.result.conversation.filter((message) => message.role === "customer").length >= 3,
    true,
  );
  assert.deepEqual(
    owner.evidence.result.trace.map((entry) => entry.outcome),
    ["confirmation_required", "refunded", "already_refunded"],
  );
  assert.equal(owner.evidence.result.verdict, "pass");
  assert.deepEqual(
    spouse.evidence.result.after.map((invoice) => invoice.refundedCents),
    [0, 0],
  );
  await worker.stop();
  worker = await launch();
  const readback = await Promise.all(
    [spouse, owner].map(async (run) => (await send(`simulation-runs/${run.id}`)).json()),
  );
  assert.deepEqual(readback, [spouse, owner]);
  evidence.restart = { preserved: readback.map((run) => run.id), noReplay: true };
  await writeFile(output, JSON.stringify(evidence, null, 2));
  process.stdout.write(
    `Real K3 spouse and owner completed; owner confirmation/refund/repeat and Wrangler restart verified. Evidence ${output}\n`,
  );
} finally {
  await worker?.stop();
  await rm(scratch, { recursive: true, force: true });
}
