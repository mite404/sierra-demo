import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { arg, launch } from "./harness.mjs";
import { verifyShell, verifyShellSizes } from "./simulation-shell-check.mjs";
import { writeSimulationCoverage } from "./simulation-coverage.mjs";

const base = arg("--base", "http://127.0.0.1:8790");
const out = path.resolve(arg("--out", ".amp/in/artifacts/journey-deterministic"));
const logs = path.resolve(arg("--logs", "/tmp/journey-deterministic-logs"));
const coverage = arg("--coverage");
await Promise.all([mkdir(out, { recursive: true }), mkdir(logs, { recursive: true })]);
const browser = await launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
if (coverage) await page.coverage.startJSCoverage({ resetOnNavigation: false });
const coverageEntries = [];
const collectCoverage = async () => {
  if (!coverage) return;
  coverageEntries.push(...(await page.coverage.stopJSCoverage()));
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
};
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const current = () => page.locator(".simulation-lab:visible");
const button = (name) => current().getByRole("button", { name, exact: true });
const rows = () => current().locator(".lab-library-item");
const configured = () => current().locator(".lab-author-review [data-check-id]");
const proposal = () => page.getByRole("dialog", { name: "Review simulation", exact: true });
const contact = () =>
  page.getByRole("dialog", {
    name: "Confirm to contact a customer experience representative",
    exact: true,
  });
const capture = async (name) => {
  await collectCoverage();
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled" });
};
const qa = async (settings = {}) => {
  const response = await page.request.post(`${base}/__qa`, { data: settings });
  assert.equal(response.status(), 200);
  return response.json();
};
const read = async (endpoint) => {
  const response = await page.request.get(`${base}/api/${endpoint}`);
  assert.equal(response.status(), 200);
  return response.json();
};
const reload = async () => {
  await collectCoverage();
  await page.reload();
};
const send = async (text) => {
  const response = page.waitForResponse(
    (item) => item.url().endsWith("/api/simulation-author") && item.request().method() === "POST",
  );
  const composer = current().getByRole("textbox", { name: "Message", exact: true });
  await composer.fill(text);
  await composer.press("Enter");
  assert.equal((await response).status(), 200);
  await button("Stop").waitFor({ state: "hidden" });
};
const next = async () => {
  await button("Create next simulation").first().click();
  await button("Start with a refund workflow").waitFor();
};
const save = async () => {
  const response = page.waitForResponse((item) =>
    /\/simulation-drafts\/[^/]+\/save$/u.test(item.url()),
  );
  await proposal().getByRole("button", { name: "Create simulation", exact: true }).click();
  const received = await response;
  assert.equal(received.status(), 201);
  assert.deepEqual(received.request().postDataJSON(), { expectedRevision: 0 });
  await proposal().waitFor({ state: "hidden" });
  await button("Run selected simulation").waitFor();
  assert.equal(await button("Run simulation").count(), 0);
  return received.json();
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
  if (definitionId) assert.equal(body.definitionId, definitionId);
  return body.startId;
};
const results = () => page.getByRole("dialog", { name: /Simulation (complete|incomplete)/u });
const finished = async () => {
  await button("Stop").waitFor({ state: "hidden", timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector(".lab-run-controls output")?.textContent ===
      "Ready. No automatic run.",
    undefined,
    { timeout: 60000 },
  );
  await results().waitFor();
  await dismissResults();
  assert.equal(await results().isVisible(), false);
};
const inspectResults = async () => {
  await button("View results").click();
  await results().waitFor();
  assert.doesNotMatch(await results().innerText(), /Human wording review|human review pending/iu);
  for (const selector of [".lab-pinned-summary", ".lab-run-scroll"])
    assert.equal(
      await page.locator(selector).evaluate((element) => getComputedStyle(element).filter),
      "blur(2px)",
    );
  assert.equal(
    await page
      .locator(".lab-run-transcript")
      .first()
      .evaluate((element) => element.inert),
    true,
  );
};
const dismissResults = async () => {
  await results().getByRole("button", { name: "View conversation", exact: true }).click();
  await results().waitFor({ state: "hidden" });
  assert.equal(await contact().count(), 0, "Dismissing results never opens a contact popup");
  assert.equal(
    await page
      .locator(".lab-run-transcript")
      .first()
      .evaluate((element) => element.inert),
    false,
  );
};
const ownerStory =
  "Owner story complete. The verified owner requests an eligible refund, confirms when asked, and asks again after success. Refund once, ask confirmation first, and reject the duplicate helpfully.";

try {
  await qa({ mode: "owner", delay: 5, failSave: false });
  await page.goto(base);
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
  });
  await page.reload();
  await button("Start with a refund workflow").waitFor();
  assert.equal(
    await button("Start with a refund workflow").evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
    "play-callout",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const starterRing = await button("Start with a refund workflow").evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    shadow: getComputedStyle(element).boxShadow,
  }));
  assert.equal(starterRing.animation, "none");
  assert.match(starterRing.shadow, /0px 0px 0px 3px/u);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await verifyShellSizes(page);
  for (const name of [
    "Accept workflow",
    "Save simulation",
    "Spouse pressure",
    "Owner confirm + repeat",
  ])
    assert.equal(await button(name).count(), 0);
  assert.equal(await rows().count(), 0);
  assert.equal(await configured().count(), 0);
  assert.equal(await button("Run selected simulation").isDisabled(), true);
  assert.equal(await button("Run selected simulation").getAttribute("data-callout"), null);
  assert.equal(await button("Reset demo").count(), 0, "An empty library has nothing to reset");
  await button("Start with a refund workflow").click();
  assert.equal(
    await current().getByRole("textbox", { name: "Message", exact: true }).inputValue(),
    "Help our team handle subscription refunds.",
  );
  assert.equal((await qa()).modelCalls, 0);
  await capture("01-empty-author");
  await send("Help our team handle subscription refunds.");
  assert.equal(await configured().count(), 0);
  assert.equal(await proposal().count(), 0);
  assert.equal(await rows().count(), 0);
  assert.match(await current().innerText(), /What should happen for the customer/u);
  await send("The account owner asks for an eligible refund and should get one full refund.");
  assert.equal(await configured().count(), 1);
  assert.equal(await current().locator(".lab-author-review .lab-configured-dot").count(), 1);
  await send("Ask the owner to confirm before refunding.");
  assert.equal(await configured().count(), 2);
  await capture("02-progressive-expectations");
  const callsBeforeReload = (await qa()).modelCalls;
  await reload();
  await configured().nth(1).waitFor();
  assert.equal((await qa()).modelCalls, callsBeforeReload, "Recovery reads without replay");
  await send("Correction: keep only the owner refund expectation for now.");
  assert.equal(await configured().count(), 1, "Correction retracts the old expectation");
  assert.equal(await current().locator('[data-check-id="confirmation-before-refund"]').count(), 0);
  await qa({ mode: "author-error" });
  await send("Continue the story.");
  assert.equal(await configured().count(), 0);
  assert.equal(await proposal().count(), 0);
  await current().getByRole("alert").filter({ hasText: "Authoring incomplete" }).waitFor();
  await next();
  await qa({ mode: "owner" });
  await send("The account owner should receive their eligible refund.");
  assert.equal(await configured().count(), 1);
  await qa({ mode: "author-hold" });
  const composer = current().getByRole("textbox", { name: "Message", exact: true });
  const heldAuthor = page.waitForResponse(
    (item) => item.url().endsWith("/api/simulation-author") && item.request().method() === "POST",
  );
  await composer.fill("Continue the customer story.");
  await composer.press("Enter");
  assert.equal((await heldAuthor).status(), 200);
  await button("Stop").click();
  await button("Stop").waitFor({ state: "hidden" });
  assert.equal(await configured().count(), 0);
  const cancelledCalls = (await qa()).modelCalls;
  await reload();
  await current().getByRole("alert").filter({ hasText: "interrupted" }).waitFor();
  assert.equal((await qa()).modelCalls, cancelledCalls);
  await next();
  await qa({ mode: "owner" });
  await send(ownerStory);
  await proposal().waitFor();
  assert.equal(await proposal().locator("[data-check-id]").count(), 3);
  assert.match(await proposal().innerText(), /User instructions/u);
  assert.match(await proposal().innerText(), /Desktop web/u);
  assert.equal(await page.locator(".lab-conversation").evaluate((element) => element.inert), true);
  assert.equal(
    await page.locator(".lab-sidebar").evaluate((element) => getComputedStyle(element).filter),
    "blur(2px)",
    "The proposal also blurs the simulations panel",
  );
  assert.equal(
    await page.locator(".lab-conversation").evaluate((element) => getComputedStyle(element).filter),
    "blur(2px)",
  );
  assert.equal(
    await page
      .locator(".lab-author-review")
      .evaluate((element) => getComputedStyle(element).filter),
    "none",
    "Summary keeps the expectations panel divider sharp",
  );
  assert.equal(await rows().count(), 0);
  assert.deepEqual(await read("simulation-definitions"), []);
  await capture("03-complete-summary-before-create");
  assert.equal(
    await proposal().evaluate((element) => element.contains(document.activeElement)),
    true,
    "Summary receives keyboard focus",
  );
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    for (const width of [390, 800, 801, 1024, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      const summary = await proposal().boundingBox();
      assert.ok(summary.x >= 16 && summary.x + summary.width <= width - 16);
      const textMeasure = await proposal().evaluate((element) => {
        const canvas = document.createElement("canvas");
        const drawing = canvas.getContext("2d");
        const style = getComputedStyle(element);
        drawing.font = `${style.fontSize} ${style.fontFamily}`;
        return drawing.measureText("0").width * 50;
      });
      assert.ok(
        summary.width <= textMeasure + 54,
        "Summary caps text at 50ch plus content padding",
      );
      for (const name of ["Create simulation", "Revise in chat"]) {
        const action = proposal().getByRole("button", { name, exact: true });
        await action.scrollIntoViewIfNeeded();
        const bounds = await action.boundingBox();
        assert.ok(
          bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= width &&
            bounds.y + bounds.height <= 720,
          `${name} is reachable at ${width}px in ${colorScheme}`,
        );
      }
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press("Escape");
  await proposal().waitFor({ state: "hidden" });
  assert.deepEqual(await read("simulation-definitions"), []);
  const reviewButton = await button("Review simulation summary").boundingBox();
  const conversationBounds = await current().locator(".lab-conversation").boundingBox();
  assert.ok(reviewButton.width < conversationBounds.width * 0.8, "Summary action fits its label");
  await capture("03-summary-dismissed");
  await button("Review simulation summary").click();
  const proposalCalls = (await qa()).modelCalls;
  await proposal().getByRole("button", { name: "Revise in chat", exact: true }).click();
  await proposal().waitFor({ state: "hidden" });
  assert.deepEqual(
    await read("simulation-definitions"),
    [],
    "Revise returns to authoring without saving a simulation",
  );
  assert.equal(await rows().count(), 0);
  assert.equal((await qa()).modelCalls, proposalCalls);
  await send(ownerStory);
  const owner = await save();
  assert.deepEqual(owner.workflow.config, { tone: "warm", approval: "confirm" });
  await button(`Open ${owner.definition.name}`).waitFor();
  assert.equal(await rows().count(), 1);
  assert.equal(await rows().locator(".lab-run-passed").count(), 0);
  assert.equal(await current().getByRole("region", { name: "Subscription refunds" }).count(), 1);
  assert.equal(
    (await qa()).requests.some((item) => item.path.startsWith("/api/workflow")),
    false,
  );
  await verifyShellSizes(page);
  const summary = page.locator(".lab-pinned-summary");
  assert.equal(
    await summary.locator(".lab-saved-instructions").innerText(),
    owner.definition.instructions,
  );
  assert.equal(await summary.locator(".lab-configured-dot").count(), 3);
  assert.match(
    await summary
      .locator(".lab-saved-instructions")
      .evaluate((element) => getComputedStyle(element).fontFamily),
    /JetBrains Mono/u,
  );
  assert.equal(await page.locator('.lab-goal[data-status="not-run"]').count(), 3);
  await page.locator(".lab-library-toolbar [data-callout]").waitFor();
  assert.equal(await button("Reset demo").count(), 1);
  assert.equal(
    await current()
      .locator(".lab-sidebar button")
      .filter({ hasText: /^Reset demo$/u })
      .count(),
    1,
  );
  const resetBounds = await button("Reset demo").boundingBox();
  const savedBounds = await rows().first().boundingBox();
  assert.ok(resetBounds.y >= savedBounds.y + savedBounds.height, "Reset follows saved simulations");
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const ring = await button("Run selected simulation").evaluate((element) => ({
      animation: getComputedStyle(element).animationName,
      shadow: getComputedStyle(element).boxShadow,
    }));
    assert.equal(ring.animation, "none");
    assert.match(ring.shadow, /0px 0px 0px 3px/u, "Reduced motion retains a static readiness ring");
    await capture(`04-ready-${colorScheme}`);
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  assert.equal(
    await button("Run selected simulation").evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
    "play-callout",
  );
  await capture("04-created-not-run");
  await qa({ delay: 80 });
  const firstId = await start("Run selected simulation", owner.id);
  assert.equal(await button("Run selected simulation").getAttribute("data-callout"), null);
  assert.equal(await button("Rerun selected simulation").isDisabled(), true);
  assert.equal(await button("Create next simulation").isDisabled(), true);
  assert.equal(await button("Edit in chat").isDisabled(), true);
  assert.equal(await button("Reset demo").isDisabled(), true);
  assert.equal(await rows().locator(".lab-run-passed").count(), 0);
  await page.getByText("Support agent", { exact: true }).first().waitFor();
  const pinned = await summary.boundingBox();
  const scroll = page.getByRole("region", { name: "Scenario conversation and results" });
  await scroll.focus();
  await page.keyboard.press("End");
  assert.deepEqual(await summary.boundingBox(), pinned);
  await capture("05-running");
  await finished();
  assert.equal(await button("Run selected simulation").getAttribute("data-callout"), null);
  const first = await read(`simulation-runs/${firstId}`);
  assert.equal(first.evidence.result.verdict, "pass");
  assert.deepEqual(
    first.evidence.result.trace.map((entry) => entry.outcome),
    ["confirmation_required", "refunded", "already_refunded"],
  );
  assert.deepEqual(
    first.evidence.result.after.map((invoice) => invoice.refundedCents),
    [5000, 0],
  );
  assert.equal(first.humanReview.status, "pending");
  assert.equal(await rows().locator(".lab-run-passed").count(), 1);
  const passedName = rows().filter({ hasText: owner.definition.name }).locator(".lab-library-name");
  assert.equal(await passedName.locator(".lab-run-passed circle").count(), 1);
  const nameBounds = await passedName.locator("span").boundingBox();
  const iconBounds = await passedName.locator(".lab-run-passed").boundingBox();
  assert.ok(iconBounds.x >= nameBounds.x + nameBounds.width, "Passing circle sits after the name");
  await inspectResults();
  assert.equal(await results().locator('.lab-goal[data-status="pass"]').count(), 3);
  const proofButton = results().getByRole("button", { name: "View Database Proof", exact: true });
  assert.equal(await proofButton.count(), 1, "Results offer direct access to database proof");
  const actionRows = await proofButton.evaluate((element) => ({
    proof: element.getBoundingClientRect().y,
    conversation: element.previousElementSibling.getBoundingClientRect().y,
  }));
  assert.equal(actionRows.proof, actionRows.conversation, "Proof sits beside View conversation");
  await proofButton.click();
  const proofDialog = page.getByRole("dialog", { name: "Database proof", exact: true });
  await proofDialog.waitFor();
  const proofJson = proofDialog.getByLabel("Automated execution JSON");
  const recorded = JSON.parse(await proofJson.innerText());
  assert.deepEqual(recorded, {
    account: { username: "morgan@example.com" },
    payment: {
      id: "pay_001",
      amount: "50.00",
      currency: "usd",
      payment_method: { id: "pm_visa_4242", CC_provider: "visa" },
    },
    before: { amount_refunded: "0.00", refund_count: 0, payment_method_id: null },
    after: { amount_refunded: "50.00", refund_count: 1, payment_method_id: "pm_visa_4242" },
    refund_attempts: [
      {
        turn: 1,
        authorization: "allowed",
        owner_confirmed: false,
        outcome: "confirmation_required",
      },
      { turn: 2, authorization: "allowed", owner_confirmed: true, outcome: "refunded" },
      { turn: 3, authorization: "allowed", owner_confirmed: false, outcome: "already_refunded" },
    ],
  });
  assert.equal(await proofJson.locator('[data-proof-path="after"]').count(), 1);
  assert.equal(await proofJson.locator("[data-mismatch-path]").count(), 0);
  await capture("06-database-proof");
  for (const width of [390, 800, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    const bounds = await proofDialog.boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= width &&
        bounds.y + bounds.height <= 720,
    );
    assert.equal(
      await proofDialog.getByRole("button", { name: "View conversation", exact: true }).isVisible(),
      true,
    );
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await proofDialog.getByRole("button", { name: "Back to results", exact: true }).click();
  await results().waitFor();
  await capture("06-real-completed-checks");
  for (const width of [390, 800, 801, 1024, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    const bounds = await results().boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= width &&
        bounds.y + bounds.height <= 720,
    );
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await dismissResults();
  await scroll.focus();
  await page.keyboard.press("Home");
  const customer = page.getByRole("article", { name: "Simulated customer", exact: true }).first();
  const support = page.getByRole("article", { name: "Support agent", exact: true }).first();
  assert.ok((await customer.boundingBox()).x > (await support.boundingBox()).x);
  assert.equal(
    await customer
      .locator(".user-bubble")
      .evaluate((element) => getComputedStyle(element).borderRadius),
    "12px",
  );
  assert.equal(await support.locator(".user-bubble").count(), 0);
  assert.equal(await support.locator(".quiet-prose").count(), 1);
  await button("Business checks and execution JSON").click();
  const json = page.locator('[aria-label="Automated execution JSON"]');
  const shown = JSON.parse(await json.innerText());
  assert.deepEqual(shown, recorded);
  assert.ok(await json.locator('[data-proof-path="after"]').count());
  assert.equal(await json.locator('[data-proof-path="refund_attempts.1"]').count(), 1);
  await capture("07-execution-evidence");
  await button("Business checks and execution JSON").click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(
    await summary.evaluate((element) => element.scrollHeight <= element.clientHeight),
    true,
    "Saved summary does not clip",
  );
  const narrowPinned = await summary.boundingBox();
  await scroll.focus();
  await page.keyboard.press("End");
  assert.deepEqual(await summary.boundingBox(), narrowPinned);
  await capture("08-narrow-dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.deepEqual((await read(`simulation-runs/${firstId}`)).evidence, first.evidence);
  await qa({ delay: 5 });
  const secondId = await start("Rerun selected simulation", owner.id);
  await finished();
  assert.notEqual(firstId, secondId);
  const second = await read(`simulation-runs/${secondId}`);
  assert.deepEqual(
    second.evidence.result.before.map((invoice) => invoice.refundedCents),
    [0, 0],
  );
  const beforeReload = (await qa()).modelCalls;
  await reload();
  await results().waitFor();
  await dismissResults();
  await button("View results").waitFor();
  assert.equal((await qa()).modelCalls, beforeReload);
  assert.equal(await rows().locator(".lab-run-passed").count(), 1);
  await button("Search simulations").click();
  const search = current().getByLabel("Search saved simulation names");
  await search.fill("not-a-scenario");
  assert.equal(await rows().count(), 0);
  await search.fill("customer requests");
  assert.equal(await rows().count(), 1);
  assert.equal(await button("Agent settings").getAttribute("aria-disabled"), "true");
  await button("Agent settings").hover();
  await page.locator('[data-slot="tooltip-content"]').filter({ hasText: "Out of scope" }).waitFor();
  for (const [mode, heading] of [
    ["error", "Execution error. No grade."],
    ["hold", "Stopped. No grade."],
    ["timeout", "Time limit reached. No grade."],
    ["early", "Checks not exercised"],
  ]) {
    await qa({ mode });
    const id = await start();
    if (mode === "hold") await button("Stop").click();
    await finished();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert.equal(await rows().locator(".lab-run-passed").count(), 0);
    const run = await read(`simulation-runs/${id}`);
    if (mode !== "early") assert.equal(run.evidence.result.verdict, null);
    await inspectResults();
    assert.equal(await results().locator('.lab-goal[data-status="pass"]').count(), 0);
    assert.equal(
      await results()
        .locator(`.lab-goal[data-status="${mode === "early" ? "not-exercised" : "incomplete"}"]`)
        .count(),
      3,
    );
    await capture(`09-${mode}`);
    await dismissResults();
  }
  await qa({ mode: "owner", failSave: true });
  const unsavedId = await start();
  await finished();
  assert.equal(await button("Run selected simulation").isDisabled(), true);
  const saveCalls = (await qa({ failSave: false })).modelCalls;
  await button("Retry save only").click();
  await button("Retry save only").waitFor({ state: "hidden" });
  assert.equal((await read(`simulation-runs/${unsavedId}`)).persistence, "saved");
  assert.equal((await qa()).modelCalls, saveCalls);
  await search.fill("");
  await next();
  await send(
    "Someone else asks for the owner's refund, claims permission after refusal, but must not access private account details or issue a refund. Ask the owner to sign in themselves. Include denied tool coverage.",
  );
  await proposal().waitFor();
  assert.equal(await rows().count(), 1, "A second proposal does not add a second sidebar record");
  assert.deepEqual(await read("simulation-definitions"), [owner]);
  const other = await save();
  await qa({ mode: "spouse" });
  const otherId = await start("Run selected simulation", other.id);
  await finished();
  const noTools = await read(`simulation-runs/${otherId}`);
  assert.deepEqual(noTools.evidence.result.trace, []);
  assert.deepEqual(
    noTools.evidence.result.after.map((invoice) => invoice.refundedCents),
    [0, 0],
  );
  assert.equal(noTools.evidence.result.verdict, "not-exercised");
  assert.equal(
    await rows().filter({ hasText: other.definition.name }).locator(".lab-run-passed").count(),
    0,
  );
  assert.equal(await contact().count(), 0);
  await inspectResults();
  assert.equal(await results().locator('.lab-goal[data-status="not-exercised"]').count(), 2);
  await results().getByRole("button", { name: "View Database Proof", exact: true }).click();
  const otherProof = page.getByRole("dialog", { name: "Database proof", exact: true });
  const otherJson = otherProof.getByLabel("Automated execution JSON");
  const deniedProof = JSON.parse(await otherJson.innerText());
  assert.deepEqual(deniedProof, {
    account: { username: "casey@example.com" },
    payment: {
      id: "pay_002",
      amount: "17.00",
      currency: "usd",
      payment_method: { id: "pm_amex_0005", CC_provider: "american_express" },
    },
    before: { amount_refunded: "0.00", refund_count: 0, payment_method_id: null },
    after: { amount_refunded: "0.00", refund_count: 0, payment_method_id: null },
    refund_attempts: [],
  });
  assert.equal(await otherJson.locator("[data-proof-path]").count(), 0);
  assert.doesNotMatch(await otherJson.innerText(), /morgan|visa|50\.00/u);
  await capture("10-casey-account-proof");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("10-casey-account-proof-dark-narrow");
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await otherProof.getByRole("button", { name: "View conversation", exact: true }).click();
  await inspectResults();
  await dismissResults();
  await capture("10-other-person-honest-tool-coverage");
  await qa({ restart: true, mode: "owner" });
  await reload();
  await button("Run selected simulation").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".lab-run-controls output")?.textContent ===
      "Ready. No automatic run.",
  );
  assert.equal(await button("Run selected simulation").isEnabled(), true);
  const recoveryCalls = (await qa()).modelCalls;
  await next();
  await send(ownerStory);
  const recovered = await save();
  assert.notEqual(recovered.id, other.id);
  assert.deepEqual(await read(`simulation-definitions/${other.id}`), other);
  assert.equal(
    (await qa()).modelCalls,
    recoveryCalls + 1,
    "Only the explicit new author message calls a model",
  );
  await verifyShell(page);
  await capture("11-recovered-library");
  const definitionsBeforeReset = await read("simulation-definitions");
  const callsBeforeReset = (await qa()).modelCalls;
  const reset = button("Reset demo");
  assert.equal(await reset.isEnabled(), true);
  await reset.click();
  const resetDialog = page.getByRole("dialog", { name: "Reset demo?", exact: true });
  await resetDialog.waitFor();
  await capture("12-reset-confirmation");
  await resetDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await read("simulation-definitions"), definitionsBeforeReset);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await reset.click();
  await resetDialog.waitFor();
  await capture("12-reset-confirmation-dark-narrow");
  await resetDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: "light" });
  await reset.click();
  await page.route("**/api/simulation-reset", (route) => route.fulfill({ status: 503 }));
  await resetDialog.getByRole("button", { name: "Reset demo", exact: true }).click();
  await resetDialog.getByRole("alert").waitFor();
  assert.deepEqual(await read("simulation-definitions"), definitionsBeforeReset);
  await page.unroute("**/api/simulation-reset");
  const resetResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/simulation-reset"),
  );
  await collectCoverage();
  await resetDialog.getByRole("button", { name: "Reset demo", exact: true }).click();
  assert.equal((await resetResponse).status(), 204);
  await button("Start with a refund workflow").waitFor();
  assert.equal(await rows().count(), 0);
  assert.deepEqual(await read("simulation-definitions"), []);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("sierra-simulation-session-v1")),
    null,
  );
  assert.equal((await qa()).modelCalls, callsBeforeReset, "Reset calls no model");
  assert.equal(await reset.count(), 0, "Reset disappears when the library is cleared");
  await capture("12-reset-clean-workspace");
  await qa({ restart: true });
  await reload();
  await button("Start with a refund workflow").waitFor();
  assert.equal(await rows().count(), 0, "Reset survives reload and server restart");
  for (const legacy of ["/lab", "/t/old-thread", "/playground", "/demo/weekly-brief/x"]) {
    await collectCoverage();
    await page.goto(`${base}${legacy}`);
    await page.waitForURL(`${base}/`);
    assert.equal(await page.locator("canvas, .shell, .browser-panel").count(), 0);
  }
  assert.deepEqual(errors, []);
  await context.storageState({ path: path.join(logs, "browser-state.json") });
  await writeFile(
    path.join(logs, "browser-evidence.json"),
    JSON.stringify({ owner, first, second, other, noTools, errors, http: await qa() }, null, 2),
  );
  if (coverage) {
    coverageEntries.push(...(await page.coverage.stopJSCoverage()));
    await writeSimulationCoverage(coverageEntries, coverage);
  }
  process.stdout.write(
    "PASS single author chat, empty library, progressive/retracted/restored expectations, author error/cancel recovery, complete summary blur/inert, explicit creation only, saved grouping, trailing circular completed run icons, duplicate rejection without contact popup, honest denied-tool coverage, frozen evidence, fresh reruns, failure statuses, save-only retry, shell/theme/narrow layout, search/settings and legacy redirects. Deterministic external model transport; real HTTP/executor/disposable D1.\n",
  );
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png"), animations: "disabled" });
  throw error;
} finally {
  await browser.close();
}
