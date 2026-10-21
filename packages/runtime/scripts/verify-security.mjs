/// <reference types="node" />
// oxlint-disable no-console -- this executable reports verification results
// oxlint-disable no-await-in-loop -- each navigation replaces the same page
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { observeCsp } from "./observe-csp.mjs";

const origin = process.argv[2];
assert.ok(origin, "Pass the URL of the built app served by Wrangler");
const sharedCard = Buffer.from(
  JSON.stringify({
    v: 1,
    kind: "catalog",
    payload: {
      catalogVersion: "1",
      component: "DataTable",
      props: {
        title: "Security check",
        source: "Verification",
        unit: "USD",
        variant: "audit",
        rows: [
          { label: "North", value: 7 },
          { label: "South", value: 13 },
        ],
      },
    },
  }),
).toString("base64url");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = { page: [], console: [] };
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  const { violations, workers } = await observeCsp(page);
  for (const route of [
    "/share.html",
    `/share.html#c=${sharedCard}`,
    "/?scenario=demo",
    "/",
    "/t/playground",
  ]) {
    await page.goto("about:blank");
    const response = await page.goto(new URL(route, origin).href);
    assert.equal(response.status(), 200);
    const headers = response.headers();
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
    assert.equal(headers["permissions-policy"], "camera=(), geolocation=(), microphone=(self)");
    const policy = headers["content-security-policy"];
    const scriptPolicy = policy.split(";").find((part) => part.trim().startsWith("script-src "));
    assert.ok(scriptPolicy.includes("'wasm-unsafe-eval'"));
    assert.ok(!scriptPolicy.includes("'unsafe-eval'"));
    assert.ok(!scriptPolicy.includes("'unsafe-inline'"));
    for (const directive of [
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ]) {
      assert.ok(policy.includes(directive));
    }
    const html = await response.text();
    const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
      (match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
    );
    assert.ok(hashes.length > 0);
    for (const hash of hashes)
      assert.ok(scriptPolicy.includes(hash), `Unpinned inline script ${hash}`);
    if (route === "/share.html") {
      await page.getByRole("heading", { name: "This link doesn’t contain a card." }).waitFor();
    } else if (route.startsWith("/share.html#")) {
      await page.getByText("Security check", { exact: true }).waitFor();
      await page.getByRole("cell", { name: "13", exact: true }).waitFor();
    } else {
      await page.getByRole("textbox", { name: "Message", exact: true }).waitFor();
      assert.ok(workers.length > 0, "The runtime worker must be instrumented");
    }
    assert.deepEqual(violations, [], `${route} page or worker CSP violations`);
    assert.deepEqual(errors, { page: [], console: [] }, `${route} browser errors`);
    console.log(
      `${route.split("#")[0]}: security headers, ${hashes.length} inline hashes, hydration and CSP passed`,
    );
  }
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Check the secured runtime");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const reply =
    "Noted. In the lab I answer from a script, so a real agent would take it from here.";
  await page.getByText(reply, { exact: true }).waitFor();
  assert.deepEqual(violations, [], "Message round-trip page or worker CSP violations");
  const workersBeforeReload = workers.length;
  await page.reload();
  await page.getByText(reply, { exact: true }).waitFor();
  assert.ok(workers.length > workersBeforeReload, "The reloaded worker must be instrumented");
  assert.deepEqual(violations, [], "Page or worker CSP violations retained across reload");
  assert.deepEqual(errors, { page: [], console: [] }, "Runtime browser errors");
  console.log("SQLite worker: message, streamed lab reply and persisted reload passed");
} finally {
  await browser.close();
}
