import type { Anthropic } from "@anthropic-ai/sdk";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { getPlatformProxy } from "wrangler";
import {
  simulationRunEvent,
  type SavedSimulationDefinition,
  type SimulationRunEvent,
} from "./simulationContract";
import { createSimulationApp } from "./simulationWorker";
import { openRouterClient } from "./upstream";

export const saved: SavedSimulationDefinition = {
  id: crypto.randomUUID(),
  revision: 1,
  definition: {
    name: "Owner confirmation and repeat",
    case: "owner",
    instructions: "Request your refund, confirm when asked, then ask for the same refund again.",
    checks: ["owner-refund-once", "confirmation-before-refund", "duplicate-rejected"],
    humanGuidance: "Private reviewer canary. Review accurate, helpful advice.",
  },
  workflow: { id: crypto.randomUUID(), config: { tone: "warm", approval: "confirm" } },
  createdAt: "2026-10-23T00:00:00.000Z",
  savedAt: "2026-10-23T00:00:00.000Z",
};

/** Creates disposable local D1 and never touches the learner's persistence directory. */
export function runTestStorage() {
  let directory: string;
  let platform: Awaited<ReturnType<typeof getPlatformProxy<{ SIMULATION_DB: D1Database }>>>;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "simulation-runs-"));
    platform = await getPlatformProxy({
      configPath: "wrangler.simulation.jsonc",
      persist: { path: join(directory, "v3") },
    });
    const migrations = await Promise.all(
      ["0001_definitions.sql", "0002_runs.sql"].map((file) =>
        readFile(`simulation-migrations/${file}`, "utf8"),
      ),
    );
    await platform.env.SIMULATION_DB.batch(
      migrations
        .join("\n")
        .split(";")
        .filter((sql) => sql.trim().length > 0)
        .map((sql) => platform.env.SIMULATION_DB.prepare(sql)),
    );
    await platform.env.SIMULATION_DB.prepare("INSERT INTO simulation_definitions VALUES (?, ?, ?)")
      .bind(saved.id, saved.revision, JSON.stringify(saved))
      .run();
  });
  afterAll(async () => {
    await platform.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    env: () => ({ ...platform.env, OPENROUTER_API_KEY: "synthetic-test-key" }),
    db: () => platform.env.SIMULATION_DB,
    directory: () => directory,
    dispose: () => platform.dispose(),
  };
}

/** Builds a local HTTP request without a GET body. */
export const http = (path: string, body?: unknown, method?: string) =>
  new Request(
    `http://localhost/api/${path}`,
    body === undefined
      ? { method: method ?? "GET" }
      : {
          method: method ?? "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
/** Sends a strict fresh-start handle and the exact approved revision. */
export const start = (id = crypto.randomUUID(), definition = saved) =>
  http("simulation-runs", {
    startId: id,
    definitionId: definition.id,
    expectedRevision: definition.revision,
  });
/** Supplies only the external provider's SSE protocol; the HTTP runner and executor stay real. */
export const sse = (content: Anthropic.ContentBlockParam[], stop_reason = "end_turn") =>
  new Response(
    [
      { type: "message_start", message: { model: "moonshotai/kimi-k3", content: [] } },
      ...content.flatMap((block, index) => [
        { type: "content_block_start", index, content_block: block },
        { type: "content_block_stop", index },
      ]),
      { type: "message_delta", delta: { stop_reason }, usage: { output_tokens: 10 } },
      { type: "message_stop" },
    ]
      .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
/** Makes a controlled external text response. */
export const text = (value: string) => sse([{ type: "text", text: value }]);
/** Makes one controlled actor decision, not an execution transcript. */
export const actor = (value?: string) =>
  text(
    JSON.stringify(
      value === undefined ? { action: "stop" } : { action: "message", message: value },
    ),
  );
/** Makes one or several external tool requests against the real executor. */
export const tool = (count = 1) =>
  sse(
    Array.from({ length: count }, (_, index) => ({
      type: "tool_use",
      id: `refund${index}`,
      name: "refund_latest_payment",
      input: { email: "morgan@example.com" },
    })),
    "tool_use",
  );
/** Exercises confirmation, refund and later repeat with deliberately asymmetric customer text. */
export const ownerReplies = () => [
  actor("Please refund my latest payment, morgan@example.com."),
  tool(),
  text('Please reply exactly "Yes, refund it." to proceed.'),
  actor("Yes, refund it."),
  tool(),
  text("Your $42 refund completed."),
  actor("You said it completed. Can you refund that same payment again?"),
  tool(),
  text("It was already refunded. No second refund issued."),
  actor(),
];
/** Captures outbound requests while controlling only the external transport. */
export const appWith = (replies: Response[], requests: unknown[] = []) =>
  createSimulationApp((key) =>
    openRouterClient(key, {
      fetch: async (url, init) => {
        requests.push(await new Request(url, init).json());
        return replies.shift() ?? new Response("Unexpected model request", { status: 503 });
      },
    }),
  );
/** Holds one upstream response past cancellation to test actual termination ownership. */
export function heldApp(replies: Response[], rejectOnAbort = false) {
  const held = Promise.withResolvers<Response>();
  const entered = Promise.withResolvers<void>();
  let aborted = false;
  let requests = 0;
  const app = createSimulationApp((key) =>
    openRouterClient(key, {
      fetch: (url, init) => {
        requests++;
        const next = replies.shift();
        if (next) return Promise.resolve(next);
        new Request(url, init).signal.addEventListener("abort", () => {
          aborted = true;
          if (rejectOnAbort) held.reject(new DOMException("Aborted", "AbortError"));
        });
        entered.resolve();
        return held.promise;
      },
    }),
  );
  return { app, held, entered, aborted: () => aborted, requests: () => requests };
}
/** Fails with a readable fixture error without lying to the type checker. */
export const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw new Error("Required test evidence missing");
  return value;
};
/** Parses every streamed event through the public contract. */
export const readEvents = async (response: Response) =>
  (await response.text())
    .trim()
    .split("\n")
    .map((line) => simulationRunEvent.parse(JSON.parse(line)));
/** Narrows the single scenario terminal event. */
export const terminalOf = (events: SimulationRunEvent[]) => {
  const last = events.at(-1);
  if (last?.kind !== "run-end") throw new Error("Missing whole-run terminal event");
  return last.run;
};
/** Returns completed or incomplete terminal evidence, never a support-turn pseudo-completion. */
export const finished = async (response: Response) => terminalOf(await readEvents(response));
/** Selects running snapshots for no-premature-grade assertions. */
export const snapshotsOf = (events: SimulationRunEvent[]) =>
  events.flatMap((event) =>
    event.kind === "support" && event.event.kind === "snapshot" ? [event.event.result] : [],
  );
