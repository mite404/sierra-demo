import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "http://127.0.0.1:8787" },
    employee: { type: "string" },
    interrupted: { type: "string" },
  },
});
const [phase, file] = positionals;
assert.ok(["before", "after"].includes(phase), "Supply before|after and a snapshot path");
assert.equal(typeof file, "string", "Supply a snapshot path");

const read = async (endpoint) => {
  const response = await fetch(`${values.base}/api/${endpoint}`);
  assert.equal(response.status, 200, endpoint);
  return response.json();
};
const definitions = await read("simulation-definitions");
const records = await Promise.all(
  definitions.map(async (definition) => ({
    definition,
    runs: await read(`simulation-definitions/${definition.id}/runs`),
  })),
);
assert.ok(records.length > 0, "Author and save a simulation first");
assert.ok(
  records.some(({ runs }) => runs.length === 2),
  "Complete two runs before restarting",
);
for (const { definition, runs } of records) {
  assert.ok(runs.length <= 2, "Retention must not grow beyond two completions per definition");
  for (const run of runs) {
    assert.equal(run.evidence.result.status, "completed");
    assert.equal(run.evidence.result.simulation.id, definition.id);
    assert.ok(run.evidence.result.simulation.revision <= definition.revision);
    assert.equal(run.active, false);
  }
}

if (phase === "before") {
  assert.equal(typeof values.employee, "string", "Supply the existing employee ID");
  assert.equal(typeof values.interrupted, "string", "Supply the active run ID");
  const [employee, run] = await Promise.all([
    read(`workflow/${values.employee}`),
    read(`simulation-runs/${values.interrupted}`),
  ]);
  assert.equal(employee.id, values.employee);
  assert.equal(run.id, values.interrupted);
  assert.equal(run.active, true, "Capture while the interrupted run is still active");
  await writeFile(
    file,
    JSON.stringify({ employeeId: employee.id, interruptedId: run.id, records }, null, 2),
    { flag: "wx" },
  );
  process.stdout.write(
    "Captured existing workflow, active run, saved definitions and completed results. Restart now.\n",
  );
} else {
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(records, snapshot.records, "Saved evidence changed");
  assert.equal(typeof snapshot.employeeId, "string", "Snapshot needs the preflight employee ID");
  assert.equal(typeof snapshot.interruptedId, "string", "Snapshot needs the preflight run ID");
  assert.equal(values.employee ?? snapshot.employeeId, snapshot.employeeId, "Employee ID changed");
  assert.equal(
    values.interrupted ?? snapshot.interruptedId,
    snapshot.interruptedId,
    "Run ID changed",
  );
  await Promise.all(
    [`workflow/${snapshot.employeeId}`, `simulation-runs/${snapshot.interruptedId}`].map(
      async (endpoint) => {
        const response = await fetch(`${values.base}/api/${endpoint}`);
        assert.equal(response.status, 410, endpoint);
        assert.equal(typeof (await response.json()).error, "string", "Missing recovery error");
      },
    ),
  );
  process.stdout.write(
    "PASS saved definitions/results unchanged; expired workflow and interrupted run return 410. GET-only check never starts or replays work.\n",
  );
}
