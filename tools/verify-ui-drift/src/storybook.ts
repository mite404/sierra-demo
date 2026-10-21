import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { idSchema, storyEntrySchema, storybookStateSchema } from "./report.ts";
import type { StoryEntry, StorybookState } from "./report.ts";
import { BUILDS, MIME, ROOT } from "./workspace.ts";

const STORYBOOK_ROOT = path.join(ROOT, "apps/storybook");
const rawEntrySchema = z.object({
  type: z.string(),
  id: z.string().min(1),
  name: z.string().min(1),
  title: z.string().min(1),
  importPath: z.string().min(1),
  componentPath: z.string().min(1).optional(),
});
const rawIndexSchema = z.object({ entries: z.record(z.string(), rawEntrySchema) });

export type StorybookAssetResult =
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "ok"; file: string; contentType: string };

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

// Storybook paths are relative to its project directory, not the repository root.
function toRepoRelative(raw: string): string | null {
  const relative = path.relative(ROOT, path.resolve(STORYBOOK_ROOT, raw));
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function normalizeEntry(entry: z.infer<typeof rawEntrySchema>): StoryEntry | null {
  if (entry.type !== "story") return null;
  const importPath = toRepoRelative(entry.importPath);
  if (importPath === null) return null;
  const componentPath =
    entry.componentPath === undefined ? null : toRepoRelative(entry.componentPath);
  const candidate = {
    id: entry.id,
    title: entry.title,
    name: entry.name,
    importPath,
    ...(componentPath === null ? {} : { componentPath }),
  };
  const parsed = storyEntrySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Reads one run's retained Storybook index with the same containment rules as asset requests.
 * @throws For filesystem errors other than a missing build or index.
 */
export async function loadStorybookState(run: string): Promise<StorybookState> {
  const parsedRun = idSchema.safeParse(run);
  if (!parsedRun.success) return { kind: "unavailable", reason: "Invalid run id." };
  const asset = await resolveStorybookAsset(parsedRun.data, "/index.json");
  if (asset.kind !== "ok")
    return { kind: "unavailable", reason: "No retained Storybook build for this run." };
  const raw = await readFile(asset.file, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { kind: "unavailable", reason: "Storybook build index is not valid JSON." };
  }
  const parsedIndex = rawIndexSchema.safeParse(json);
  if (!parsedIndex.success) {
    return { kind: "unavailable", reason: "Storybook build index is malformed." };
  }
  const stories = Object.values(parsedIndex.data.entries)
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is StoryEntry => entry !== null);
  return storybookStateSchema.parse({ kind: "available", stories });
}

/** Resolves a GET request under /storybook/<run>/<path> to a retained static build file.
 * Validates traversal and symlink containment at both the run's build root and the final
 * file, since either can be pushed outside the allowed builds directory. */
export async function resolveStorybookAsset(
  run: string,
  requestPath: string,
): Promise<StorybookAssetResult> {
  const parsedRun = idSchema.safeParse(run);
  if (!parsedRun.success) return { kind: "not-found" };
  let root: string;
  let buildsRoot: string;
  try {
    root = await realpath(path.join(BUILDS, parsedRun.data));
    buildsRoot = await realpath(BUILDS);
  } catch (error) {
    if (isEnoent(error)) return { kind: "not-found" };
    throw error;
  }
  if (!root.startsWith(`${buildsRoot}${path.sep}`)) return { kind: "forbidden" };
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return { kind: "not-found" };
  }
  const sub = decoded === "" || decoded.endsWith("/") ? `${decoded}/index.html` : decoded;
  const candidate = path.resolve(root, `.${sub.startsWith("/") ? sub : `/${sub}`}`);
  let file: string;
  try {
    file = await realpath(candidate);
  } catch (error) {
    if (isEnoent(error)) return { kind: "not-found" };
    throw error;
  }
  if (!file.startsWith(`${root}${path.sep}`)) return { kind: "forbidden" };
  if (!(await stat(file)).isFile()) return { kind: "not-found" };
  return { kind: "ok", file, contentType: MIME[path.extname(file)] ?? "application/octet-stream" };
}
