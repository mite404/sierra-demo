import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { arg, launch } from "./harness.mjs";

const base = arg("--base", "http://127.0.0.1:8790");
const out = path.resolve(arg("--out", ".amp/in/artifacts/eth93"));
const logs = path.resolve(arg("--logs", "/tmp/eth93-logs"));
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
const capture = (name) =>
  page.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled", fullPage: true });
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
    (item) => item.url().endsWith(endpoint) && item.request().method() === "POST",
  );
  const composer = current().getByRole("textbox", { name: "Message", exact: true });
  await composer.fill(text);
  await composer.press("Enter");
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
  await button("Run simulation").waitFor();
  return saved.json();
};
const start = async (name = "Run selected simulation", definitionId) => {
  const response = page.waitForResponse(
    (item) => item.url().endsWith("/api/simulation-runs") && item.request().method() === "POST",
  );
  await button(name).click();
  const received = await response;
  assert.equal(received.status(), 200);
  const body = received.request().postDataJSON();
  assert.deepEqual(Object.keys(body).toSorted(), ["definitionId", "expectedRevision", "startId"]);
  if (definitionId !== undefined) assert.equal(body.definitionId, definitionId);
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
const conversationTop = async () => {
  await page.getByRole("region", { name: "Scenario conversation and results" }).focus();
  await page.keyboard.press("Home");
  await page.waitForFunction(() => document.querySelector(".lab-run-scroll").scrollTop === 0);
};
const geometry = () =>
  page.locator(".lab-pinned-summary").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const separator = element.nextElementSibling.getBoundingClientRect();
    return {
      top: rect.top + scrollY,
      bottom: rect.bottom + scrollY,
      separator: separator.top + scrollY,
    };
  });
try {
  await qa({ mode: "owner", delay: 5, failSave: false });
  await page.goto(base);
  await button("Accept workflow").waitFor();
  const lockedSidebar = current().getByRole("complementary", { name: "Simulation scenarios" });
  assert.equal(await lockedSidebar.getByRole("button").count(), 7);
  for (const control of await lockedSidebar.getByRole("button").all())
    assert.equal(await control.isDisabled(), true);
  const beforeLocked = (await qa({})).modelCalls;
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  assert.equal((await qa({})).modelCalls, beforeLocked);
  await capture("01-first-use-locked");
  await send("Help me set up a refund workflow.", "/api/workflow");
  assert.equal(await button("Accept workflow").isDisabled(), true);
  assert.equal(
    await lockedSidebar
      .getByRole("button", { name: "Run selected simulation", exact: true })
      .isDisabled(),
    true,
  );
  await capture("02-clarification-locked");
  const choices = current().getByRole("radiogroup", {
    name: "How should your team handle refunds?",
  });
  assert.equal(await choices.getByRole("radio").count(), 5);
  const composerBounds = await current()
    .getByRole("textbox", { name: "Message", exact: true })
    .boundingBox();
  assert.ok(
    composerBounds && composerBounds.y + composerBounds.height <= 1000,
    "Question card must leave the composer in the viewport",
  );
  const questionReloadCalls = (await qa({})).modelCalls;
  await page.reload();
  await choices.waitFor();
  assert.equal(
    (await qa({})).modelCalls,
    questionReloadCalls,
    "Reload restores the question without resubmitting",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const questionBounds = await current()
    .locator(".dock-overlay")
    .evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      titleBottom: element
        .closest(".thread-panel")
        .querySelector(".thread-header")
        .getBoundingClientRect().bottom,
      scrollable: element.scrollHeight > element.clientHeight,
    }));
  assert.ok(questionBounds.top >= questionBounds.titleBottom);
  assert.ok(questionBounds.scrollable, "Tall questions remain scrollable above the composer");
  await choices.getByRole("radio", { name: /Brief replies, confirm first/u }).click();
  await choices.getByRole("radio", { name: /Warm replies, confirm first/u }).click();
  const answered = page.waitForResponse(
    (item) => item.url().endsWith("/api/workflow") && item.request().method() === "POST",
  );
  await button("Submit").click();
  assert.equal((await answered).status(), 200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await button("Stop").waitFor({ state: "hidden" });
  await choices.waitFor({ state: "hidden" });
  await current().getByRole("heading", { name: "Your refund workflow", exact: true }).waitFor();
  assert.equal((await current().locator(".quiet-prose strong").count()) > 0, true);
  await page.reload();
  await current().getByRole("heading", { name: "Your refund workflow", exact: true }).waitFor();
  assert.equal(await button("Accept workflow").isEnabled(), true);
  assert.equal(await button("Saved simulations").isDisabled(), true);
  await capture("03-proposal-unaccepted");
  await button("Accept workflow").click();
  const dialog = page.getByRole("dialog", { name: "Create your first test scenario" });
  await dialog.waitFor();
  assert.deepEqual(await dialog.getByLabel("Device type").locator("option").allTextContents(), [
    "Desktop web",
  ]);
  assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
  await capture("04-accepted-invitation");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await button("Workflow accepted").isVisible(), true);
  await page.reload();
  await button("Workflow accepted").waitFor();
  assert.equal(await dialog.count(), 0);
  await button("Create simulation").click();
  const callsBeforeExample = (await qa({})).modelCalls;
  await button("Owner confirm + repeat").click();
  assert.equal((await qa({})).modelCalls, callsBeforeExample);
  await capture("05-authoring");
  await send(
    "Test the owner. Request a refund, confirm, then ask for it again.",
    "/api/simulation-author",
  );
  const owner = await save();
  assert.deepEqual(
    await current()
      .locator(".lab-library-item:has(.lab-library-name)")
      .first()
      .evaluate((row) => {
        const name = getComputedStyle(row.querySelector(".lab-library-name"));
        const status = getComputedStyle(row.querySelector(".lab-muted"));
        return {
          gap: getComputedStyle(row).rowGap,
          nameSize: name.fontSize,
          statusSize: status.fontSize,
          statusMargin: status.margin,
          statusLineHeight: status.lineHeight,
        };
      }),
    {
      gap: "2px",
      nameSize: "13px",
      statusSize: "12px",
      statusMargin: "0px",
      statusLineHeight: "16px",
    },
  );
  await page.waitForFunction(() => document.fonts.check('13px "JetBrains Mono"'));
  const instructions = page.locator(".lab-saved-instructions");
  assert.match(
    await instructions.evaluate((element) => getComputedStyle(element).fontFamily),
    /JetBrains Mono/u,
  );
  for (const selector of [
    ".lab-definition h2",
    ".lab-definition li",
    ".lab-device",
    ".lab-run-controls",
    ".lab-header",
  ]) {
    assert.doesNotMatch(
      await page
        .locator(selector)
        .last()
        .evaluate((element) => getComputedStyle(element).fontFamily),
      /JetBrains Mono/u,
    );
  }
  assert.equal(await page.locator(".lab-device svg").count(), 1);
  await button("Run selected simulation").waitFor({ state: "visible" });
  await capture("06-saved-ready");
  await qa({ delay: 80 });
  const firstId = await start("Run selected simulation", owner.id);
  assert.equal(await button("Rerun selected simulation").isDisabled(), true);
  assert.equal(await button("Back to workflow").isDisabled(), true);
  assert.equal(await button("Edit in chat").isDisabled(), true);
  await page.getByText("Support agent", { exact: true }).first().waitFor();
  const pinned = await geometry();
  await capture("07-running");
  await finished();
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
  await page
    .getByRole("heading", { name: "Business checks passed · human review pending", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Automated execution JSON" }).count(), 0);
  const scroll = page.getByRole("region", { name: "Scenario conversation and results" });
  await scroll.focus();
  await page.keyboard.press("End");
  await page.waitForFunction(() => document.querySelector(".lab-run-scroll").scrollTop > 0);
  assert.deepEqual(await geometry(), pinned);
  await conversationTop();
  await capture("08-completed-conversation");
  await button("Business checks and execution JSON").click();
  await page.getByRole("textbox", { name: "Automated execution JSON" }).waitFor();
  assert.equal(await page.getByText("Refunded $0.00 → $42.00", { exact: true }).count(), 1);
  await capture("09-execution-disclosure");
  await button("Business checks and execution JSON").click();
  await page.emulateMedia({ colorScheme: "dark" });
  await conversationTop();
  await capture("10-dark-conversation");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(
    await page
      .locator(".lab-pinned-summary")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
    true,
    "Full representative summary fits without clipping",
  );
  const narrowPinned = await geometry();
  await scroll.focus();
  await page.keyboard.press("End");
  await page.waitForFunction(() => document.querySelector(".lab-run-scroll").scrollTop > 0);
  assert.deepEqual(await geometry(), narrowPinned);
  await capture("11b-narrow-scrolled");
  await conversationTop();
  await capture("11-narrow-dark");
  await page.emulateMedia({ colorScheme: "light" });
  await capture("12-narrow-light");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await button("Human wording review").click();
  await page.getByLabel("Your assessment").selectOption("needs-improvement");
  await page
    .getByLabel("Optional review note")
    .fill("Check the wording independently of payment checks.");
  await button("Save human review").click();
  await page
    .getByRole("heading", { name: "Business checks passed · needs improvement", exact: true })
    .waitFor();
  assert.deepEqual((await read(`simulation-runs/${firstId}`)).evidence, first.evidence);
  await qa({ delay: 5 });
  const secondId = await start("Rerun selected simulation", owner.id);
  assert.notEqual(secondId, firstId);
  await finished();
  const second = await read(`simulation-runs/${secondId}`);
  assert.deepEqual(
    second.evidence.result.before.map((invoice) => invoice.refundedCents),
    [0, 0],
  );
  const beforeReload = (await qa({})).modelCalls;
  await page.reload();
  await button("Run again").waitFor();
  assert.equal((await qa({})).modelCalls, beforeReload);
  await button("Search simulations").click();
  const search = current().getByLabel("Search saved simulation names");
  await search.fill("not-a-scenario");
  assert.equal(await button(`Open ${owner.definition.name}`).count(), 0);
  await search.fill("owner");
  await page.locator('.lab-library-item[aria-current="page"]').focus();
  await page.keyboard.press("Enter");
  await button("Agent settings").click();
  await page.getByRole("region", { name: "Accepted agent settings" }).waitFor();
  for (const [mode, heading] of [
    ["error", "Execution error. No grade."],
    ["hold", "Stopped. No grade."],
    ["timeout", "Time limit reached. No grade."],
    ["early", "Checks not exercised · human review pending"],
  ]) {
    await qa({ mode });
    const id = await start();
    if (mode === "hold") await button("Stop").click();
    await finished();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    const run = await read(`simulation-runs/${id}`);
    if (mode !== "early") assert.equal(run.evidence.result.verdict, null);
    await conversationTop();
    await capture(`13-${mode}`);
  }
  await qa({ mode: "owner", failSave: true });
  const unsavedId = await start();
  await finished();
  assert.equal(await button("Run selected simulation").isDisabled(), true);
  const beforeSave = (await qa({ failSave: false })).modelCalls;
  await button("Retry save only").click();
  await button("Retry save only").waitFor({ state: "hidden" });
  assert.equal((await read(`simulation-runs/${unsavedId}`)).persistence, "saved");
  assert.equal((await qa({})).modelCalls, beforeSave);
  await button("Create another simulation").click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Describe a test scenario", exact: true }).click();
  await send("Test the spouse asking for Morgan's refund.", "/api/simulation-author");
  const spouse = await save();
  await qa({ mode: "spouse" });
  const spouseId = await start("Run selected simulation", spouse.id);
  await finished();
  const noTools = await read(`simulation-runs/${spouseId}`);
  assert.deepEqual(noTools.evidence.result.trace, []);
  assert.deepEqual(
    noTools.evidence.result.after.map((invoice) => invoice.refundedCents),
    [0, 0],
  );
  await button("Business checks and execution JSON").click();
  await page
    .getByText("No tool calls. Authorization boundary not exercised", { exact: false })
    .waitFor();
  await conversationTop();
  await capture("14-spouse-no-tool-coverage");
  await context.storageState({ path: path.join(logs, "browser-state.json") });
  await button("Back to workflow").click();
  await button("New workflow").click();
  await button("Accept workflow").waitFor();
  assert.equal(await button("Saved simulations").isDisabled(), true);
  assert.equal(
    await lockedSidebar
      .getByRole("button", { name: "Run selected simulation", exact: true })
      .isDisabled(),
    true,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(logs, "browser-evidence.json"),
    JSON.stringify({ owner, first, second, errors, http: await qa({}) }, null, 2),
  );
  process.stdout.write(
    "PASS first-use/clarification/proposal gating, accessible acceptance modal + Escape + recovery, draft/save, Desktop web only, instruction-only JetBrains Mono, selected toolbar play/rerun, busy/unsaved locks, streamed conversation, pinned summary/separator under keyboard scrolling, real payment evidence, disclosures, search/settings, dark/light/narrow, error/stop/timeout/not-exercised, save-only retry and new-workflow gating. Deterministic external transport; real HTTP/executor/disposable D1.\n",
  );
} finally {
  await browser.close();
}
