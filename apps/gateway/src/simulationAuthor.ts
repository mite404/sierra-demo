import { Hono, type Context } from "hono";
import {
  authorReply,
  type Author,
  type AuthorEnv,
  type AuthorOptions,
} from "./simulationAuthorModel";
import {
  savedSimulationDefinition,
  simulationAuthorRequest,
  workflowSession,
  type SimulationAuthorSource,
} from "./simulationContract";

type State = {
  sessions: Map<string, Author>;
  starting: Map<string, { source: SimulationAuthorSource; stop: AbortController }>;
  options: AuthorOptions;
};
type AuthorContext = Context<{ Bindings: AuthorEnv }>;

function clear(state: State, id: string) {
  const session = state.sessions.get(id);
  session?.stop.abort();
  if (session?.draft) state.options.discard(session.draft.id);
  state.sessions.delete(id);
  state.starting.get(id)?.stop.abort();
  state.starting.delete(id);
}

async function readSource(options: AuthorOptions, source: SimulationAuthorSource, env: AuthorEnv) {
  if ("workflowId" in source) {
    const response = await options.request(`/api/workflow/${source.workflowId}`, {}, env);
    if (!response.ok)
      return Response.json(
        { error: "Accept a current workflow before creating a simulation." },
        { status: 409 },
      );
    const employee = workflowSession.parse(await response.json());
    if (!employee.accepted)
      return Response.json({ error: "Accept the workflow first." }, { status: 409 });
    return { workflow: { id: employee.id, config: employee.accepted }, original: null };
  }
  const response = await options.request(
    `/api/simulation-definitions/${source.definitionId}`,
    {},
    env,
  );
  if (!response.ok)
    return Response.json({ error: "Reopen the saved simulation before editing." }, { status: 409 });
  const saved = savedSimulationDefinition.parse(await response.json());
  if (saved.revision !== source.expectedRevision)
    return Response.json({ error: "Reopen the latest revision before editing." }, { status: 409 });
  return { workflow: saved.workflow, original: saved.definition };
}

async function start(state: State, id: string, source: SimulationAuthorSource, env: AuthorEnv) {
  if (state.sessions.has(id) || state.starting.has(id))
    return Response.json({ error: "Authoring already started. Resume it." }, { status: 409 });
  if (state.sessions.size + state.starting.size >= 24)
    return Response.json({ error: "Authoring session limit reached." }, { status: 429 });
  const stop = new AbortController();
  state.starting.set(id, { source, stop });
  try {
    const resolved = await readSource(state.options, source, env);
    if (resolved instanceof Response) return resolved;
    if (stop.signal.aborted)
      return Response.json({ error: "Authoring cleared. Nothing submitted." }, { status: 409 });
    const session: Author = {
      source,
      workflow: resolved.workflow,
      messages: [],
      display: [],
      draft: null,
      active: false,
      closed: false,
      turns: 0,
      expires: Date.now() + 86400000,
      stop,
    };
    if (resolved.original)
      session.messages.push({
        role: "assistant",
        content: `Previously saved definition to revise: ${JSON.stringify(resolved.original)}`,
      });
    state.sessions.set(id, session);
    return session;
  } finally {
    state.starting.delete(id);
  }
}

async function readAuthor(state: State, c: AuthorContext) {
  const id = c.req.param("id") ?? "";
  const session = state.sessions.get(id);
  if (!session || session.expires < Date.now())
    return c.json(
      { error: "Authoring chat expired. Saved simulations are still in the library." },
      410,
    );
  let draft = session.draft;
  if (draft) {
    const held = await state.options.request(`/api/simulation-drafts/${draft.id}`, {}, c.env);
    if (!held.ok) draft = null;
  }
  return c.json({
    id,
    source: session.source,
    workflow: session.workflow,
    messages: session.display,
    draft,
    active: session.active,
    closed: session.closed,
  });
}

async function authorMessage(state: State, c: AuthorContext) {
  const parsed = simulationAuthorRequest.safeParse(await c.req.json<unknown>().catch(() => null));
  if (!parsed.success)
    return c.json({ error: "Send a message and an authoring source or session handle." }, 400);
  for (const [id, session] of state.sessions) if (session.expires < Date.now()) clear(state, id);
  const input = parsed.data;
  const id = "sessionId" in input ? input.sessionId : input.startId;
  const session =
    "source" in input ? await start(state, id, input.source, c.env) : state.sessions.get(id);
  if (session instanceof Response) return session;
  if (!session || session.expires < Date.now())
    return c.json(
      { error: "Authoring session expired. Start explicitly; saved tests remain available." },
      410,
    );
  if (session.active || session.closed || session.turns >= 12)
    return c.json(
      { error: "Chat busy, interrupted, or at its limit. Start a new authoring chat explicitly." },
      409,
    );
  session.active = true;
  session.turns++;
  if (session.draft) state.options.discard(session.draft.id);
  session.draft = null;
  return authorReply(state.options, session, id, input.message, c.env, c.req.raw.signal);
}

/** Authoring creates only U2 drafts. Explicit save remains the sole approval boundary. */
export function createSimulationAuthorApp(options: AuthorOptions) {
  const state: State = { options, sessions: new Map(), starting: new Map() };
  const app = new Hono<{ Bindings: AuthorEnv }>();
  app.delete("/api/simulation-author/:id", (c) => {
    clear(state, c.req.param("id"));
    return c.body(null, 204);
  });
  app.get("/api/simulation-author/:id", (c) => readAuthor(state, c));
  app.post("/api/simulation-author", (c) => authorMessage(state, c));
  return {
    app,
    clearWorkflow(workflowId: string) {
      for (const [id, session] of [...state.sessions, ...state.starting])
        if ("workflowId" in session.source && session.source.workflowId === workflowId)
          clear(state, id);
    },
  };
}
