import type { Agent } from "@yaklabs/catalog/agent";
import { createLabAgent } from "@yaklabs/catalog/labAgent";
import { applyChunk, isEmptyReply, startReply } from "@yaklabs/catalog/reply";
import { z } from "zod";
import { settleReply, withAgentTurn, type Stamp } from "./conversation";
import { createPlaygroundAgent } from "./playgroundAgent";
import {
  commandSchema,
  type AgentSpec,
  type Command,
  type Notice,
  type RuntimeData,
  type Source,
} from "./protocol";
import { create, isMenuWrite, menuWrite, recordAsk, type Writer } from "./storeWrites";
import { createSettler, timeoutSchedule, type Schedule, type Settler } from "./settler";
import { lanesOf, mergeLanes, type ThreadId } from "./workspace";

/** A deterministic stall or failure: `hold` never answers, `fail` answers with its reason. */
export type Fault = "hold" | { fail: string };

/** Where a scenario's faults strike: its start, every `open`, every `send`. */
export type Faults = { start?: Fault; open?: Fault; send?: Fault };

/** What the worker opened for `init`: the store, where it lives, how it mints, what faults. */
export type Opened = Writer & { source: Source; faults: Faults };

// What an agent may need to answer one message.
type AgentContext = { store: Writer["store"]; threadId: ThreadId; accessToken?: string };

/** What the loop needs from where it runs: the worker entry gives the real ones, tests fakes. */
export type LoopHost = {
  /** Sends a notice to the page. */
  post: (notice: Notice) => void;
  /** Opens what `init` asked for; the device should fall back rather than fail. */
  open: (data: RuntimeData) => Promise<Opened>;
  /** Builds the agent for one message; defaults to the lab stand-in or the live model. */
  createAgent?: (spec: AgentSpec, context: AgentContext) => Agent;
  /** How the settling timer waits (`Schedule`); defaults to `setTimeout`. */
  schedule?: Schedule;
};

type CommandOf<K extends Command["kind"]> = Extract<Command, { kind: K }>;
type Session = Opened & { agent: AgentSpec; settler: Settler };

// Shared handler state: the host, the session `init` started, live replies, the last state pushed.
type Loop = {
  host: Required<LoopHost>;
  session?: Promise<Session>;
  replies: Map<string, { stop: AbortController; threadId: ThreadId }>; // requestId → live reply
  queues: Map<ThreadId, Promise<void>>; // threadId → the reply it waits out
  lastState?: string;
};

const LAB: AgentSpec = { kind: "lab" };

// The request a malformed command still names, so its failure reaches the right caller.
const requestIdSchema = z.object({ requestId: z.string().min(1) });

function defaultAgent(spec: AgentSpec, context: AgentContext): Agent {
  return spec.kind === "lab"
    ? createLabAgent()
    : createPlaygroundAgent({ baseUrl: spec.baseUrl, ...context });
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stampOf(mint: Writer["mint"]): Stamp {
  const now = mint.now();
  return { at: now.toISOString(), time: mint.turnTime(now) };
}

// Meets a fault before the work it guards: `hold` never settles, `fail` throws its reason.
function meet(fault: Fault | undefined): Promise<void> {
  if (fault === undefined) return Promise.resolve();
  if (fault === "hold") return new Promise(() => {});
  return Promise.reject(new Error(fault.fail));
}

function started(loop: Loop): Promise<Session> {
  return loop.session ?? Promise.reject(new Error("The runtime has not been started"));
}

// The threads with a reply in flight, each once, in the order their replies began.
function replying(loop: Loop): ThreadId[] {
  return [...new Set([...loop.replies.values()].map((live) => live.threadId))];
}

// Posts the workspace as it now is, unless the page already has exactly this.
function pushState(loop: Loop, { store, source }: Session): void {
  const notice: Notice = {
    kind: "state",
    source,
    workspace: store.workspace(),
    replying: replying(loop),
  };
  const serialized = JSON.stringify(notice);
  if (serialized === loop.lastState) return;
  loop.lastState = serialized;
  loop.host.post(notice);
}

// Runs one write, then pushes the state it left before answering, so the page has its ids.
async function write(
  loop: Loop,
  apply: (session: Session) => Extract<Notice, { kind: "created" | "done" }>,
): Promise<void> {
  const session = await started(loop);
  const answer = apply(session);
  session.settler.settle(false);
  pushState(loop, session);
  loop.host.post(answer);
}

async function open(loop: Loop, { requestId, threadId }: CommandOf<"open">): Promise<void> {
  const { store, faults } = await started(loop);
  await meet(faults.open);
  const transcript = store.transcript(threadId); // → Transcript | undefined
  if (transcript === undefined) throw new Error(`No thread ${threadId}`);
  loop.host.post({ kind: "opened", requestId, messages: transcript.messages });
}

// The user's turn is saved before the agent runs, so it survives a failed reply. Each chunk the
// agent yields is folded into its turn and forwarded as it came (ADR-147); a failure ends the
// turn. The settled turn is saved at the end or on stop; an empty or thrown stream saves none.
async function reply(
  loop: Loop,
  session: Session,
  command: CommandOf<"send">,
  signal: AbortSignal,
): Promise<void> {
  const { requestId, threadId, event, accessToken } = command;
  const { store, mint, agent: spec } = session;
  const asked = stampOf(mint);
  recordAsk(store, threadId, event, asked);
  pushState(loop, session);
  const agent = loop.host.createAgent(spec, { store, threadId, accessToken });
  let turn = startReply(requestId, asked.time); // → AgentMessage; its id is minted as it is saved
  for await (const chunk of agent.respond(event, signal)) {
    if (signal.aborted) break;
    turn = applyChunk(turn, chunk);
    loop.host.post({ kind: "chunk", requestId, chunk });
    if (typeof chunk !== "string" && chunk.kind === "failure") break;
  }
  if (isEmptyReply(turn)) return;
  const done = settleReply(turn, signal.aborted);
  store.changeTranscript(threadId, (transcript) =>
    withAgentTurn(transcript, done, stampOf(mint).at),
  );
}

async function send(loop: Loop, command: CommandOf<"send">): Promise<void> {
  const { requestId, threadId } = command;
  const session = await started(loop);
  await meet(session.faults.send);
  const stop = new AbortController();
  loop.replies.set(requestId, { stop, threadId });
  // One reply per thread: a send waits out the replies ahead of it, failed or not, so the
  // transcript keeps every exchange whole and in the order it was asked.
  const answer = () => reply(loop, session, command, stop.signal);
  const queued = (loop.queues.get(threadId) ?? Promise.resolve()).then(answer, answer);
  loop.queues.set(threadId, queued);
  try {
    await queued;
  } finally {
    if (loop.queues.get(threadId) === queued) loop.queues.delete(threadId);
    loop.replies.delete(requestId);
    pushState(loop, session);
  }
  loop.host.post({ kind: "done", requestId });
}

// A scenario is named by `init` alone; the device's storage is known only once it opens.
function sourceBeforeOpen(data: RuntimeData): Source | undefined {
  return data.kind === "scenario" ? { kind: "scenario", name: data.name } : undefined;
}

async function init(loop: Loop, { agent, data }: CommandOf<"init">): Promise<void> {
  if (loop.session !== undefined) return; // one start per worker
  const early = sourceBeforeOpen(data); // → Source | undefined
  if (early !== undefined) loop.host.post({ kind: "opening", source: early });
  loop.session = loop.host.open(data).then(async (opened) => {
    if (early === undefined) loop.host.post({ kind: "opening", source: opened.source });
    await meet(opened.faults.start);
    const { store, mint } = opened;
    const session: Session = {
      ...opened,
      // A scenario always answers with the lab stand-in, so a mock never reaches a model.
      agent: opened.source.kind === "scenario" ? LAB : agent,
      settler: createSettler({
        store,
        mint,
        schedule: loop.host.schedule,
        onChange: () => {
          pushState(loop, session);
        },
      }),
    };
    return session;
  });
  const session = await loop.session;
  session.settler.settle(true);
  pushState(loop, session);
}

// Handles a command that names a request; whatever it throws fails that request alone.
function handleRequest(loop: Loop, command: Exclude<Command, { kind: "init" }>): Promise<void> {
  if (isMenuWrite(command)) {
    return write(loop, (session) => {
      menuWrite(session, command);
      return { kind: "done", requestId: command.requestId };
    });
  }
  switch (command.kind) {
    case "open":
      return open(loop, command);
    case "create":
      return write(loop, (session) => ({
        kind: "created",
        requestId: command.requestId,
        id: create(session, command.item),
      }));
    case "rename":
      return write(loop, ({ store }) => {
        store.rename(command.target, command.name);
        return { kind: "done", requestId: command.requestId };
      });
    case "arrange":
      return write(loop, ({ store }) => {
        const { mainId, lanes, base } = command;
        store.arrange(mainId, mergeLanes(lanesOf(store.workspace(), mainId), base, lanes));
        return { kind: "done", requestId: command.requestId };
      });
    case "saveShell":
      return write(loop, ({ store }) => {
        store.saveShell(command.shell);
        return { kind: "done", requestId: command.requestId };
      });
    case "send":
      return send(loop, command);
    case "abort":
      loop.replies.get(command.requestId)?.stop.abort();
      return Promise.resolve();
    default: {
      const unhandled: never = command;
      return unhandled;
    }
  }
}

async function handle(loop: Loop, command: Command): Promise<void> {
  if (command.kind === "init") {
    try {
      await init(loop, command);
    } catch (error) {
      loop.host.post({ kind: "broken", reason: reasonOf(error) });
    }
    return;
  }
  try {
    await handleRequest(loop, command);
  } catch (error) {
    loop.host.post({ kind: "failed", requestId: command.requestId, reason: reasonOf(error) });
  }
}

/**
 * The loop that stands in for Kay's daemon (ADR-076): it owns the store and the agent, and talks
 * to the page only through commands in and notices out, each checked on arrival (ADR-086).
 * After every write it pushes the workspace, unless unchanged, and only then answers the write.
 * A request that fails answers `failed` on its own; `broken` is for a failed start, or a command
 * so malformed it names no request.
 *
 * @returns A handler for each raw message from the page; it settles once the command is done.
 */
export function createAgentLoop(host: LoopHost): (data: unknown) => Promise<void> {
  const loop: Loop = {
    host: {
      ...host,
      createAgent: host.createAgent ?? defaultAgent,
      schedule: host.schedule ?? timeoutSchedule,
    },
    replies: new Map(),
    queues: new Map(),
  };

  return (data) => {
    const parsed = commandSchema.safeParse(data); // → { success, data } | { success, error }
    if (parsed.success) return handle(loop, parsed.data);
    const reason = `Unknown command: ${z.prettifyError(parsed.error)}`;
    const named = requestIdSchema.safeParse(data);
    const notice: Notice = named.success
      ? { kind: "failed", requestId: named.data.requestId, reason }
      : { kind: "broken", reason };
    host.post(notice);
    return Promise.resolve();
  };
}
