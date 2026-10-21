import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const RUNS = path.join(ROOT, ".artifacts/verify-ui-drift/runs");
export const BUILDS = path.join(ROOT, ".artifacts/verify-ui-drift/builds");
export const BASELINES = path.join(ROOT, "tools/verify-ui-drift/baselines");
const exec = promisify(execFile);
const INPUTS = [
  "packages/catalog",
  "packages/ui",
  "packages/config",
  "packages/runtime",
  "apps/web/src",
  "apps/web/react-router.config.ts",
  "apps/web/vite.config.ts",
  "apps/web/package.json",
  "apps/storybook/.storybook",
  "apps/storybook/vite.config.ts",
  "apps/storybook/package.json",
  "tools/verify-ui-drift/src",
  "tools/verify-ui-drift/package.json",
  "tools/verify-ui-drift/vite.config.ts",
  "tools/verify-ui-drift/index.html",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".agents/skills/verify-storybook-component/scripts/affected-stories.mjs",
];
export const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".yml": "text/plain",
};

/** Runs a repository command without a shell and preserves failures.
 * @throws When the process cannot start or exits unsuccessfully.
 */
export async function command(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  return exec(executable, args, { cwd: ROOT, env, maxBuffer: 16 * 1024 * 1024 });
}

/** Hashes the actual tracked and untracked inputs, not just the last commit.
 * @throws When git or a source read fails.
 */
export async function sourceSnapshot() {
  const { stdout } = await command("git", [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...INPUTS,
  ]);
  const hash = createHash("sha256");
  const files: { path: string; content: string }[] = [];
  for (const name of [...new Set(stdout.split("\0").filter(Boolean))].toSorted()) {
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(ROOT, name));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        hash.update(`${name}\0deleted\0`);
        continue;
      }
      throw error;
    }
    hash.update(`${name}\0${bytes.length}\0`).update(bytes);
    if (
      /\.(css|tsx?)$/u.test(name) &&
      !/\.(test|stories)\./u.test(name) &&
      /^(packages\/(catalog|ui)\/src|apps\/(web|verify)\/src)\//u.test(name)
    )
      files.push({ path: name, content: bytes.toString("utf8") });
  }
  return { source: hash.digest("hex"), files };
}

/** Identifies the host rasterizer family separately from the browser build. */
export async function environmentName(): Promise<string> {
  if (process.platform !== "linux") return `${process.platform}-${process.arch}`;
  const release = await readFile("/etc/os-release", "utf8");
  return `${process.platform}-${process.arch}-${/^ID=(.+)$/mu.exec(release)?.[1]}-${/^VERSION_ID="?([^"\n]+)"?$/mu.exec(release)?.[1]}`;
}

/** Serves one freshly built Storybook on a private ephemeral loopback port.
 * @throws On startup failure. The caller must close the server in finally.
 */
export async function serveBuild(directory: string) {
  const root = await realpath(directory);
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET") {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const filename = await realpath(
        path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`),
      );
      if (!filename.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(filename);
      response
        .writeHead(200, {
          "Content-Type": MIME[path.extname(filename)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(bytes);
    })().catch(() => {
      response.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      }),
  };
}
