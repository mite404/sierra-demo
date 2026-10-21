/**
 * Observes document and module-worker CSP events before application code starts.
 * @param {import("playwright").Page} page
 * @returns {Promise<{ violations: string[], workers: string[] }>} Events and observed worker URLs.
 * @throws If installing the listeners or intercepting a worker response fails.
 */
export async function observeCsp(page) {
  /** @type {string[]} */
  const violations = [];
  /** @type {string[]} */
  const workers = [];
  const marker = "[security-worker-csp] ";
  page.on("console", (message) => {
    if (message.text().startsWith(marker)) violations.push(message.text().slice(marker.length));
  });
  await page.exposeBinding("reportSecurityViolation", (_source, violation) =>
    violations.push(String(violation)),
  );
  await page.addInitScript(`
    document.addEventListener("securitypolicyviolation", event => reportSecurityViolation(JSON.stringify({
      realm: "page", directive: event.violatedDirective, blocked: event.blockedURI
    })));
  `);
  await page.context().route("**/__security-csp-observer.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        self.addEventListener("securitypolicyviolation", event => console.debug(${JSON.stringify(marker)} + JSON.stringify({
          realm: "worker", directive: event.violatedDirective, blocked: event.blockedURI
        })));
      `,
    }),
  );
  await page.context().route("**/assets/worker-*.js*", async (route) => {
    const url = new URL(route.request().url());
    workers.push(url.href);
    const response = await route.fetch();
    const observer = new URL("/__security-csp-observer.js", url).href;
    // A first dependency observes startup without changing the worker's URL or exports.
    await route.fulfill({
      response,
      body: `import ${JSON.stringify(observer)};\n${await response.text()}`,
    });
  });
  return { violations, workers };
}
