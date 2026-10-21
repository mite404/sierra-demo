import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { baselineSchema, idSchema } from "./report.ts";
import type { Fingerprint, Image, RenderedCell } from "./report.ts";
import { comparePng } from "./pixels.ts";

function digest(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slot(root: string, key: string, fp: Fingerprint) {
  return path.join(
    root,
    digest(fp.environment).slice(0, 16),
    `${fp.width}x${fp.height}-${fp.dpr}x`,
    idSchema.parse(key),
  );
}

async function readBaseline(dir: string) {
  let text: string;
  try {
    text = await readFile(path.join(dir, "approved.json"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const baseline = baselineSchema.parse(JSON.parse(text));
  const bytes = await readFile(path.join(dir, baseline.image.path));
  if (digest(bytes) !== baseline.image.sha256) throw new Error("Baseline image hash mismatch.");
  return { baseline, bytes };
}

/** The environments holding approved references under a baselines directory, one name per
 * environment folder, read from its first approved.json. A missing directory holds none.
 * @throws On an unreadable or invalid approved.json.
 */
export async function knownEnvironments(root: string): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(root, { recursive: true }); // → relative paths under root
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const firstPerFolder = new Map<string, string>();
  for (const file of files.filter((name) => path.basename(name) === "approved.json").toSorted()) {
    const folder = file.split(path.sep)[0] ?? file;
    if (!firstPerFolder.has(folder)) firstPerFolder.set(folder, file);
  }
  const names = await Promise.all(
    [...firstPerFolder.values()].map(async (file) => {
      const text = await readFile(path.join(root, file), "utf8");
      return baselineSchema.parse(JSON.parse(text)).fingerprint.environment;
    }),
  );
  return [...new Set(names)].toSorted();
}

/** Captures an image reference with its content hash. */
export function imageRef(filename: string, bytes: Buffer): Image {
  return { path: filename, sha256: digest(bytes) };
}

/** Reads a baseline without creating one and saves portable before/diff evidence.
 * @throws On corrupt reference data or unreadable image data.
 */
export async function compareBaseline({
  key,
  fingerprint,
  current,
  runDir,
  baselineDir,
}: {
  key: string;
  fingerprint: Fingerprint;
  current: Buffer;
  runDir: string;
  baselineDir: string;
}): Promise<RenderedCell["pixels"]> {
  const saved = await readBaseline(slot(baselineDir, key, fingerprint));
  if (!saved) return { kind: "missing-baseline" };
  const baseline = imageRef(`${key}.before.png`, saved.bytes);
  await writeFile(path.join(runDir, baseline.path), saved.bytes);
  if (JSON.stringify(saved.baseline.fingerprint) !== JSON.stringify(fingerprint)) {
    return {
      kind: "stale-baseline",
      baseline,
      reason: "Browser build or capture policy differs. Review a new baseline.",
    };
  }
  const { delta, diff: bytes } = comparePng(saved.bytes, current);
  if (delta.changedPixels === 0) return { kind: "match", baseline };
  const diff = imageRef(`${key}.diff.png`, bytes);
  await writeFile(path.join(runDir, diff.path), bytes);
  return { kind: "changed", baseline, diff, delta };
}

/** Publishes selected captures only after checking all hashes and baseline revisions.
 * Each slot is atomic. A killed process can leave locks that need manual removal before retry.
 * @throws On concurrent approval, altered images, moved baselines, or I/O failure.
 */
export async function writeBaselines({
  cells,
  runDir,
  baselineDir,
  source,
  run,
}: {
  cells: RenderedCell[];
  runDir: string;
  baselineDir: string;
  source: string;
  run: string;
}): Promise<void> {
  const locks: string[] = [];
  try {
    const prepared = [];
    for (const cell of cells.toSorted((a, b) => a.key.localeCompare(b.key))) {
      const dir = slot(baselineDir, cell.key, cell.fingerprint);
      await mkdir(dir, { recursive: true });
      const lock = path.join(dir, ".approval-lock");
      await mkdir(lock);
      locks.push(lock);
      const bytes = await readFile(path.join(runDir, cell.current.path));
      if (digest(bytes) !== cell.current.sha256)
        throw new Error(`Current image hash mismatch: ${cell.key}`);
      const saved = await readBaseline(dir);
      if (
        saved?.baseline.image.sha256 === cell.current.sha256 &&
        JSON.stringify(saved.baseline.fingerprint) === JSON.stringify(cell.fingerprint)
      )
        continue;
      const observed = cell.pixels.kind === "missing-baseline" ? null : cell.pixels.baseline.sha256;
      if ((saved?.baseline.image.sha256 ?? null) !== observed)
        throw new Error(`Baseline changed since capture: ${cell.key}`);
      const image = imageRef(`${cell.current.sha256}.png`, bytes);
      prepared.push({
        dir,
        bytes,
        baseline: { image, fingerprint: cell.fingerprint, source, run },
      });
    }
    for (const { dir, bytes, baseline } of prepared) {
      await writeFile(path.join(dir, baseline.image.path), bytes);
      const temporary = path.join(dir, `${randomUUID()}.json`);
      await writeFile(temporary, `${JSON.stringify(baseline, null, 2)}\n`);
      await rename(temporary, path.join(dir, "approved.json"));
    }
  } finally {
    await Promise.all(locks.map((lock) => rm(lock, { recursive: true })));
  }
}
