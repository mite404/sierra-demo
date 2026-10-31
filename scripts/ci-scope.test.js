import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const scope = workflow.split("      - name: Select safe affected tasks\n")[1];
const command = scope
  .split("        run: |\n")[1]
  .split("\n      - name:")[0]
  .replaceAll(/^ {10}/gm, "");

await test("CI only selects affected tasks for known workspace inputs and fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "ci-scope-"));
  try {
    for (const [files, gitStatus, expectedStatus, expectedEnv, expectedOutput] of [
      ["apps/web/src/root.tsx\npackages/ui/src/button.tsx", 0, 0, "", "args=--affected\n"],
      ["packages/config/tsconfig.base.json", 0, 0, "", "args=--affected\n"],
      ["apps/web/src/root.tsx\npnpm-lock.yaml", 0, 0, "TURBO_FORCE=true\n", ""],
      [".github/workflows/ci.yml", 0, 0, "TURBO_FORCE=true\n", ""],
      ["docs/design-pillars.md", 0, 0, "TURBO_FORCE=true\n", ""],
      ["tools/verify-ui-drift/src/cli.ts", 0, 0, "TURBO_FORCE=true\n", ""],
      ["new-shared-input/config.json", 0, 0, "TURBO_FORCE=true\n", ""],
      ["apps/new-workspace/src/index.ts", 0, 0, "TURBO_FORCE=true\n", ""],
      ["", 128, 128, "", ""],
    ]) {
      const envFile = join(directory, "env");
      const outputFile = join(directory, "output");
      writeFileSync(envFile, "");
      writeFileSync(outputFile, "");
      const result = spawnSync(
        "bash",
        [
          "-e",
          "-o",
          "pipefail",
          "-c",
          `git() { printf '%s' "$FILES"; return "$GIT_STATUS"; }\n${command}`,
        ],
        {
          env: {
            ...process.env,
            FILES: files,
            GIT_STATUS: String(gitStatus),
            GITHUB_ENV: envFile,
            GITHUB_OUTPUT: outputFile,
          },
        },
      );
      assert.equal(result.status, expectedStatus, files);
      assert.equal(readFileSync(envFile, "utf8"), expectedEnv, files);
      assert.equal(readFileSync(outputFile, "utf8"), expectedOutput, files);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
