import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("./write-headers.mjs", import.meta.url));
let directory = "";

/** @type {{ kind: string, build: () => string | undefined, client: string }[]} */
const buildCases = [
  { kind: "default", build: () => {}, client: "build/client" },
  { kind: "relative", build: () => "selected/build", client: "selected/build/client" },
  { kind: "absolute", build: () => path.join(directory, "selected"), client: "selected/client" },
];

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "yaklabs-headers-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it("imports the hash helper without a build directory or filesystem writes", () => {
  const code = `
    const { scriptHashes } = await import(${JSON.stringify(pathToFileURL(script).href)});
    process.stdout.write(JSON.stringify(scriptHashes(["alert(1)"])));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: directory,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(
    JSON.stringify(["'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"]),
  );
  expect(readdirSync(directory)).toEqual([]);
});

it.each(buildCases)(
  "writes headers into the $kind build directory",
  ({ build, client: relativeClient }) => {
    const client = path.join(directory, relativeClient);
    mkdirSync(path.join(client, "nested"), { recursive: true });
    writeFileSync(path.join(client, "index.html"), "<script>dataset.theme = 'light';</script>");
    writeFileSync(
      path.join(client, "nested", "page.html"),
      "<script>searchParams.delete('x');</script><script>alert(1)</script>",
    );
    const result = spawnSync(process.execPath, [script], {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, WEB_BUILD_DIRECTORY: build() },
    });
    expect(result.status).toBe(0);
    expect(existsSync(path.join(client, "_headers"))).toBe(true);
    const headers = readFileSync(path.join(client, "_headers"), "utf8");
    expect(headers).toContain("Content-Security-Policy: default-src 'self'; script-src 'self'");
    expect(headers).toContain("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
  },
);
