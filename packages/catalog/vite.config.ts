import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

// Only the node unit tests run here. Stories and `*.browser.test.*` files run in Chromium from
// apps/storybook, and pages from apps/web.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "src/**/*.browser.test.{ts,tsx}"],
  },
});
