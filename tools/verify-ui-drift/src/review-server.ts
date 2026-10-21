import { readFile, readdir, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { idSchema, reportSchema } from "./report.ts";
import type { ReviewState } from "./report.ts";
import { loadStorybookState, resolveStorybookAsset } from "./storybook.ts";
import { RUNS, sourceSnapshot } from "./workspace.ts";

type FileResult =
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "ok"; file: string; contentType: string };

async function sendFileResult(response: ServerResponse, result: FileResult) {
  if (result.kind === "not-found") {
    response.writeHead(404).end();
    return;
  }
  if (result.kind === "forbidden") {
    response.writeHead(403).end();
    return;
  }
  response.writeHead(200, { "Content-Type": result.contentType }).end(await readFile(result.file));
}

async function hasReport(entry: string): Promise<boolean> {
  try {
    return (await stat(path.join(RUNS, entry, "report.json"))).isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function listRuns(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(RUNS);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") entries = [];
    else throw error;
  }
  const runs: string[] = [];
  for (const entry of entries
    .filter((name) => idSchema.safeParse(name).success)
    .toSorted()
    .toReversed()) {
    if (await hasReport(entry)) runs.push(entry);
  }
  return runs;
}

async function loadReviewState(url: URL): Promise<ReviewState> {
  const runs = await listRuns();
  const selected = url.searchParams.get("run") ?? runs[0];
  const report =
    selected === undefined
      ? null
      : reportSchema.parse(
          JSON.parse(
            await readFile(path.join(RUNS, idSchema.parse(selected), "report.json"), "utf8"),
          ),
        );
  const stale = report !== null && report.source !== (await sourceSnapshot()).source;
  const storybook =
    selected === undefined
      ? { kind: "unavailable" as const, reason: "No run selected." }
      : await loadStorybookState(idSchema.parse(selected));
  return { report, stale, runs, storybook };
}

async function resolveEvidence(pathname: string): Promise<FileResult> {
  const match = /^\/evidence\/([^/]+)\/([^/]+)$/u.exec(pathname);
  if (!match) return { kind: "not-found" };
  const name = idSchema.parse(match[2]);
  if (!/\.(png|yml)$/u.test(name)) return { kind: "not-found" };
  const root = await realpath(path.join(RUNS, idSchema.parse(match[1])));
  const file = await realpath(path.join(root, name));
  if (!file.startsWith(`${root}${path.sep}`)) return { kind: "forbidden" };
  return { kind: "ok", file, contentType: name.endsWith(".png") ? "image/png" : "text/plain" };
}

/** Serves report JSON, review evidence, and retained Storybook build files, with no execution
 * or write endpoint.
 * @throws For an unreadable or malformed report. The HTTP boundary must return a non-success status.
 */
export async function reviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const storybookMatch = /^\/storybook\/([^/]+)((?:\/.*)?)$/u.exec(url.pathname);
  if (url.pathname !== "/api/state" && !url.pathname.startsWith("/evidence/") && !storybookMatch) {
    next();
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET") {
    response.writeHead(405).end();
    return;
  }
  if (url.pathname === "/api/state") {
    const state = await loadReviewState(url);
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(state));
    return;
  }
  if (storybookMatch) {
    await sendFileResult(
      response,
      await resolveStorybookAsset(storybookMatch[1] ?? "", storybookMatch[2] ?? ""),
    );
    return;
  }
  await sendFileResult(response, await resolveEvidence(url.pathname));
}
