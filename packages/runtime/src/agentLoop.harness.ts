import type { AgentEvent } from "@yaklabs/catalog/agent";
import { createLabAgent } from "@yaklabs/catalog/labAgent";
import { onTestFinished } from "vitest";
import { createAgentLoop, type LoopHost } from "./agentLoop";
import { fixedMint, type Mint } from "./mint";
import type { Command, Notice } from "./protocol";
import { openSqliteStore } from "./sqliteStore";
import { seedThread, type Store } from "./store";
import { netProfitChoice } from "./testing";
import { projectIdSchema, threadIdSchema, type Workspace } from "./workspace";

// What the agent loop's tests share: a loop on a store holding the profit thread, the commands
// they send, and ways to read the notices it posted.

// 10:03 UTC, the minute the user asks; the fixed mint writes turn times in UTC.
const asked = new Date("2026-09-26T10:03:00.000Z");

/** The fixture's main thread, seeded from the catalog's profit thread. */
export const profit = threadIdSchema.parse("profit");
// The project the fixture's profit thread sits in.
const DEMO_STORE = { id: projectIdSchema.parse("demo-store"), name: "Demo store" };
// The user's question about the profit card, with the card choice and a file riding along.
const ask: AgentEvent = {
  kind: "message",
  text: "Why is Saturday high?",
  attachments: [netProfitChoice],
  files: [{ name: "till-roll.png", type: "image/png", size: 2048 }],
};

/** Starts the loop on the device with the lab stand-in. */
export const init: Command = { kind: "init", agent: { kind: "lab" }, data: { kind: "device" } };
/** Asks the profit thread about its card. */
export const sendAsk: Command = { kind: "send", requestId: "r1", threadId: profit, event: ask };
/** Creates a child of profit whose lane lands first. */
export const child = (requestId: string, draft = ""): Command => ({
  kind: "create",
  requestId,
  item: { kind: "child", parentId: profit, at: 0, title: "Saturday", draft },
});

// The loop tests' fixture: the Demo store project and its profit thread, at `at`.
function seedProfit(store: Store, at: string): void {
  store.addProject({ ...DEMO_STORE, createdAt: at });
  const { title, messages } = seedThread("profit");
  const place = { kind: "main", projectId: DEMO_STORE.id } as const;
  store.addThread({ id: profit, title, place, createdAt: at, updatedAt: at, draft: "", messages });
}

// The lab stand-in with no pauses, so a reply streams at once.
const quickLab = () => createLabAgent({ replyDelayMs: 0, wordMs: 0 });

// A timer the test fires by hand: the delay the loop last asked for, and its callback.
type HandTimer = { delay: number | null; fire: () => void };

/** A mint whose clock the test moves: `clock.at` is what `now()` reads. */
export function movableMint(start: Date = asked): { mint: Mint; clock: { at: Date } } {
  const clock = { at: start };
  return { mint: { ...fixedMint(start), now: () => new Date(clock.at) }, clock };
}

/**
 * A loop on a fresh memory store holding the profit thread, with every notice it
 * posts collected in order; the store closes when the test ends. Its settling timer never runs
 * on its own: `timer` holds the delay last asked for, and firing it runs the pass.
 */
export async function startLoop(
  createAgent: LoopHost["createAgent"] = quickLab,
  mint: Mint = fixedMint(asked),
) {
  const notices: Notice[] = [];
  const store = await openSqliteStore({ kind: "memory" });
  onTestFinished(() => {
    store.close();
  });
  seedProfit(store, asked.toISOString());
  let pending: (() => void) | null = null;
  const timer: HandTimer = {
    delay: null,
    fire: () => {
      pending?.();
    },
  };
  const run = createAgentLoop({
    post: (notice) => {
      notices.push(notice);
    },
    open: () =>
      Promise.resolve({ store, source: { kind: "device", storage: "memory" }, mint, faults: {} }),
    createAgent,
    schedule: (delay, callback) => {
      timer.delay = delay;
      pending = callback;
      return () => {
        timer.delay = null;
        pending = null;
      };
    },
  });
  return { notices, store, run, timer };
}

/** The notices' kinds, with a run of one kind folded into one beat: state, chunk, state, done. */
export function beats(notices: Notice[]): string[] {
  return notices
    .map((notice) => notice.kind)
    .filter((kind, i, kinds) => i === 0 || kinds[i - 1] !== kind);
}

/** The `state` notices, in order. */
export function states(notices: Notice[]): Extract<Notice, { kind: "state" }>[] {
  return notices.flatMap((notice) => (notice.kind === "state" ? [notice] : []));
}

/**
 * The workspace the loop pushed last.
 * @throws When the loop pushed no state.
 */
export function lastWorkspace(notices: Notice[]): Workspace {
  const last = states(notices).at(-1);
  if (last === undefined) throw new Error("The loop pushed no state");
  return last.workspace;
}
