import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

it("rejects a gateway loaded from the selected mode's env file", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "yaklabs-build-env-"));
  try {
    writeFileSync(
      path.join(directory, ".env.staging"),
      "VITE_GATEWAY_URL=https://example.invalid/api\n",
    );
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      const { resolveConfig } = await import("vite");
      await resolveConfig({ envDir: ${JSON.stringify(directory)} }, "build", "staging");
      process.exit(0);
    `,
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, VITE_GATEWAY_URL: undefined },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Production builds require the gateway on the site's own origin",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each(["production", "staging"])("rejects an external gateway in a %s build", (mode) => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    const { resolveConfig } = await import("vite");
    await resolveConfig({}, "build", ${JSON.stringify(mode)});
    process.exit(0);
  `,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, VITE_GATEWAY_URL: "https://example.invalid/api" },
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Production builds require the gateway on the site's own origin");
});

it("allows an external gateway in local development", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    const { resolveConfig } = await import("vite");
    await resolveConfig({}, "serve");
    process.exit(0);
  `,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, VITE_GATEWAY_URL: "https://example.invalid/api" },
    },
  );
  expect(result.status).toBe(0);
});
