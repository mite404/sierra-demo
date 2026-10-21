import type { Config } from "@react-router/dev/config";

// A static single-page app (ADR-083): the worker, OPFS and SQLite exist only in the browser.
export default {
  appDirectory: "src",
  ssr: false,
  // Verification builds use an isolated directory instead of replacing the normal app build.
  buildDirectory: process.env.WEB_BUILD_DIRECTORY ?? "build",
  // Without this, React Router hands Vite's dependency scan no entries at all, so on a cold
  // cache Vite meets every dependency while serving the first page, re-bundles in batches,
  // and the reload it triggers asks for chunks the next batch has already replaced: a blank
  // page with 504s until the second visit. With it, the client entry and every route are
  // scanned before the first request.
  future: { unstable_optimizeDeps: true },
} satisfies Config;
