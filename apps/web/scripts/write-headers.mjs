#!/usr/bin/env node
// oxlint-disable no-console -- a build step reports on stdout
// Writes `_headers` next to the prerendered site: the static security headers, with a
// Content-Security-Policy that names every inline script the build emitted (the theme and
// chrome boots, React Router's hydration) by its SHA-256. A static SPA gets no per-response
// nonce, so the hash is the only way to keep inline boots under a policy that allows nothing
// else inline; regenerating on every build means a changed boot changes the header rather
// than silently breaking, and a new inline script is silent for no one.
//
//   pnpm --filter web build   # react-router build, then this script
//   cat apps/web/build/client/_headers
//
// Cloudflare Workers serves the headers for the static assets (ADR-086); `/api/*` answers
// are the Worker's own.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Both boots must be among the hashed scripts, or the policy is lying about the page: a
// build without them (wrong directory, a React Router change) fails here, not in production.
const BOOT_MARKS = ["dataset.theme", "searchParams.delete"];

// The contents of every inline `<script>` in `html` (a `src` script needs no hash).
/** @param {string} html */
export function inlineScriptsIn(html) {
  /** @type {string[]} */
  const scripts = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    scripts.push(match[1]);
  }
  return scripts;
}

// Each script's CSP hash source, sorted and deduplicated so the header is stable.
/** @param {string[]} scripts */
export function scriptHashes(scripts) {
  const hashes = scripts.map(
    (script) => `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`,
  );
  return [...new Set(hashes)].toSorted((a, b) => (a < b ? -1 : 1));
}

// The policy. `wasm-unsafe-eval` lets the runtime's SQLite compile in its worker (ADR-083);
// plain eval stays refused. Styles keep `unsafe-inline` for the style attributes charts and
// overlays lay themselves out with; images keep `https:` for the avatars WorkOS hands back;
// connect keeps api.workos.com for the AuthKit session calls. Everything else is the site's
// own origin.
/** @param {string[]} hashes */
export function contentSecurityPolicy(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.workos.com",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

// The `_headers` file Cloudflare's static assets serve: these for every page.
/** @param {string} csp */
export function headersFile(csp) {
  return [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), geolocation=(), microphone=(self)",
    `  Content-Security-Policy: ${csp}`,
    "",
  ].join("\n");
}

/**
 * @param {string} directory
 * @returns {string[]}
 */
function htmlFilesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFilesIn(at);
    return entry.name.endsWith(".html") ? [at] : [];
  });
}

if (import.meta.main) {
  const buildDirectory = process.env.WEB_BUILD_DIRECTORY ?? "build";
  const client = path.resolve(process.cwd(), buildDirectory, "client");
  const scripts = htmlFilesIn(client).flatMap((file) =>
    inlineScriptsIn(readFileSync(file, "utf8")),
  );
  const missing = BOOT_MARKS.filter((mark) => !scripts.some((script) => script.includes(mark)));
  if (missing.length > 0) {
    console.error(`write-headers: no boot script with ${missing.join(", ")} under ${client}`);
    process.exit(1);
  }
  const out = path.join(client, "_headers");
  writeFileSync(out, headersFile(contentSecurityPolicy(scriptHashes(scripts))));
  console.log(`write-headers: ${scripts.length} inline scripts pinned in ${out}`);
}
