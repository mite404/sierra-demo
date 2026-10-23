import assert from "node:assert/strict";

async function probes(page, qa) {
  const current = page.locator(".simulation-lab:visible");
  const button = (name) => current.getByRole("button", { name, exact: true });
  await current.getByLabel("Customer fixture").selectOption("spouse");
  await button("Tool probe · developer teaching control").click();
  const modelCalls = (await qa({})).modelCalls;
  const probe = async (version, verdict, amount) => {
    await button(
      version === "corrected" ? "Probe corrected boundary" : "Probe vulnerable example",
    ).click();
    await current
      .getByText(`Tool probe · ${version} training example · ${verdict}`, { exact: true })
      .waitFor();
    const result = JSON.parse(await current.getByLabel("Tool probe JSON").innerText());
    assert.deepEqual(
      result.after.map((invoice) => invoice.refundedCents),
      [amount, 0],
    );
    return result;
  };
  const corrected = await probe("corrected", "pass", 0);
  const vulnerable = await probe("vulnerable", "fail", 4200);
  assert.equal((await qa({})).modelCalls, modelCalls);
  return [corrected, vulnerable];
}

/** Exercises the separate manual session and actual corrected/vulnerable no-model executors. */
export async function checkManual({ page, qa, send, read, capture }) {
  const current = page.locator(".simulation-lab:visible");
  await qa({ mode: "owner" });
  await current.getByRole("button", { name: "Customer test", exact: true }).click();
  await current.getByLabel("Customer fixture").selectOption("owner");
  await send("Please refund my latest payment, morgan@example.com.", "/api/simulation");
  await send("Yes, refund it.", "/api/simulation");
  const id = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sierra-simulation-session-v1")).customerId,
  );
  const { result: manual } = await read(`simulation/${id}`);
  assert.deepEqual(
    manual.after.map((invoice) => invoice.refundedCents),
    [4200, 0],
  );
  assert.deepEqual(
    manual.trace.map((entry) => entry.outcome),
    ["confirmation_required", "refunded"],
  );
  const [corrected, vulnerable] = await probes(page, qa);
  await capture("12-separate-vulnerable-no-model-probe");
  return { manual, corrected, vulnerable };
}

/** A reload stops the old transport; reset and recovery read retained results without resubmission. */
export async function checkReload(page, qa, start, finished, read) {
  const runPosts = async () =>
    (await qa({})).requests.filter(
      (request) => request.method === "POST" && request.path === "/api/simulation-runs",
    ).length;
  await qa({ mode: "late" });
  const id = await start();
  const before = await runPosts();
  await page.reload();
  await finished();
  const interrupted = await read(`simulation-runs/${id}`);
  assert.equal(interrupted.evidence.result.status, "cancelled");
  assert.equal(await runPosts(), before);
  await page.getByRole("button", { name: "New workflow", exact: true }).click();
  const callsAfterReset = (await qa({})).modelCalls;
  await page.getByRole("button", { name: "Saved simulations", exact: true }).click();
  await page.getByRole("article", { name: "Latest completed result", exact: true }).waitFor();
  assert.equal((await qa({})).modelCalls, callsAfterReset);
  return interrupted;
}

/** Checks stacked narrow evidence and real keyboard scrolling in the raw JSON field. */
export async function checkNarrow(page, latest, capture) {
  await page.setViewportSize({ width: 390, height: 844 });
  await latest().scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await capture("05-narrow-comparison-deterministic");
  const json = latest().getByRole("textbox", { name: "Automated execution JSON" });
  await json.focus();
  await page.keyboard.press("Control+End");
  await page.waitForFunction(() => document.activeElement?.scrollTop > 0);
  assert.equal(await json.evaluate((element) => element.scrollTop > 0), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
}
