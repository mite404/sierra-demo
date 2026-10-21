import { defineConfig } from "vitest/config";

// Node unit tests only; the React Router plugin in vite.config.ts is for the app itself.
// The scripts glob covers the build tooling's own tests (write-headers.test.mjs).
export default defineConfig({
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"] },
});
