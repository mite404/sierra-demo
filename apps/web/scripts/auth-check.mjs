#!/usr/bin/env node
// Prove the sign-in gate: a signed-out visit to a protected route leaves for WorkOS's hosted
// sign-in, the public routes stay reachable, and the callback route exists.
//
//   VITE_AUTH=workos VITE_WORKOS_CLIENT_ID=... VITE_WORKOS_REDIRECT_URI=http://localhost:5173/callback \
//     pnpm --filter web exec react-router dev --port 5174   # in one terminal
//   node apps/web/scripts/auth-check.mjs [--base http://127.0.0.1:5174] [--out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arg, chromium, ROOT } from "./harness.mjs";

const BASE = arg("--base", "http://127.0.0.1:5174");
const OUT = arg("--out", path.join(ROOT, ".artifacts/web/auth"));
mkdirSync(OUT, { recursive: true });

const results = [];
function record(step, ok, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${step}${detail ? ` · ${detail}` : ""}`);
}
// The client id is public by design (it travels in the browser's URL bar), but the log stays
// tidy without it.
const redact = (url) => url.replace(/client_id=[^&]+/, "client_id=<id>");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  // Warm the dev server's dependency optimizer once, as in web-check.mjs.
  await page.goto(`${BASE}/share.html`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(4000);

  const leaving = page.waitForRequest(
    (request) => request.isNavigationRequest() && !request.url().startsWith(BASE),
    { timeout: 20_000 },
  );
  await page.goto(`${BASE}/`).catch(() => {});
  const request = await leaving;
  const url = new URL(request.url());
  const hosted = url.hostname.endsWith("workos.com") || url.hostname.endsWith("authkit.app");
  record(
    "a signed-out visit leaves for WorkOS",
    hosted,
    redact(url.origin + url.pathname + "?" + url.searchParams.toString().slice(0, 60)),
  );
  record(
    "the redirect names our callback",
    url.searchParams.get("redirect_uri") === "http://localhost:5173/callback",
    url.searchParams.get("redirect_uri") ?? "",
  );
  record(
    "the state carries the wanted path",
    (url.searchParams.get("state") ?? "").includes("returnTo"),
    url.searchParams.get("state") ?? "",
  );
  await page.screenshot({ path: path.join(OUT, "leaving-for-workos.png") }).catch(() => {});

  await page.goto(`${BASE}/share.html`, { waitUntil: "networkidle" });
  record("share.html stays public", await page.getByText("doesn’t contain a card").isVisible());
  await page.goto(`${BASE}/callback`, { waitUntil: "networkidle" });
  record("the callback route renders", await page.getByText("Signing you in").first().isVisible());
  await page.screenshot({ path: path.join(OUT, "callback.png") });
} catch (error) {
  record("run", false, String(error).slice(0, 300));
} finally {
  await browser.close();
}
writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`artifacts: ${OUT}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
