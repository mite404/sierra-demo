/// <reference types="vitest/config" />
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";

// Headless Chromium, driven with real mouse and keyboard input. Each project gets its own copy:
// vitest names the instances it is handed after their project.
function browser() {
  return {
    enabled: true,
    headless: true,
    provider: playwright(),
    instances: [{ browser: "chromium" as const }],
  };
}

// Every story renders in Chromium, runs its play function, and passes axe. The catalog's
// `*.browser.test.*` files run here too: they need a real browser, and the catalog's own
// tests run in node.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        plugins: [storybookTest({ configDir: ".storybook" })],
        test: { name: "storybook", browser: browser() },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["../../packages/catalog/src/**/*.browser.test.{ts,tsx}"],
          browser: browser(),
        },
      },
    ],
  },
});
