import type { Anthropic } from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { liveAgent } from "./simulationAgent";
import { createSimulationAuthorApp } from "./simulationAuthor";
import {
  compatibleSimulationDefinition,
  simulationDraftRequest,
  simulationRequest,
  simulationSaveRequest,
  type customerSession,
  type SimulationDraft,
  type SimulationResult,
  type SimulationSelection,
  type WorkflowConfig,
} from "./simulationContract";
import { runSimulation, toolProbe } from "./simulation";
import { SIMULATION_MODEL } from "./simulationModel";
import { createSimulationRunApp } from "./simulationRuns";
import {
  listSimulationDefinitions,
  readSimulationDefinition,
  saveSimulationDefinition,
} from "./simulationStorage";
import { simulationStream } from "./simulationStream";
import { createWorkflowApp } from "./simulationWorkflow";
import { openRouterClient } from "./upstream";

type SimulationEnv = { OPENROUTER_API_KEY?: string; SIMULATION_DB?: D1Database };
type Session = {
  selection: SimulationSelection;
  workflowId: string;
  workflow: WorkflowConfig;
  messages: Anthropic.MessageParam[];
  display: z.infer<typeof customerSession>["messages"];
  closed: boolean;
  previous?: SimulationResult;
  active: boolean;
  turns: number;
  expires: number;
};

/** Loopback-only training API; business authority and accepted settings stay server-owned. */
export function createSimulationApp(clientFor: (key: string) => Anthropic = openRouterClient) {
  // ponytail: browser handles restore these 24-hour sessions; Worker restarts require explicit reset.
  const sessions = new Map<string, Session>();
  const drafts = new Map<string, SimulationDraft>();
  const workflows = createWorkflowApp(clientFor);
  const app = new Hono<{ Bindings: SimulationEnv }>();
  const authors = createSimulationAuthorApp({
    clientFor,
    request: (path, init, env) => Promise.resolve(app.request(path, init, env)),
    discard: (id) => {
      drafts.delete(id);
    },
  });
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (c.req.header("sec-fetch-site") === "cross-site")
      return c.json({ error: "Same-origin requests only" }, 403);
    return next();
  });
  app.use("/api/*", bodyLimit({ maxSize: 8192 }));
  app.use("/api/workflow/:id", async (c, next) => {
    if (c.req.method === "DELETE") {
      authors.clearWorkflow(c.req.param("id"));
      for (const [id, draft] of drafts)
        if (draft.workflow.id === c.req.param("id") && draft.expectedRevision === 0)
          drafts.delete(id);
    }
    return next();
  });
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    return c.json(
      {
        error:
          "Request failed. If saving, no save was acknowledged. Read the library before trying again.",
      },
      503,
    );
  });
  app.route("/", workflows.app);
  app.route("/", authors.app);
  app.route("/", createSimulationRunApp(clientFor));
  app.get("/api/simulation-definitions", async (c) => {
    if (!c.env.SIMULATION_DB)
      return c.json({ error: "Simulation storage is not configured." }, 503);
    return c.json(await listSimulationDefinitions(c.env.SIMULATION_DB));
  });
  app.get("/api/simulation-definitions/:id", async (c) => {
    if (!z.uuid().safeParse(c.req.param("id")).success)
      return c.json({ error: "Invalid definition ID." }, 400);
    if (!c.env.SIMULATION_DB)
      return c.json({ error: "Simulation storage is not configured." }, 503);
    const saved = await readSimulationDefinition(c.env.SIMULATION_DB, c.req.param("id"));
    return saved ? c.json(saved) : c.json({ error: "Saved simulation not found." }, 404);
  });
  app.get("/api/simulation-definitions/:id/revisions/:revision", async (c) => {
    const revision = z.coerce.number().int().positive().safeParse(c.req.param("revision"));
    if (!z.uuid().safeParse(c.req.param("id")).success || !revision.success)
      return c.json({ error: "Invalid definition or revision." }, 400);
    if (!c.env.SIMULATION_DB)
      return c.json({ error: "Simulation storage is not configured." }, 503);
    const saved = await readSimulationDefinition(
      c.env.SIMULATION_DB,
      c.req.param("id"),
      revision.data,
    );
    return saved ? c.json(saved) : c.json({ error: "Saved simulation not found." }, 404);
  });
  app.post("/api/simulation-drafts", async (c) => {
    const parsed = simulationDraftRequest.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success)
      return c.json(
        {
          error:
            "Provide a complete named simulation with supported checks; authority and settings cannot be posted.",
        },
        400,
      );
    const input = parsed.data;
    const { name, case: customer, instructions, checks, humanGuidance } = input;
    const definition = { name, case: customer, instructions, checks, humanGuidance };
    let base: Pick<SimulationDraft, "definitionId" | "expectedRevision" | "workflow" | "createdAt">;
    if ("workflowId" in input) {
      const config = workflows.accepted(input.workflowId);
      if (!config)
        return c.json({ error: "Accept a complete workflow before creating a simulation." }, 409);
      base = {
        definitionId: crypto.randomUUID(),
        expectedRevision: 0,
        workflow: { id: input.workflowId, config: structuredClone(config) },
        createdAt: new Date().toISOString(),
      };
    } else {
      if (!c.env.SIMULATION_DB)
        return c.json({ error: "Simulation storage is not configured." }, 503);
      const saved = await readSimulationDefinition(c.env.SIMULATION_DB, input.definitionId);
      if (!saved || saved.revision !== input.expectedRevision)
        return c.json({ error: "Reopen the latest saved revision before editing." }, 409);
      base = {
        definitionId: saved.id,
        expectedRevision: saved.revision,
        workflow: saved.workflow,
        createdAt: saved.createdAt,
      };
    }
    if (!compatibleSimulationDefinition(definition, base.workflow.config))
      return c.json(
        { error: "Selected checks do not match the customer or accepted approval policy." },
        400,
      );
    for (const [id, draft] of drafts)
      if (Date.parse(draft.expiresAt) <= Date.now()) drafts.delete(id);
    if (drafts.size >= 24)
      return c.json({ error: "Draft limit reached. Clear a draft or try later." }, 429);
    const draft: SimulationDraft = {
      ...base,
      id: crypto.randomUUID(),
      definition,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    drafts.set(draft.id, draft);
    return c.json(draft, 201);
  });
  app.get("/api/simulation-drafts/:id", (c) => {
    const draft = drafts.get(c.req.param("id"));
    return draft && Date.parse(draft.expiresAt) > Date.now()
      ? c.json(draft)
      : c.json({ error: "Proposal expired or cleared. Create a new draft explicitly." }, 410);
  });
  app.delete("/api/simulation-drafts/:id", (c) => {
    drafts.delete(c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/simulation-drafts/:id/save", async (c) => {
    const parsed = simulationSaveRequest.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Save only the reviewed proposal and its expected revision." }, 400);
    const draft = drafts.get(c.req.param("id"));
    if (
      !draft ||
      Date.parse(draft.expiresAt) <= Date.now() ||
      draft.expectedRevision !== parsed.data.expectedRevision
    )
      return c.json(
        { error: "Proposal cleared, expired, or stale. Review a new proposal before saving." },
        409,
      );
    if (!c.env.SIMULATION_DB)
      return c.json({ error: "Simulation storage is not configured." }, 503);
    // Claim approval synchronously before any storage await. Reset cannot revive this consumed draft.
    drafts.delete(draft.id);
    const saved = await saveSimulationDefinition(c.env.SIMULATION_DB, draft);
    return saved
      ? c.json(saved, 201)
      : c.json({ error: "A newer revision was saved. Reopen it before editing." }, 409);
  });
  app.get("/api/health", (c) =>
    c.json({ ok: true, synthetic: true, liveConfigured: Boolean(c.env.OPENROUTER_API_KEY) }),
  );
  app.delete("/api/simulation/:id", (c) => {
    sessions.delete(c.req.param("id"));
    return c.body(null, 204);
  });
  app.get("/api/simulation/:id", (c) => {
    const session = sessions.get(c.req.param("id"));
    if (!session || session.expires < Date.now())
      return c.json(
        { error: "Customer session expired. Reset explicitly; no invoices were recreated." },
        410,
      );
    return c.json({
      id: c.req.param("id"),
      messages: session.display,
      workflow: { id: session.workflowId, config: session.workflow },
      result: session.previous ?? null,
      active: session.active,
      closed: session.closed,
    });
  });
  app.post("/api/simulation", async function simulate(c) {
    const parsed = simulationRequest.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: "Select a named case, version and source; send at most 2000 characters." },
        400,
      );
    for (const [id, session] of sessions)
      if (!session.active && session.expires < Date.now()) sessions.delete(id);
    const input = parsed.data;
    const continuing = "sessionId" in input;
    const id = continuing ? input.sessionId : (input.startId ?? crypto.randomUUID());
    // A saved creation handle can recover a lost response, never overwrite or replay a session.
    if (!continuing && sessions.has(id))
      return c.json({ error: "Session already started. Resume it." }, 409);
    const workflow =
      !continuing && input.source === "live"
        ? input.workflowId
          ? workflows.accepted(input.workflowId)
          : undefined
        : ({ tone: "warm", approval: "immediate" } satisfies WorkflowConfig);
    if (!workflow)
      return c.json({ error: "Accept the completed employee workflow before testing it." }, 409);
    if (!continuing && input.source === "live" && input.version !== "corrected")
      return c.json(
        { error: "Vulnerable execution is only available as a labeled training probe." },
        400,
      );
    const session: Session | undefined = continuing
      ? sessions.get(id)
      : {
          selection: {
            case: input.case,
            version: input.version,
            source: input.source,
            pressure: input.pressure,
          },
          workflow: structuredClone(workflow),
          workflowId: input.workflowId ?? id,
          messages: [],
          display: [],
          closed: false,
          active: false,
          turns: 0,
          expires: Date.now() + 86400000,
        };
    if (!session) return c.json({ error: "Customer session expired. Reset to start fresh." }, 410);
    if (session.active || session.closed)
      return c.json(
        { error: "Session busy or interrupted. Reset explicitly to start fresh." },
        409,
      );
    if (session.turns >= 6 || (!continuing && sessions.size >= 24))
      return c.json({ error: "Session limit reached. Reset or try again shortly." }, 429);
    session.active = true;
    session.turns++;
    const selection = session.selection;
    if (selection.source === "live") sessions.set(id, session);
    const key = c.env.OPENROUTER_API_KEY;
    const driver =
      selection.source === "probe"
        ? toolProbe
        : key
          ? liveAgent(clientFor(key), session.messages, input.message, session.workflow)
          : () => Promise.reject(new Error("Missing model credential"));
    if (input.message)
      session.display.push({
        id: crypto.randomUUID(),
        role: "user",
        text: input.message,
        time: new Date().toISOString(),
      });
    const reply = {
      id: crypto.randomUUID(),
      role: "agent" as const,
      text: "",
      time: new Date().toISOString(),
    };
    session.display.push(reply);
    return simulationStream(
      c.req.raw.signal,
      async (emit, signal) => {
        emit({ kind: "session", id });
        const result = await runSimulation(selection, driver, signal, {
          emit(event) {
            if (event.kind === "snapshot") session.previous = event.result;
            if (event.kind === "text") reply.text += event.text;
            emit(event);
          },
          previous: session.previous,
          workflow: session.workflow,
        });
        result.model = selection.source === "live" ? SIMULATION_MODEL : null;
        if (!key && selection.source === "live")
          result.error =
            "Live agent unavailable: OPENROUTER_API_KEY is not configured. Tool probe needs no credentials. No verdict.";
        session.active = false;
        session.expires = Date.now() + 86400000;
        session.previous = result;
        session.closed = result.status !== "completed";
        emit({ kind: "end", result });
      },
      () => {
        session.closed = true;
        session.active = false;
      },
    );
  });
  return app;
}

const app = createSimulationApp();
export default app;
