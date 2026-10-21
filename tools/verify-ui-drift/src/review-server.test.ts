import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { reviewStateSchema } from "./report.ts";
import type { ReviewState } from "./report.ts";
import { reviewRequest } from "./review-server.ts";
import { BUILDS, RUNS } from "./workspace.ts";

function assertAvailable(storybook: ReviewState["storybook"]) {
  if (storybook?.kind !== "available") throw new Error("expected an available storybook state");
  return storybook;
}

const runDirs: string[] = [];
const buildDirs: string[] = [];
const fingerprint = {
  environment: "linux-test",
  browser: "1",
  playwright: "1",
  width: 3,
  height: 2,
  dpr: 2,
  policy: 1,
} as const;

async function startServer() {
  const server = createServer((request, response) => {
    void reviewRequest(request, response, () => {
      response.writeHead(599, { "X-Next-Called": "1" }).end();
    }).catch((error: unknown) => {
      response
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: String(error) }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback address");
  return { url: `http://127.0.0.1:${address.port}`, server };
}

async function makeRun() {
  const id = randomUUID();
  const dir = path.join(RUNS, id);
  runDirs.push(dir);
  await mkdir(dir, { recursive: true });
  const probe = {
    engine: "chromium",
    fingerprint,
    control: { changedPixels: 0, totalPixels: 1, resized: false },
    color: { changedPixels: 1, totalPixels: 1, resized: false },
    geometry: { changedPixels: 1, totalPixels: 1, resized: false },
  };
  const report = {
    schema: 1,
    id,
    mode: "selftest",
    source: "a".repeat(64),
    head: "0".repeat(40),
    createdAt: new Date().toISOString(),
    engines: ["chromium"],
    themes: ["light"],
    indexedStories: 0,
    selectedStories: [],
    errors: [],
    probes: [probe],
    cells: [],
    inventory: { customProperties: [], literals: [] },
    tokens: [],
    contrasts: [],
  };
  await writeFile(path.join(dir, "report.json"), JSON.stringify(report));
  await writeFile(path.join(dir, "shot.png"), Buffer.from([1, 2, 3]));
  return { id, dir, report };
}

async function makeBuild(id: string) {
  const dir = path.join(BUILDS, id);
  buildDirs.push(dir);
  await mkdir(path.join(dir, "assets"), { recursive: true });
  const index = {
    entries: {
      "foundations-button--default": {
        type: "story",
        id: "foundations-button--default",
        name: "Default",
        title: "Foundations/Button",
        importPath: "../../packages/catalog/src/Button.stories.tsx",
        componentPath: "../../packages/catalog/src/Button.tsx",
      },
      "foundations-disclosure--folded": {
        type: "story",
        id: "foundations-disclosure--folded",
        name: "Folded",
        title: "Foundations/Disclosure",
        importPath: "../../packages/catalog/src/Disclosure.stories.tsx",
      },
      "foundations-button--docs": {
        type: "docs",
        id: "foundations-button--docs",
        name: "Docs",
        title: "Foundations/Button",
        importPath: "../../packages/catalog/src/Button.mdx",
      },
    },
  };
  await writeFile(path.join(dir, "index.json"), JSON.stringify(index));
  await writeFile(path.join(dir, "index.html"), "<!doctype html><title>sb</title>");
  await writeFile(path.join(dir, "assets", "main.js"), "console.log('sb')");
  return { id, dir };
}

describe("reviewRequest", () => {
  let url: string;
  let close: () => void;

  beforeAll(async () => {
    const started = await startServer();
    url = started.url;
    close = () => {
      started.server.close();
    };
  });

  afterAll(() => {
    close();
  });

  afterEach(async () => {
    await Promise.all(runDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
    await Promise.all(buildDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("defers to next() for unrelated paths", async () => {
    const response = await fetch(`${url}/index.html`);
    expect(response.status).toBe(599);
    expect(response.headers.get("X-Next-Called")).toBe("1");
  });

  it("rejects non-GET methods on the API surface", async () => {
    const response = await fetch(`${url}/api/state`, { method: "POST" });
    expect(response.status).toBe(405);
  });

  it("returns the requested run's report and lists it among runs", async () => {
    const { id, report } = await makeRun();
    const response = await fetch(`${url}/api/state?run=${id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const state = reviewStateSchema.parse(await response.json());
    expect(state.report?.id).toBe(report.id);
    expect(state.runs).toContain(id);
  });

  it("serves an evidence file with the matching content type", async () => {
    const { id } = await makeRun();
    const response = await fetch(`${url}/evidence/${id}/shot.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  it("404s an evidence request with a disallowed extension", async () => {
    const { id, dir } = await makeRun();
    await writeFile(path.join(dir, "notes.txt"), "hi");
    const response = await fetch(`${url}/evidence/${id}/notes.txt`);
    expect(response.status).toBe(404);
  });

  it("403s an evidence request that escapes the run directory via a symlink", async () => {
    const { id, dir } = await makeRun();
    const outside = path.join(tmpdir(), `verify-ui-drift-outside-${randomUUID()}`);
    await mkdir(outside, { recursive: true });
    const secret = path.join(outside, "secret.png");
    await writeFile(secret, Buffer.from([9]));
    await symlink(secret, path.join(dir, "escape.png"));
    const response = await fetch(`${url}/evidence/${id}/escape.png`);
    expect(response.status).toBe(403);
    await rm(outside, { recursive: true, force: true });
  });

  it("surfaces a missing report as a caller-visible failure, not a 200", async () => {
    const id = randomUUID();
    const dir = path.join(RUNS, id);
    runDirs.push(dir);
    await mkdir(dir, { recursive: true });
    const response = await fetch(`${url}/api/state?run=${id}`);
    expect(response.status).toBe(500);
  });

  it("includes uncaptured story metadata with normalized repo-relative source paths", async () => {
    const { id } = await makeRun();
    await makeBuild(id);
    const response = await fetch(`${url}/api/state?run=${id}`);
    const state = reviewStateSchema.parse(await response.json());
    const storybook = assertAvailable(state.storybook);
    expect(storybook.stories).toHaveLength(2);
    const button = storybook.stories.find((story) => story.id === "foundations-button--default");
    expect(button?.importPath).toBe("packages/catalog/src/Button.stories.tsx");
    expect(button?.componentPath).toBe("packages/catalog/src/Button.tsx");
    const disclosure = storybook.stories.find(
      (story) => story.id === "foundations-disclosure--folded",
    );
    expect(disclosure?.componentPath).toBeUndefined();
  });

  it("reports unavailable storybook state when no build was retained for the run", async () => {
    const { id } = await makeRun();
    const response = await fetch(`${url}/api/state?run=${id}`);
    const state = reviewStateSchema.parse(await response.json());
    expect(state.storybook).toEqual({
      kind: "unavailable",
      reason: "No retained Storybook build for this run.",
    });
  });

  it("does not read inventory through an escaped index symlink", async () => {
    const { id } = await makeRun();
    const { dir } = await makeBuild(id);
    const outside = path.join(tmpdir(), `kay-index-${randomUUID()}.json`);
    await writeFile(outside, JSON.stringify({ entries: {} }));
    try {
      await rm(path.join(dir, "index.json"));
      await symlink(outside, path.join(dir, "index.json"));
      const response = await fetch(`${url}/api/state?run=${id}`);
      const state = reviewStateSchema.parse(await response.json());
      expect(state.storybook.kind).toBe("unavailable");
    } finally {
      await rm(outside);
    }
  });

  it("serves the retained Storybook index.html for a trailing-slash request", async () => {
    const { id } = await makeRun();
    await makeBuild(id);
    const response = await fetch(`${url}/storybook/${id}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toContain("<title>sb</title>");
  });

  it("serves a retained Storybook static asset with the correct MIME type", async () => {
    const { id } = await makeRun();
    await makeBuild(id);
    const response = await fetch(`${url}/storybook/${id}/assets/main.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/javascript");
    expect(await response.text()).toBe("console.log('sb')");
  });

  it("404s a Storybook asset request when no build was retained", async () => {
    const { id } = await makeRun();
    const response = await fetch(`${url}/storybook/${id}/`);
    expect(response.status).toBe(404);
  });

  it("rejects non-GET methods on the Storybook static route", async () => {
    const { id } = await makeRun();
    await makeBuild(id);
    const response = await fetch(`${url}/storybook/${id}/`, { method: "POST" });
    expect(response.status).toBe(405);
  });

  it("403s an encoded path-traversal request that reaches a real file outside the build", async () => {
    const { id } = await makeRun();
    await makeBuild(id);
    const escaped = "%2e%2e%2f".repeat(4) + "package.json";
    const response = await fetch(`${url}/storybook/${id}/${escaped}`);
    expect(response.status).toBe(403);
  });

  it("403s a Storybook asset that escapes the build directory via a symlink", async () => {
    const { id } = await makeRun();
    const { dir } = await makeBuild(id);
    const outside = path.join(tmpdir(), `verify-ui-drift-sb-outside-${randomUUID()}`);
    await mkdir(outside, { recursive: true });
    const secret = path.join(outside, "secret.js");
    await writeFile(secret, "leak");
    await symlink(secret, path.join(dir, "escape.js"));
    const response = await fetch(`${url}/storybook/${id}/escape.js`);
    expect(response.status).toBe(403);
    await rm(outside, { recursive: true, force: true });
  });

  it("403s when the run's build root itself is a symlink escaping the builds directory", async () => {
    const id = randomUUID();
    const outside = path.join(tmpdir(), `verify-ui-drift-sb-root-${randomUUID()}`);
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "index.html"), "<!doctype html><title>outside</title>");
    const dir = path.join(BUILDS, id);
    buildDirs.push(dir);
    await symlink(outside, dir);
    const response = await fetch(`${url}/storybook/${id}/`);
    expect(response.status).toBe(403);
    await rm(outside, { recursive: true, force: true });
  });
});
