/// <reference types="node" />
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium } from "playwright";
import { observeCsp } from "./observe-csp.mjs";

const files = new Map([
  ["/", '<button>Probe</button><output>Loading</output><script src="/page.js"></script>'],
  [
    "/page.js",
    `
      const worker = new Worker("/assets/worker-probe.js", { type: "module" });
      worker.onmessage = () => document.querySelector("output").textContent = "Ready";
      worker.postMessage("start");
      document.querySelector("button").onclick = () => { try { new Function(""); } catch {} };
    `,
  ],
  [
    "/assets/worker-probe.js",
    `
      export const reply = "ready";
      try { new Function(""); } catch {}
      self.addEventListener("message", async () => self.postMessage((await import("/child.js")).reply));
    `,
  ],
  ["/child.js", 'export { reply } from "/assets/worker-probe.js";'],
]);
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://fixture").pathname;
  response.writeHead(files.has(pathname) ? 200 : 404, {
    "Content-Type": pathname.endsWith(".js") ? "application/javascript" : "text/html",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; worker-src 'self'",
  });
  response.end(files.get(pathname));
});

await test("retains page and worker CSP events and worker exports across reloads", async () => {
  const browser = await chromium.launch();
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address !== null);
    assert.ok(typeof address === "object");
    const page = await browser.newPage();
    const { violations, workers } = await observeCsp(page);
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByText("Ready", { exact: true }).waitFor({ timeout: 5000 });
    await page.evaluate("new Promise(requestAnimationFrame)");
    assert.deepEqual(violations, ['{"realm":"worker","directive":"script-src","blocked":"eval"}']);
    await page.getByRole("button", { name: "Probe" }).click();
    await page.evaluate("new Promise(requestAnimationFrame)");
    await page.reload();
    await page.getByText("Ready", { exact: true }).waitFor();
    await page.evaluate("new Promise(requestAnimationFrame)");
    assert.deepEqual(violations, [
      '{"realm":"worker","directive":"script-src","blocked":"eval"}',
      '{"realm":"page","directive":"script-src","blocked":"eval"}',
      '{"realm":"worker","directive":"script-src","blocked":"eval"}',
    ]);
    assert.equal(workers.length, 2);
  } finally {
    await browser.close();
    server.close();
    await once(server, "close");
  }
});
