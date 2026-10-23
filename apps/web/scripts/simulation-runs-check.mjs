import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { arg, launch } from "./harness.mjs";
import * as checks from "./simulation-lifetime-check.mjs";

const base = arg("--base", "http://127.0.0.1:8790");
const out = path.resolve(arg("--out", ".amp/in/artifacts/eth90"));
const logs = path.resolve(arg("--logs", "/tmp/eth90-logs"));
await Promise.all([mkdir(out, { recursive: true }), mkdir(logs, { recursive: true })]);
const browser = await launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const current = () => page.locator(".simulation-lab:visible");
const button = (name) => current().getByRole("button", { name, exact: true });
const latest = () => page.getByRole("article", { name: "Latest completed result", exact: true });
const partial = () => page.getByRole("article", { name: "Current run evidence", exact: true });
const capture = (name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
const qa = async (settings) => {
  const response = await page.request.post(`${base}/__qa`, { data: settings });
  assert.equal(response.status(), 200);
  return response.json();
};
const read = async (endpoint) => {
  const response = await page.request.get(`${base}/api/${endpoint}`);
  assert.equal(response.status(), 200);
  return response.json();
};
const send = async (text, endpoint) => {
  const response = page.waitForResponse(
    (item) => item.url().endsWith(endpoint) === true && item.request().method() === "POST",
  );
  await current().getByRole("textbox", { name: "Message", exact: true }).fill(text);
  await current().getByRole("textbox", { name: "Message", exact: true }).press("Enter");
  assert.equal((await response).status(), 200);
  await button("Stop").waitFor({ state: "hidden" });
};
const save = async () => {
  const response = page.waitForResponse((item) =>
    /\/simulation-drafts\/[^/]+\/save$/u.test(item.url()),
  );
  await button("Save simulation").click();
  const saved = await response;
  assert.equal(saved.status(), 201);
  const definition = await saved.json();
  await button("Run simulation").waitFor();
  return definition;
};
const start = async () => {
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith("/api/simulation-runs") === true && item.request().method() === "POST",
  );
  await current()
    .getByRole("button", { name: /^Run (simulation|again)$/u })
    .click();
  const received = await response;
  assert.equal(received.status(), 200);
  const body = received.request().postDataJSON();
  assert.deepEqual(Object.keys(body).toSorted(), ["definitionId", "expectedRevision", "startId"]);
  return body.startId;
};
const finished = async () => {
  await button("Stop").waitFor({ state: "hidden", timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector(".lab-run-controls output")?.textContent ===
      "Ready. No automatic run.",
    undefined,
    { timeout: 60000 },
  );
};
try {
  await qa({ mode: "owner", delay: 20, failSave: false });
  await page.goto(base);
  await button("Saved simulations").click();
  await page.getByText("No saved simulations yet.", { exact: false }).waitFor();
  await capture("01-empty-library-deterministic");
  await button("Back to workflow").click();
  await send("Help me set up a refund workflow.", "/api/workflow");
  await send("Use warm replies and ask the owner to confirm before refunding.", "/api/workflow");
  await button("Accept workflow").click();
  await button("Workflow accepted").waitFor();
  await button("Create simulation").click();
  await send(
    "Test the owner. Request a refund, confirm, then ask for it again.",
    "/api/simulation-author",
  );
  const owner = await save();
  await qa({ delay: 80 });
  const firstId = await start();
  await partial().getByText("Support agent", { exact: true }).first().waitFor();
  assert.equal(
    await partial()
      .getByText(/Selected business outcome/u)
      .count(),
    0,
  );
  assert.equal(
    await partial()
      .getByText(/"action"/u)
      .count(),
    0,
  );
  await partial().getByRole("region", { name: "Role-labeled transcript" }).scrollIntoViewIfNeeded();
  await capture("02-running-deterministic");
  await finished();
  await latest().waitFor();
  const first = await read(`simulation-runs/${firstId}`);
  assert.equal(first.evidence.result.verdict, "pass");
  assert.deepEqual(
    first.evidence.result.trace.map((entry) => entry.outcome),
    ["confirmation_required", "refunded", "already_refunded"],
  );
  assert.deepEqual(
    first.evidence.result.after.map((invoice) => invoice.refundedCents),
    [4200, 0],
  );
  assert.equal(first.humanReview.status, "pending");
  assert.equal(await latest().getByText("Refunded $0.00 → $42.00", { exact: true }).count(), 1);
  assert.equal(await latest().getByText("Refunded $0.00 → $0.00", { exact: true }).count(), 1);
  await latest().getByRole("heading", { name: "Latest", exact: true }).scrollIntoViewIfNeeded();
  await capture("03-one-result-deterministic");
  await latest().getByLabel("Your assessment").selectOption("needs-improvement");
  await latest()
    .getByLabel("Optional review note")
    .fill("Human control review. Check the evidence before promising anything else.");
  await latest().getByRole("button", { name: "Save human review" }).click();
  await latest().getByText("Human wording review · Needs improvement", { exact: true }).waitFor();
  const reviewed = await read(`simulation-runs/${firstId}`);
  assert.deepEqual(reviewed.evidence, first.evidence);
  assert.equal(reviewed.humanReview.status, "needs-improvement");
  await qa({ delay: 10 });
  const secondId = await start();
  assert.notEqual(secondId, firstId);
  await finished();
  await page.getByRole("article", { name: "Previous completed result" }).waitFor();
  const second = await read(`simulation-runs/${secondId}`);
  assert.deepEqual(
    second.evidence.result.before.map((invoice) => invoice.refundedCents),
    [0, 0],
  );
  await latest().scrollIntoViewIfNeeded();
  await capture("04-two-results-deterministic");
  await latest().getByRole("region", { name: "Payment before and after" }).scrollIntoViewIfNeeded();
  await capture("04b-payments-review-deterministic");
  await latest().getByRole("region", { name: "Human wording review" }).scrollIntoViewIfNeeded();
  await capture("04c-human-review-deterministic");
  await page.getByRole("heading", { name: "Previous", exact: true }).scrollIntoViewIfNeeded();
  await capture("04d-previous-deterministic");
  const callsBeforeReload = (await qa({})).modelCalls;
  await page.reload();
  await latest().waitFor();
  assert.equal((await qa({})).modelCalls, callsBeforeReload);
  await checks.checkNarrow(page, latest, capture);
  await qa({ mode: "error" });
  const errorId = await start();
  await finished();
  await partial().getByRole("heading", { name: "Execution error. No grade." }).waitFor();
  const failed = await read(`simulation-runs/${errorId}`);
  assert.equal(failed.evidence.result.verdict, null);
  assert.deepEqual(failed.evidence.result.checks, []);
  assert.equal((await read(`simulation-definitions/${owner.id}/runs`)).length, 2);
  await partial().scrollIntoViewIfNeeded();
  await capture("06-actor-error-ungraded-deterministic");
  await qa({ mode: "hold" });
  const cancelledId = await start();
  await button("Stop").click();
  await finished();
  await partial().getByRole("heading", { name: "Stopped. No grade." }).waitFor();
  const cancelled = await read(`simulation-runs/${cancelledId}`);
  assert.equal(cancelled.active, false);
  await partial().scrollIntoViewIfNeeded();
  await capture("07-stopped-deterministic");
  await qa({ mode: "timeout" });
  const timeoutId = await start();
  await finished();
  await partial().getByRole("heading", { name: "Time limit reached. No grade." }).waitFor();
  const timedOut = await read(`simulation-runs/${timeoutId}`);
  assert.equal(timedOut.evidence.result.status, "timed-out");
  await partial().scrollIntoViewIfNeeded();
  await capture("08-timeout-deterministic");
  await qa({ mode: "owner", failSave: true });
  const unsavedId = await start();
  await finished();
  await button("Retry save only").waitFor();
  assert.equal(await button("Run again").isDisabled(), true);
  const unsaved = await read(`simulation-runs/${unsavedId}`);
  assert.equal(unsaved.persistence, "unsaved");
  await button("Retry save only").scrollIntoViewIfNeeded();
  await capture("09-unsaved-deterministic");
  const callsBeforeSave = (await qa({ failSave: false })).modelCalls;
  await button("Retry save only").click();
  await button("Retry save only").waitFor({ state: "hidden" });
  const savedOnly = await read(`simulation-runs/${unsavedId}`);
  assert.equal(savedOnly.persistence, "saved");
  assert.deepEqual(savedOnly.evidence, unsaved.evidence);
  assert.equal((await qa({})).modelCalls, callsBeforeSave);
  await button("Edit in chat").click();
  await send("Revise the owner's test but keep the same checks.", "/api/simulation-author");
  const revisedResponse = page.waitForResponse((item) =>
    /\/simulation-drafts\/[^/]+\/save$/u.test(item.url()),
  );
  await button("Save simulation").click();
  assert.equal((await (await revisedResponse).json()).revision, 2);
  await page
    .getByText("Definition revisions or accepted settings differ", { exact: false })
    .waitFor();
  await page
    .getByText("Definition revisions or accepted settings differ", { exact: false })
    .scrollIntoViewIfNeeded();
  await capture("10-revision-mismatch-deterministic");
  await qa({ mode: "late" });
  const switchedId = await start();
  assert.equal(await button("Back to workflow").isDisabled(), true);
  assert.equal(await button("New workflow").isDisabled(), true);
  assert.equal(await button("Edit in chat").isDisabled(), true);
  await button("Stop").click();
  await page.waitForTimeout(200);
  assert.equal((await read(`simulation-runs/${switchedId}`)).active, true);
  assert.equal(await button("Back to workflow").isDisabled(), true);
  await finished();
  await button("Back to workflow").click();
  const controls = await checks.checkManual({ page, qa, send, read, capture });
  await button("Saved simulations").click();
  await partial().getByRole("heading", { name: "Stopped. No grade." }).waitFor();
  assert.equal((await read(`simulation-runs/${switchedId}`)).active, false);
  await button("Create another simulation").click();
  await send("Test the spouse asking for Morgan's refund.", "/api/simulation-author");
  const spouse = await save();
  await qa({ mode: "spouse" });
  const spouseId = await start();
  await finished();
  const noTools = await read(`simulation-runs/${spouseId}`);
  assert.equal(noTools.evidence.result.verdict, "pass");
  assert.deepEqual(noTools.evidence.result.trace, []);
  await latest()
    .getByText("No tool calls. Authorization boundary not exercised", { exact: false })
    .waitFor();
  await latest().getByRole("heading", { name: "Latest", exact: true }).scrollIntoViewIfNeeded();
  await capture("13-spouse-no-boundary-coverage-deterministic");
  await button("Open Owner confirmation and repeat").click();
  await partial().waitFor();
  const beforeRestart = (await qa({ restart: true })).modelCalls;
  await page.reload();
  await latest().waitFor();
  await page.getByText("Run unavailable after eviction or restart.", { exact: false }).waitFor();
  assert.equal((await qa({})).modelCalls, beforeRestart);
  await partial().waitFor({ state: "hidden" });
  await capture("11-missing-session-results-preserved-deterministic");
  await qa({ mode: "early" });
  const earlyId = await start();
  await finished();
  const early = await read(`simulation-runs/${earlyId}`);
  assert.equal(early.evidence.result.verdict, "not-exercised");
  await latest().getByText("Selected business outcome: Not exercised.", { exact: false }).waitFor();
  await latest().getByRole("heading", { name: "Latest", exact: true }).scrollIntoViewIfNeeded();
  await capture("14-not-exercised-deterministic");
  const interrupted = await checks.checkReload(page, qa, start, finished, read);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(logs, "browser-evidence.json"),
    JSON.stringify(
      {
        definitions: [owner, spouse],
        runs: [
          first,
          reviewed,
          second,
          failed,
          cancelled,
          timedOut,
          unsaved,
          savedOnly,
          noTools,
          early,
          interrupted,
        ],
        controls,
        errors,
        http: await qa({}),
      },
      null,
      2,
    ),
  );
  await context.storageState({ path: path.join(logs, "browser-state.json") });
  process.stdout.write(
    "PASS author/save/run/stream/inspect/review/rerun/compare, fresh invoices, reload without POST, narrow evidence, raw JSON keyboard scroll, actor error, stop, provider timeout, save-only retry, revision mismatch, view-change cancellation and restart recovery. Deterministic external transport; real HTTP/executor/disposable D1.\n",
  );
} finally {
  await browser.close();
}
