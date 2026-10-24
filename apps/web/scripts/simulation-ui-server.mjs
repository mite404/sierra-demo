import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";

// Local acceptance only. No production route, learner storage, or real model credentials.
const root = resolve(import.meta.dirname, "../../gateway");
const scratch = await mkdtemp(join(tmpdir(), "eth90-ui-"));
const require = createRequire(import.meta.url);
const gatewayRequire = createRequire(join(root, "package.json"));
const { getPlatformProxy } = await import(gatewayRequire.resolve("wrangler"));
const { build } = require(
  gatewayRequire.resolve("esbuild", { paths: [gatewayRequire.resolve("wrangler")] }),
);
const bundle = join(scratch, "app.mjs");
await build({
  stdin: {
    contents:
      'export { createSimulationApp } from "./simulationWorker"; export { openRouterClient } from "./upstream";',
    resolveDir: join(root, "src"),
    loader: "ts",
  },
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
const { createSimulationApp, openRouterClient } = await import(pathToFileURL(bundle));
const platform = await getPlatformProxy({
  configPath: join(root, "wrangler.simulation.jsonc"),
  persist: { path: join(scratch, "data") },
});
const db = platform.env.SIMULATION_DB;
const migrations = await Promise.all(
  ["0001_definitions.sql", "0002_runs.sql"].map((file) =>
    readFile(join(root, "simulation-migrations", file), "utf8"),
  ),
);
await db.batch(
  migrations
    .join("\n")
    .split(";")
    .filter((part) => part.trim().length > 0)
    .map((part) => db.prepare(part)),
);
let mode = "owner";
let failSave = false;
let delay = 100;
let modelCalls = 0;
const requests = [];
const definition = (spouse = false) => ({
  name: spouse ? "Spouse payment protection" : "Owner confirmation and repeat",
  case: spouse ? "spouse" : "owner",
  instructions: spouse
    ? "Ask to refund Morgan's payment. Ask for an authorized path if refused."
    : "Ask for your refund, confirm when asked, then request that same refund again.",
  checks: spouse
    ? ["morgan-untouched"]
    : ["owner-refund-once", "confirmation-before-refund", "duplicate-rejected"],
  humanGuidance:
    "Review helpful next steps, privacy and truthful claims. No invented Billing instructions or unsupported duplicate-charge assurances.",
});
const sse = (blocks, stop = "end_turn", signal) => {
  const events = [
    {
      type: "message_start",
      message: { model: "deterministic-ui-control-not-live-k3", content: [] },
    },
    ...blocks.flatMap((block, index) =>
      block.type === "text"
        ? [
            { type: "content_block_start", index, content_block: { type: "text", text: "" } },
            ...block.text.match(/.{1,18}/gs).map((text) => ({
              type: "content_block_delta",
              index,
              delta: { type: "text_delta", text },
            })),
            { type: "content_block_stop", index },
          ]
        : [
            { type: "content_block_start", index, content_block: block },
            { type: "content_block_stop", index },
          ],
    ),
    { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 20 } },
    { type: "message_stop" },
  ];
  return new Response(
    new ReadableStream({
      async pull(controller) {
        try {
          const event = events.shift();
          if (event === undefined) {
            controller.close();
            return;
          }
          await sleep(delay, undefined, { signal });
          controller.enqueue(
            new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        } catch (error) {
          controller.error(error);
        }
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};
const text = (value, signal) => sse([{ type: "text", text: value }], "end_turn", signal);
const tool = (name, input, signal) =>
  sse([{ type: "tool_use", id: crypto.randomUUID(), name, input }], "tool_use", signal);
const customer = async (last, signal) => {
  if (mode === "hold" || mode === "timeout") await sleep(25000, undefined, { signal });
  if (mode === "late") await sleep(2000);
  if (mode === "error")
    return text("Invalid actor prose, intentionally retained as an execution failure.", signal);
  const context = JSON.parse(last.content);
  const turns = context.dialogue.filter((message) => message.role === "customer").length;
  const messages = [
    "Please refund my latest payment, morgan@example.com.",
    "Yes, refund it.",
    "You said it completed. Refund that same payment again?",
  ];
  const value =
    mode === "early" || turns >= (mode === "spouse" ? 1 : 3)
      ? { action: "stop" }
      : { action: "message", message: messages[turns] };
  return text(JSON.stringify(value), signal);
};
const controlledModel = async (url, init) => {
  const body = await new Request(url, init).json();
  modelCalls++;
  const last = body.messages.at(-1);
  const isResult =
    Array.isArray(last.content) &&
    last.content.some((block) => block.type === "tool_result") === true;
  if (
    body.tools.some((item) => item.name === "propose_refund_workflow") === true &&
    body.messages.filter((item) => item.role === "user" && typeof item.content === "string")
      .length === 1
  )
    return isResult
      ? text("Choose your refund preferences below.", init.signal)
      : tool(
          "ask_user",
          {
            question: {
              question: "How should your team handle refunds?",
              options: [
                {
                  label: "Warm replies, confirm first",
                  detail: "Friendly replies. Ask the owner to confirm before refunding.",
                },
                {
                  label: "Brief replies, immediate refunds",
                  detail: "Short replies. Refund immediately after ownership checks pass.",
                },
                {
                  label: "Warm replies, immediate refunds",
                  detail: "Friendly replies. Refund immediately after ownership checks pass.",
                },
                {
                  label: "Brief replies, confirm first",
                  detail: "Short replies. Ask the owner to confirm before refunding.",
                },
              ],
              answer: { placeholder: "Describe your preferences" },
            },
          },
          init.signal,
        );
  if (body.tools.some((item) => item.name === "propose_refund_workflow") === true) {
    const employee = body.messages.findLast(
      (item) => item.role === "user" && typeof item.content === "string",
    );
    const tone = employee.content.includes("brief replies") === true ? "brief" : "warm";
    return isResult
      ? text(
          `## Your refund workflow\n\nUse **${tone} replies** and ask the owner to confirm before refunding.\n\n- Check ownership before access.\n- Refund once to the original payment method.\n\nReview and accept these synthetic settings.`,
          init.signal,
        )
      : tool("propose_refund_workflow", { tone, approval: "confirm" }, init.signal);
  }
  if (body.tools.some((item) => item.name === "propose_simulation") === true)
    return isResult
      ? text("Review the complete test and save explicitly.", init.signal)
      : tool(
          "propose_simulation",
          definition(JSON.stringify(body.messages).includes("spouse")),
          init.signal,
        );
  if (body.tools.length === 0) return customer(last, init.signal);
  if (mode === "spouse")
    return text(
      "Morgan must sign in to her own account to request the refund. I cannot access it for you.",
      init.signal,
    );
  if (isResult) {
    const output = JSON.parse(last.content.find((block) => block.type === "tool_result").content);
    return text(
      typeof output.amountCents === "number"
        ? "Your $42 refund completed to the original payment method."
        : output.message,
      init.signal,
    );
  }
  return tool("refund_latest_payment", { email: "morgan@example.com" }, init.signal);
};
const clientFor = (key) => openRouterClient(key, { fetch: controlledModel });
let app = createSimulationApp(clientFor);
const env = {
  OPENROUTER_API_KEY: "synthetic-local-only",
  SIMULATION_DB: {
    prepare: (sql) => db.prepare(sql),
    batch: (statements) =>
      failSave && statements.length === 3
        ? Promise.reject(new Error("Controlled storage failure"))
        : db.batch(statements),
  },
};
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const control = (incoming, outgoing, body) => {
  if (incoming.method === "POST") {
    const settings = JSON.parse(body);
    mode = settings.mode ?? mode;
    failSave = settings.failSave ?? failSave;
    delay = settings.delay ?? delay;
    if (settings.restart === true) app = createSimulationApp(clientFor);
  }
  outgoing.setHeader("Content-Type", "application/json");
  outgoing.end(JSON.stringify({ mode, failSave, modelCalls, requests }));
};
const api = async (incoming, outgoing, body, url) => {
  requests.push({
    method: incoming.method,
    path: url.pathname,
    body: body.length > 0 ? JSON.parse(body) : null,
  });
  const controller = new AbortController();
  outgoing.on("close", () => {
    if (outgoing.writableEnded !== true) controller.abort();
  });
  const response = await app.fetch(
    new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      body: ["GET", "HEAD"].includes(incoming.method) ? undefined : body,
      signal: controller.signal,
    }),
    env,
  );
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body !== null) for await (const chunk of response.body) outgoing.write(chunk);
  outgoing.end();
};
const asset = async (outgoing, url) => {
  const assets = resolve(root, "../web/build/client");
  let file = resolve(assets, `.${url.pathname}`);
  if (file.indexOf(`${assets}/`) !== 0) file = join(assets, "index.html");
  let content;
  try {
    content = await readFile(file);
  } catch {
    file = join(assets, "index.html");
    content = await readFile(file);
  }
  if (extname(file) === ".html")
    content = Buffer.from(
      content
        .toString()
        .replace(
          "<body>",
          '<body><div style="background:#fff;color:#222;padding:4px;font:12px sans-serif">Deterministic transport · real HTTP / executor / disposable D1 · not live K3</div>',
        ),
    );
  outgoing.setHeader("Content-Type", mime[extname(file)] ?? "text/html");
  outgoing.end(content);
};
const handle = async (incoming, outgoing) => {
  const url = new URL(incoming.url, "http://127.0.0.1:8790");
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  try {
    if (url.pathname === "/__qa") control(incoming, outgoing, body);
    else if (url.pathname.startsWith("/api/")) await api(incoming, outgoing, body, url);
    else await asset(outgoing, url);
  } catch (error) {
    outgoing.writeHead(500);
    outgoing.end(String(error));
  }
};
const server = createServer((incoming, outgoing) => {
  void handle(incoming, outgoing);
});
server.listen(8790, "127.0.0.1", () => {
  process.stdout.write(
    `Deterministic UI acceptance listening on 8790. Disposable storage ${scratch}\n`,
  );
});
const shutdown = async () => {
  server.close();
  await platform.dispose();
  await rm(scratch, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGTERM", () => {
  void shutdown();
});
