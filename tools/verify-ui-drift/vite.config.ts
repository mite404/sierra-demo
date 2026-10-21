import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import type { PreviewServer, ViteDevServer } from "vite";
import { reviewRequest } from "./src/review-server.ts";

function reviewApi(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((request, response, next) => {
    void reviewRequest(request, response, next).catch(() => {
      response
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Report could not be read. Check the local CLI output." }));
    });
  });
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "local-verification-evidence",
      configureServer: reviewApi,
      configurePreviewServer: reviewApi,
    },
  ],
  server: { host: "0.0.0.0", port: 6174, strictPort: true },
});
