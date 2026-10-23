import type { Anthropic } from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";
import { liveAgent } from "./simulationAgent";
import {
  simulationRequest,
  type customerSession,
  type SimulationResult,
  type SimulationSelection,
  type WorkflowConfig,
} from "./simulationContract";
import { runSimulation, toolProbe } from "./simulation";
import { SIMULATION_MODEL } from "./simulationModel";
import { simulationStream } from "./simulationStream";
import { createWorkflowApp } from "./simulationWorkflow";
import { openRouterClient } from "./upstream";

type SimulationEnv = { OPENROUTER_API_KEY?: string };
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
  const workflows = createWorkflowApp(clientFor);
  const app = new Hono<{ Bindings: SimulationEnv }>();
  app.use("/api/*", bodyLimit({ maxSize: 8192 }));
  app.use("/api/*", async (c, next) => {
    if (c.req.header("sec-fetch-site") === "cross-site")
      return c.json({ error: "Same-origin requests only" }, 403);
    c.header("Cache-Control", "no-store");
    return next();
  });
  app.route("/", workflows.app);
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
        const pending = session.previous?.trace.some(
          (entry) => entry.outcome === "confirmation_required",
        );
        const confirmed = Boolean(
          pending && /^yes,? refund it[.!]?$/iu.test(input.message?.trim() ?? ""),
        );
        const result = await runSimulation(selection, driver, signal, {
          emit(event) {
            if (event.kind === "snapshot") session.previous = event.result;
            if (event.kind === "text") reply.text += event.text;
            emit(event);
          },
          previous: session.previous,
          workflow: session.workflow,
          confirmed,
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
