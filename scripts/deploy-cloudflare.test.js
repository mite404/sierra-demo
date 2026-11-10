import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const file = new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url);

await test("Cloudflare deployment accepts only successful main pushes from this repository", () => {
  assert.ok(existsSync(file), "The deployment workflow must exist");
  const workflow = readFileSync(file, "utf8");
  const condition = workflow.split("    if: >-\n")[1].split("    runs-on:")[0].trim();
  const repository = "mite404/sierra-demo";
  const accepted = {
    conclusion: "success",
    event: "push",
    head_branch: "main",
    head_repository: { full_name: repository },
  };
  for (const [override, expected] of [
    [{}, true],
    [{ conclusion: "failure" }, false],
    [{ conclusion: "cancelled" }, false],
    [{ event: "pull_request" }, false],
    [{ event: "schedule" }, false],
    [{ event: "workflow_dispatch" }, false],
    [{ head_branch: "feature" }, false],
    [{ head_repository: { full_name: "someone/sierra-demo" } }, false],
  ]) {
    const github = { repository, event: { workflow_run: { ...accepted, ...override } } };
    assert.equal(runInNewContext(condition, { github }), expected, JSON.stringify(override));
  }
});

await test("Stale revisions and failed migrations cannot publish a Worker", () => {
  assert.ok(existsSync(file), "The deployment workflow must exist");
  const workflow = readFileSync(file, "utf8");
  const command = workflow
    .split("      - name: Deploy current main\n")[1]
    .split("        run: |\n")[1]
    .replaceAll(/^ {10}/gm, "");
  for (const [remote, lookupStatus, migrationStatus, expectedStatus, published] of [
    ["tested-sha", 0, 0, 0, true],
    ["newer-sha", 0, 0, 0, false],
    ["", 128, 0, 128, false],
    ["tested-sha", 0, 1, 1, false],
  ]) {
    const result = spawnSync(
      "bash",
      [
        "-e",
        "-o",
        "pipefail",
        "-c",
        `gh() { printf '%s' "$REMOTE"; return "$LOOKUP_STATUS"; }
pnpm() {
  case "$*" in
    '--filter gateway exec wrangler d1 migrations apply SIMULATION_DB --remote --config wrangler.deployment.jsonc')
      migrated=1; return "$MIGRATION_STATUS" ;;
    '--filter gateway exec wrangler deploy --config wrangler.deployment.jsonc')
      [[ "$migrated" == 1 ]] || return 99
      printf 'published' ;;
    *) return 99 ;;
  esac
}
${command}`,
      ],
      {
        env: {
          ...process.env,
          DEPLOY_SHA: "tested-sha",
          REMOTE: remote,
          LOOKUP_STATUS: String(lookupStatus),
          MIGRATION_STATUS: String(migrationStatus),
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, expectedStatus, result.stderr);
    assert.equal(result.stdout.includes("published"), published, remote);
  }
});
