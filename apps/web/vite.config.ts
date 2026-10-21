import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: /^zod$/, replacement: fileURLToPath(new URL("./src/zod.ts", import.meta.url)) },
    ],
  },
  plugins: [
    {
      name: "same-origin-production",
      configResolved(config) {
        if (config.command === "build" && config.env.VITE_GATEWAY_URL !== undefined) {
          throw new Error(
            "Production builds require the gateway on the site's own origin. Unset VITE_GATEWAY_URL; it is for local development only.",
          );
        }
      },
    },
    tailwindcss(),
    reactRouter(),
  ],
  optimizeDeps: {
    // The worker loads sqlite-wasm's wasm and helper files itself; pre-bundling breaks them.
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  // A module worker (ADR-083), so the runtime's worker can import like any other module.
  worker: { format: "es" },
});
