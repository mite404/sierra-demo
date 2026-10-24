import type { Anthropic } from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { runSimulation } from "./simulation";
import {
  simulationHumanReview,
  simulationRunRequest,
  type SavedSimulationDefinition,
  type SimulationRun,
  type SimulationRunEvent,
  type SimulationRunEvidence,
} from "./simulationContract";
import { automatedCustomer } from "./simulationCustomer";
import { SIMULATION_MODEL } from "./simulationModel";
import {
  listSimulationRuns,
  readSimulationDefinition,
  readSimulationRun,
  reserveSimulationRun,
  reviewSimulationRun,
  saveSimulationRun,
} from "./simulationStorage";
import { simulationStream } from "./simulationStream";

type RunSession = { view: SimulationRun; stop: AbortController };
type Env = { OPENROUTER_API_KEY?: string; SIMULATION_DB?: D1Database };
type Registry = { sessions: Map<string, RunSession>; active: string | null };
const conflict = (error: string) =>
  new HTTPException(409, { res: Response.json({ error }, { status: 409 }) });

const saveCompletion = async (db: D1Database, view: SimulationRun): Promise<boolean> => {
  if (!view.evidence || view.evidence.result.status !== "completed") return false;
  view.persistence = "saving";
  try {
    view.persistence = (await saveSimulationRun(db, view.evidence)) ? "saved" : "not-retained";
  } catch {
    view.persistence = "unsaved";
  }
  return view.persistence !== "unsaved";
};
const stopSession = (session: RunSession | undefined) => {
  if (
    session !== undefined &&
    session.view.active &&
    session.view.evidence?.result.status !== "completed"
  )
    session.stop.abort();
};

const readRoutes = (sessions: Registry["sessions"]) =>
  new Hono<{ Bindings: Env }>()
    .get("/api/simulation-definitions/:id/runs", async (c) => {
      if (!z.uuid().safeParse(c.req.param("id")).success)
        return c.json({ error: "Invalid definition ID." }, 400);
      if (!c.env.SIMULATION_DB) return c.json({ error: "Simulation storage unavailable." }, 503);
      return c.json(await listSimulationRuns(c.env.SIMULATION_DB, c.req.param("id")));
    })
    .get("/api/simulation-runs/:id", async (c) => {
      const session = sessions.get(c.req.param("id"));
      if (session && session.view.persistence !== "saved") return c.json(session.view);
      if (!c.env.SIMULATION_DB) return c.json({ error: "Simulation storage unavailable." }, 503);
      const saved = await readSimulationRun(c.env.SIMULATION_DB, c.req.param("id"));
      return saved
        ? c.json(saved)
        : c.json(
            {
              error:
                "Run unavailable or interrupted by restart. Start fresh explicitly. No work was replayed.",
            },
            410,
          );
    });

const controlRoutes = (sessions: Registry["sessions"]) =>
  new Hono<{ Bindings: Env }>()
    .post("/api/simulation-runs/:id/stop", (c) => {
      const session = sessions.get(c.req.param("id"));
      stopSession(session);
      return c.json({ id: c.req.param("id"), active: session?.view.active ?? false });
    })
    .delete("/api/simulation-runs/:id", (c) => {
      const session = sessions.get(c.req.param("id"));
      stopSession(session);
      // Active deletion means stop/reset, not erasure of committed payments or evidence.
      if (session && !session.view.active) sessions.delete(c.req.param("id"));
      return c.body(null, 204);
    });

const persistenceRoutes = (sessions: Registry["sessions"]) =>
  new Hono<{ Bindings: Env }>()
    .post("/api/simulation-runs/:id/save", async (c) => {
      const session = sessions.get(c.req.param("id"));
      if (!session || session.view.active || session.view.persistence !== "unsaved")
        throw conflict("No unsaved completed evidence to retry. Read the existing run.");
      if (!c.env.SIMULATION_DB) return c.json({ error: "Simulation storage unavailable." }, 503);
      const saved = await saveCompletion(c.env.SIMULATION_DB, session.view);
      return c.json(session.view, saved ? 200 : 503);
    })
    .post("/api/simulation-runs/:id/review", async (c) => {
      const parsed = simulationHumanReview.safeParse(await c.req.json<unknown>().catch(() => null));
      if (!parsed.success)
        return c.json({ error: "Supply a human review and at most 2000 note characters." }, 400);
      if (!c.env.SIMULATION_DB) return c.json({ error: "Simulation storage unavailable." }, 503);
      const updated = await reviewSimulationRun(
        c.env.SIMULATION_DB,
        c.req.param("id"),
        parsed.data,
      );
      return updated
        ? c.json(parsed.data)
        : c.json({ error: "Retained completed run not found." }, 404);
    });

const approvedRun = async (db: D1Database, input: z.infer<typeof simulationRunRequest>) => {
  const saved = await readSimulationDefinition(db, input.definitionId);
  if (!saved || saved.revision !== input.expectedRevision)
    throw conflict("Reopen the latest approved revision before running.");
  if (!(await reserveSimulationRun(db, input.startId, saved)))
    throw conflict(
      "Handle used or revision changed. Read existing evidence; never replay this handle.",
    );
  return saved;
};

const executeRun = async (
  session: RunSession,
  saved: SavedSimulationDefinition,
  client: Anthropic | null,
  signal: AbortSignal,
  emit: (event: SimulationRunEvent) => void,
  db: D1Database,
) => {
  const { id } = session.view;
  const models: SimulationRunEvidence["models"] = {
    customer: { requested: SIMULATION_MODEL, reported: [] },
    support: { requested: SIMULATION_MODEL, reported: [] },
  };
  emit({ kind: "run", id });
  const driver =
    client === null
      ? () => {
          throw new Error("Missing model credential");
        }
      : automatedCustomer(client, saved, models, emit);
  const result = await runSimulation(
    { case: saved.definition.case, version: "corrected", source: "live", pressure: false },
    driver,
    signal,
    {
      simulation: saved,
      emit: (event) => {
        if (event.kind === "snapshot")
          session.view.evidence = { id, completedAt: null, models, result: event.result };
        if (event.kind === "text") {
          const reply = session.view.evidence?.result.conversation.at(-1);
          if (reply?.role === "agent") reply.text += event.text;
        }
        emit({ kind: "support", event });
      },
    },
  );
  result.model = SIMULATION_MODEL;
  session.view.evidence = {
    id,
    completedAt: result.status === "completed" ? new Date().toISOString() : null,
    models,
    result,
  };
  await saveCompletion(db, session.view);
};

const runResponse = (
  registry: Registry,
  session: RunSession,
  saved: SavedSimulationDefinition,
  client: Anthropic | null,
  incoming: AbortSignal,
  db: D1Database,
) =>
  simulationStream<SimulationRunEvent>(
    AbortSignal.any([incoming, session.stop.signal]),
    async (emit, signal) => {
      try {
        await executeRun(session, saved, client, signal, emit, db);
      } finally {
        session.view.active = false;
        registry.active = null;
      }
      emit({ kind: "run-end", run: structuredClone(session.view) });
    },
    () => {
      session.stop.abort();
    },
    240000,
  );

const startRoutes = (registry: Registry, clientFor: (key: string) => Anthropic) =>
  new Hono<{ Bindings: Env }>().post("/api/simulation-runs", async (c) => {
    const parsed = simulationRunRequest.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: "Start with an opaque handle and the exact saved definition revision." },
        400,
      );
    const { startId: id } = parsed.data;
    if (registry.sessions.has(id))
      throw conflict("Run handle already used. Read it without restarting.");
    if (registry.active !== null) throw conflict("Another automated run still owns execution.");
    if (registry.sessions.size >= 24)
      return c.json({ error: "Clear an inactive run handle before starting another." }, 429);
    const db = c.env.SIMULATION_DB;
    if (!db) return c.json({ error: "Simulation storage unavailable." }, 503);
    const session: RunSession = {
      stop: new AbortController(),
      view: {
        id,
        active: true,
        persistence: "none",
        evidence: null,
        humanReview: { status: "pending", note: "" },
      },
    };
    registry.active = id;
    registry.sessions.set(id, session);
    let streaming = false;
    try {
      const saved = await approvedRun(db, parsed.data);
      const key = c.env.OPENROUTER_API_KEY;
      const response = runResponse(
        registry,
        session,
        saved,
        key === undefined ? null : clientFor(key),
        c.req.raw.signal,
        db,
      );
      streaming = true;
      return response;
    } finally {
      if (!streaming) {
        session.view.active = false;
        registry.sessions.delete(id);
        registry.active = null;
      }
    }
  });

/** Owns one local automated actor through termination. Manual sessions are independent.
 * Completed evidence is durable; active/partial actors never resume after a Worker restart.
 */
export function createSimulationRunApp(clientFor: (key: string) => Anthropic) {
  // ponytail: one installation-wide actor; use per-account scheduling if multi-user execution is needed.
  const registry: Registry = { sessions: new Map(), active: null };
  return new Hono<{ Bindings: Env }>()
    .use("/api/simulation-runs/:id/*", async (c, next) => {
      if (!z.uuid().safeParse(c.req.param("id")).success)
        return c.json({ error: "Invalid run ID." }, 400);
      await next();
      return c.res;
    })
    .route("/", readRoutes(registry.sessions))
    .route("/", controlRoutes(registry.sessions))
    .route("/", persistenceRoutes(registry.sessions))
    .route("/", startRoutes(registry, clientFor));
}
