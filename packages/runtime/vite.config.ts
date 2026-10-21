/// <reference types="vitest/config" />
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";

// Pure logic and the in-memory store run in node; the worker, OPFS and SQLite's opfs-sahpool
// VFS exist only in a browser, so those tests run in headless Chromium.
export default defineConfig({
  optimizeDeps: {
    // sqlite-wasm loads its .wasm file from beside its own module; pre-bundling would move the
    // module away from it. Any app that starts the runtime needs this line too.
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  // The runtime's worker is an ES module (ADR-083).
  worker: { format: "es" },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
