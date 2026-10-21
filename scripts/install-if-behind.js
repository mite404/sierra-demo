// Installs dependencies when the checkout's lockfile has moved past what node_modules holds.
// Lefthook runs it after a merge or a checkout, so a pull that adds a package never leaves
// the dev server failing to resolve an import. pnpm keeps a copy of the lockfile it last
// installed at node_modules/.pnpm/lock.yaml; when the two differ, node_modules is behind.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const wanted = path.join(root, "pnpm-lock.yaml");
const installed = path.join(root, "node_modules/.pnpm/lock.yaml");

function behind() {
  if (!existsSync(installed)) return true;
  return readFileSync(wanted, "utf8") !== readFileSync(installed, "utf8");
}

if (behind()) {
  console.log("lockfile changed: installing");
  const result = spawnSync("pnpm", ["install"], { cwd: root, stdio: "inherit" });
  process.exit(result.status ?? 1);
}
console.log("node_modules matches the lockfile");
