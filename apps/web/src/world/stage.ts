import type { ThreadMessage } from "@yaklabs/catalog/thread";
import {
  threadIdSchema,
  type RuntimeState,
  type Source,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import { coveredBy, recast, removal, restored, type Edit, type Slice, type Tomb } from "./edits";
import { leaseIn, type Lease, type LeaseDeps } from "./lease";

export type { Lease, Turned } from "./lease";

/** What a stage opens on: the workspace, every thread's turns, and the instants minted so far. */
export type Seed = {
  workspace: Workspace;
  transcripts: Map<string, ThreadMessage[]>;
  minted: number;
};

/**
 * The overlay's one store. Each change shows a new `state()` and tells every listener; turns
 * change only under a lease, and a reset takes a slice back in the same commit that revokes
 * the leases on it.
 */
export type Stage = {
  state(): RuntimeState;
  subscribe(listener: () => void): () => void;
  /** @throws Once the stage is disposed. */
  workspace(): Workspace;
  /** @throws For a thread the workspace lacks. */
  thread(id: string): ThreadSummary;
  /** @throws For a thread the workspace lacks. */
  turnsOf(id: string): ThreadMessage[];
  /** Whether the stage holds turns for `id`: a thread it made, even one deleted since. */
  holds(id: string): boolean;
  /** The wording of the question last docked on `id`, if any. */
  questionOf(id: string): string | undefined;
  /** Whether a project, thread or share has this id, or a delete of it can still be undone. */
  owns(id: string): boolean;
  /** A new instant, a second after the last, so what is made later sorts later. */
  stamp(): string;
  /** The next number for an id the overlay mints: a thread, a project or a note. */
  count(): number;
  /** A user verb's edit: a rename, a mark, a share, a new thread or project. */
  commit(edit?: Edit): void;
  /**
   * Removes `id` and every thread under it, their notes and shares, keeping the tomb for an
   * exhume: one commit, so the workspace and the tomb never part. A no-op once broken.
   * @throws For a thread the workspace lacks.
   */
  bury(id: string): void;
  /**
   * Puts the tomb of `id` back as it was: one commit as the tomb leaves, so a broken stage can
   * neither restore it nor lose it. A no-op once broken.
   * @throws When nothing of `id` lies buried.
   */
  exhume(id: string): void;
  lease(ids: readonly string[]): Lease;
  /**
   * Puts a slice back as it opens, in one commit: revokes every lease on its main and on every
   * child the main has now or had in a tomb, drops their turns, reply counts, questions and
   * tombs, then puts the slice's threads, turns and lanes in their place. Idempotent: two resets
   * with the same slice leave the same workspace.
   */
  reset(slice: Slice): void;
  /** Revokes every lease and leaves the state broken with `reason`. */
  dispose(reason: string): void;
};

// Every instant starts from the demo's own morning, as a scenario's clock does (scenarios.ts).
const CLOCK = Date.parse("2026-09-29T09:00:00.000Z");

// The closest honest source the schema has: a mock, never the device's data (ADR-096).
const SOURCE: Source = { kind: "scenario", name: "demo" };

/** The instant `n` seconds after the demo's morning. */
export function instantAt(n: number): string {
  return new Date(CLOCK + n * 1000).toISOString();
}

// Everything a stage changes: its state, every thread's turns, reply counts and docked
// question, the tombs a restore takes back, and how many resets each thread has seen.
type Held = {
  state: RuntimeState;
  transcripts: Map<string, ThreadMessage[]>;
  replying: Map<string, number>; // thread id → replies in flight, in the order they began
  questions: Map<string, string>; // thread id → the question docked last
  tombs: Map<string, Tomb>; // deleted thread id → what its restore puts back
  epochs: Map<string, number>; // thread id → resets that covered it
  listeners: Set<() => void>;
  minted: number; // instants minted so far
  made: number; // ids counted out so far
};

function tell(held: Held): void {
  for (const listener of held.listeners) listener();
}

// Applies one edit, or none, and shows the state it leaves, with the reply counts, as new.
function commitIn(held: Held, edit: Edit = (ws) => ws): void {
  if (held.state.kind !== "ready") return;
  const replying = [...held.replying.keys()].map((id) => threadIdSchema.parse(id));
  held.state = { ...held.state, workspace: edit(held.state.workspace), replying };
  tell(held);
}

// Puts `slice` back as it opens, revoking every lease on what it covers (see `Stage.reset`).
function resetIn(held: Held, slice: Slice): void {
  if (held.state.kind !== "ready") return;
  const covered = coveredBy(held.state.workspace, held.tombs, slice); // → thread ids
  for (const id of covered) {
    held.epochs.set(id, (held.epochs.get(id) ?? 0) + 1); // → its leases are revoked from here on
    held.transcripts.delete(id);
    held.replying.delete(id);
    held.questions.delete(id);
  }
  for (const [id, tomb] of held.tombs)
    if (tomb.threads.some((each) => covered.has(each.id))) held.tombs.delete(id);
  for (const [id, turns] of slice.transcripts) held.transcripts.set(id, turns);
  commitIn(held, recast(slice));
}

// The stage's reads: the workspace, a thread and its turns, each refusing what is not there.
function reads(held: Held): Pick<Stage, "workspace" | "thread" | "turnsOf" | "owns"> {
  const workspace = (): Workspace => {
    if (held.state.kind !== "ready") throw new Error("The scripted demo has stopped");
    return held.state.workspace;
  };
  const thread = (id: string): ThreadSummary => {
    const found = workspace().threads.find((each) => each.id === id);
    if (found === undefined) throw new Error(`There is no thread "${id}" in this demo`);
    return found;
  };
  return {
    workspace,
    thread,
    turnsOf: (id) => {
      thread(id);
      return held.transcripts.get(id) ?? [];
    },
    owns: (id) => {
      if (held.state.kind !== "ready") return false;
      const { projects, threads, shares } = held.state.workspace;
      const listed = [...projects, ...threads, ...shares].some((each) => each.id === id);
      return listed || held.tombs.has(id);
    },
  };
}

// The stage's guts as a lease writes through them (see `LeaseDeps`).
function leaseDeps(held: Held): LeaseDeps {
  return {
    transcripts: held.transcripts,
    replying: held.replying,
    questions: held.questions,
    epochs: held.epochs,
    ready: () => held.state.kind === "ready",
    commit: (edit) => {
      commitIn(held, edit);
    },
    stamp: () => instantAt(++held.minted),
  };
}

// Removes `id` and keeps its tomb, in one commit (see `Stage.bury`).
function buryIn(held: Held, thread: (id: string) => ThreadSummary, id: string): void {
  if (held.state.kind !== "ready") return;
  thread(id); // throws for a thread the workspace lacks
  const { ws, tomb } = removal(held.state.workspace, id); // → the subtree out, the tomb aside
  held.tombs.set(id, tomb);
  commitIn(held, () => ws);
}

// Puts the tomb of `id` back, in one commit (see `Stage.exhume`).
function exhumeIn(held: Held, id: string): void {
  if (held.state.kind !== "ready") return;
  const tomb = held.tombs.get(id);
  if (tomb === undefined) throw new Error(`There is no deleted thread "${id}" to restore`);
  held.tombs.delete(id);
  commitIn(held, restored(tomb));
}

/** A stage over `seed`, ready, with no replies in flight and no leases taken. */
export function createStage(seed: Seed): Stage {
  const held: Held = {
    state: { kind: "ready", source: SOURCE, workspace: seed.workspace, replying: [] },
    transcripts: new Map(seed.transcripts),
    replying: new Map(),
    questions: new Map(),
    tombs: new Map(),
    epochs: new Map(),
    listeners: new Set(),
    minted: seed.minted,
    made: 0,
  };
  const read = reads(held);
  return {
    ...read,
    state: () => held.state,
    subscribe: (listener) => {
      held.listeners.add(listener);
      return () => {
        held.listeners.delete(listener);
      };
    },
    holds: (id) => held.transcripts.has(id),
    questionOf: (id) => held.questions.get(id),
    stamp: () => instantAt(++held.minted),
    count: () => ++held.made,
    commit: (edit) => {
      commitIn(held, edit);
    },
    bury: (id) => {
      buryIn(held, read.thread, id);
    },
    exhume: (id) => {
      exhumeIn(held, id);
    },
    lease: (taken) => leaseIn(leaseDeps(held), taken),
    reset: (slice) => {
      resetIn(held, slice);
    },
    dispose: (reason) => {
      held.state = { kind: "broken", source: SOURCE, reason };
      tell(held);
    },
  };
}
