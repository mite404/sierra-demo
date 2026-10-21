import type { Agent } from "@yaklabs/catalog/agent";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { z } from "zod";
import {
  commandSchema,
  noticeSchema,
  type AgentSpec,
  type Command,
  type NewItem,
  type RenameTarget,
  type RuntimeData,
} from "./protocol";
import { arranged, marked, removed, renamed, withShell, type Edit } from "./edits";
import { createInbox } from "./inbox";
import {
  breakDown,
  createHandle,
  receive,
  show,
  type Answer,
  type Handle,
  type RuntimeState,
} from "./handle";
import type { MarkNote, ThreadMark } from "./marks";
import { untilAborted } from "./untilAborted";
import {
  lanesOf,
  type Lane,
  type LaneId,
  type ShellState,
  type ThreadId,
  type ThreadShare,
} from "./workspace";

export type { RuntimeState } from "./handle";

/** How the page reaches the signed-in user's token, e.g. AuthKit's `getAccessToken` (ADR-084). */
export type Session = { getAccessToken(): Promise<string> };

/** What the page starts the runtime with: which agent answers, and which data to open. */
export type RuntimeConfig = { agent: AgentSpec; data: RuntimeData };

/** The page's only door to the worker: one observable state, and the verbs that change it. */
export type Runtime = {
  /** Calls `listener` after every change to `state()`; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** The current state; the same object until something changes (useSyncExternalStore). */
  state(): RuntimeState;
  /** One thread's turns. @throws When the thread is unknown, or the runtime is broken. */
  open(id: ThreadId): Promise<ThreadMessage[]>;
  /**
   * Makes a project, a main thread or a child with its lane, and resolves to the new id once
   * `state()` already lists it.
   * @throws When the worker refuses it (say, an unknown parent), or the runtime is broken.
   */
  create(item: NewItem): Promise<string>;
  /** Renames in `state()` at once, then in the worker; a refusal rolls it back and throws. */
  rename(target: RenameTarget, name: string): Promise<void>;
  /**
   * Sets a main thread's lanes in `state()` at once, then in the worker, like `rename`. A lane
   * `state()` did not show yet (a child whose create is still in flight) stays beside its
   * neighbour rather than being dropped.
   */
  arrange(mainId: ThreadId, lanes: Lane[]): Promise<void>;
  /** Keeps the page's shell whole, in `state()` at once, then in the worker, like `rename`. */
  saveShell(shell: ShellState): Promise<void>;
  /**
   * Pins, snoozes or archives a thread, in `state()` at once, then in the worker, like `rename`;
   * a `note` lands in the bell with it, in the same write.
   */
  mark(id: ThreadId, change: ThreadMark, note?: MarkNote): Promise<void>;
  /**
   * Deletes a thread and its sub-threads: gone from `state()` at once, and for good once the
   * undo window (`UNDO_MS`) passes without a `restore` (ADR-130).
   */
  delete(id: ThreadId): Promise<void>;
  /** Takes a delete back inside its window. @throws Once the worker has purged it. */
  restore(id: ThreadId): Promise<void>;
  /** Records a thread made public, with its link and revoke token, on the device (ADR-131). */
  share(share: ThreadShare): Promise<void>;
  /** Forgets a public share, once the page has taken it down or found it gone. */
  unshare(shareId: string): Promise<void>;
  /** The thread's `Agent` (ADR-041); replies stream from the worker. */
  agent(id: ThreadId, session?: Session): Agent;
  /** Stops the worker; everything still waiting fails, and the state is broken. */
  dispose(): void;
};

// What a request settles with, and how the page sends a command.
type Settled = Exclude<Answer, { kind: "failed" | "chunk" }>;
type Post = (command: Command) => void;
// The runtime's verbs for the thread menu.
type MenuVerb = "mark" | "delete" | "restore" | "share" | "unshare";
// A command the page waits on for one answer.
type Asked = Exclude<Command, { kind: "init" | "send" | "abort" }>;

// The lane ids the page sees on a main now: what its `arrange` was edited from.
function baseOf(state: RuntimeState, mainId: ThreadId): LaneId[] {
  return state.kind === "ready" ? lanesOf(state.workspace, mainId).map((lane) => lane.id) : [];
}

const newId = () => crypto.randomUUID();

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// Sends one command and settles with its answer. The edit, if any, shows at once and goes when
// the answer comes: by then a `state` holding the write has arrived, or the write was refused.
function ask(handle: Handle, post: Post, command: Asked, edit?: Edit): Promise<Settled> {
  if (handle.confirmed.kind === "broken") return Promise.reject(new Error(handle.confirmed.reason));
  const { requestId } = command;
  try {
    post(command); // throws when the command fails its own check
  } catch (error) {
    return Promise.reject(asError(error));
  }
  return new Promise((resolve, reject) => {
    handle.sinks.set(requestId, (answer) => {
      if (answer.kind === "chunk") return;
      handle.sinks.delete(requestId);
      if (handle.edits.delete(requestId)) show(handle);
      if (answer.kind === "failed") reject(new Error(answer.reason));
      else resolve(answer);
    });
    if (edit !== undefined) {
      handle.edits.set(requestId, edit);
      show(handle);
    }
  });
}

function unexpected(answer: Settled): Error {
  return new Error(`The runtime worker answered ${answer.requestId} with ${answer.kind}`);
}

function agentFor(handle: Handle, post: Post, threadId: ThreadId, session?: Session): Agent {
  return {
    async *respond(event, signal) {
      const accessToken = await session?.getAccessToken(); // → string | undefined
      if (signal.aborted) return;
      // After the wait for the token: a runtime that broke meanwhile answers nothing more.
      if (handle.confirmed.kind === "broken") throw new Error(handle.confirmed.reason);
      const requestId = newId();
      const inbox = createInbox<Answer>(); // a reply's answers, pushed by `receive`
      post({ kind: "send", requestId, threadId, event, accessToken }); // throws if malformed
      handle.sinks.set(requestId, inbox.push);
      let finished = false;
      try {
        for await (const answer of untilAborted(inbox, signal)) {
          // Passed on as it came, so the panel folds the reply as it does an in-memory agent's.
          if (answer.kind === "chunk") {
            yield answer.chunk;
            continue;
          }
          finished = true;
          if (answer.kind === "failed") throw new Error(answer.reason);
          return;
        }
      } finally {
        handle.sinks.delete(requestId);
        if (!finished) post({ kind: "abort", requestId });
      }
    },
  };
}

// Routes the worker's notices, and turns its failures into a broken runtime.
function listen(worker: Worker, handle: Handle): void {
  worker.addEventListener("message", (event) => {
    const parsed = noticeSchema.safeParse(event.data); // → { success, data } | { success, error }
    if (parsed.success) receive(handle, parsed.data);
    else
      breakDown(
        handle,
        `The runtime worker sent a malformed notice: ${z.prettifyError(parsed.error)}`,
      );
  });
  // A worker that fails to load fires a plain Event; one that throws fires an ErrorEvent.
  worker.addEventListener("error", (event: Event) => {
    const detail = event instanceof ErrorEvent ? event.message : "it could not start";
    breakDown(handle, `The runtime worker failed: ${detail}`);
  });
  worker.addEventListener("messageerror", () => {
    breakDown(handle, "The runtime worker sent a message the page could not read");
  });
}

// The thread menu's verbs (ADR-126): a mark and a delete show at once, like `rename`; an undo,
// a share and its end wait for the worker.
function menuVerbs(handle: Handle, post: Post): Pick<Runtime, MenuVerb> {
  return {
    mark: async (threadId, change, note) => {
      const command: Command = { kind: "mark", requestId: newId(), threadId, change, note };
      await ask(handle, post, command, marked(threadId, change, new Date().toISOString(), note));
    },
    delete: async (threadId) => {
      const command: Command = { kind: "delete", requestId: newId(), threadId };
      await ask(handle, post, command, removed(threadId));
    },
    restore: async (threadId) => {
      await ask(handle, post, { kind: "restore", requestId: newId(), threadId });
    },
    share: async (share) => {
      await ask(handle, post, { kind: "share", requestId: newId(), share });
    },
    unshare: async (shareId) => {
      await ask(handle, post, { kind: "unshare", requestId: newId(), shareId });
    },
  };
}

/**
 * Starts the worker that stands in for Kay's daemon (ADR-076, ADR-083) and returns the page's
 * handle on it. The page and the worker talk only through messages, each checked on arrival
 * (ADR-086); a malformed notice or a crashed worker breaks the runtime and fails every call
 * still waiting.
 *
 * @throws When `config` fails the protocol's check.
 */
export function startRuntime(config: RuntimeConfig): Runtime {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const handle = createHandle();
  const post: Post = (command) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- workers have none
    worker.postMessage(commandSchema.parse(command)); // the worker checks again on arrival
  };
  listen(worker, handle);
  post({ kind: "init", agent: config.agent, data: config.data });

  return {
    subscribe: (listener) => {
      handle.listeners.add(listener);
      return () => {
        handle.listeners.delete(listener);
      };
    },
    state: () => handle.shown,
    open: async (threadId) => {
      const answer = await ask(handle, post, { kind: "open", requestId: newId(), threadId });
      if (answer.kind !== "opened") throw unexpected(answer);
      return answer.messages;
    },
    create: async (item) => {
      const answer = await ask(handle, post, { kind: "create", requestId: newId(), item });
      if (answer.kind !== "created") throw unexpected(answer);
      return answer.id;
    },
    rename: async (target, name) => {
      const command: Command = { kind: "rename", requestId: newId(), target, name };
      await ask(handle, post, command, renamed(target, name));
    },
    arrange: async (mainId, lanes) => {
      const base = baseOf(handle.shown, mainId);
      const command: Command = { kind: "arrange", requestId: newId(), mainId, lanes, base };
      await ask(handle, post, command, arranged(mainId, lanes, base));
    },
    saveShell: async (shell) => {
      const command: Command = { kind: "saveShell", requestId: newId(), shell };
      await ask(handle, post, command, withShell(shell));
    },
    ...menuVerbs(handle, post),
    agent: (threadId, session) => agentFor(handle, post, threadId, session),
    dispose: () => {
      worker.terminate();
      breakDown(handle, "The runtime was stopped");
    },
  };
}
