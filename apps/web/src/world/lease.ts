import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { touched, withThread, type Edit } from "./edits";

/**
 * A writer's right to some threads' turns, reply counts and docked questions, until a reset of
 * any of them takes it back. The Stage has no other door to a thread's turns, so a reply still
 * unwinding after a reset can never write into the take that replaced it. Once revoked, every
 * write does nothing.
 */
export type Lease = {
  /** True once a reset covered a thread the lease was taken for or wrote, or the stage stopped. */
  revoked(): boolean;
  /** Changes a thread's turns, and its summary with them. */
  keep(id: string, change: Turned): void;
  /** Changes a thread's turns without telling anyone yet: a streaming reply's next word. */
  hold(id: string, change: Turned): void;
  /** Adds a thread through `edit`, holding `turns`, in one commit. */
  add(id: string, turns: ThreadMessage[], edit: Edit): void;
  begin(id: string): void;
  end(id: string): void;
  /** Keeps the wording of the question just docked on `id`, for the answer that follows. */
  asked(id: string, wording: string | undefined): void;
  /** A workspace edit on behalf of the lease's threads, such as a note for the bell. */
  commit(edit: Edit): void;
};

/** A change to one thread's turns, from what they are now. */
export type Turned = (turns: ThreadMessage[]) => ThreadMessage[];

// What a lease writes through: the stage's own maps, its readiness, its publish and its clock.
export type LeaseDeps = {
  transcripts: Map<string, ThreadMessage[]>;
  replying: Map<string, number>; // thread id → replies in flight
  questions: Map<string, string>; // thread id → the question docked last
  epochs: Map<string, number>; // thread id → resets that covered it
  ready(): boolean;
  commit(edit?: Edit): void;
  stamp(): string;
};

const epochOf = (deps: LeaseDeps, id: string): number => deps.epochs.get(id) ?? 0;

// A lease's guard: each thread's epoch as it joins the lease, which a reset moves on, so the
// lease is revoked once any of them moved or the stage stopped.
function guardOf(deps: LeaseDeps, taken: readonly string[]) {
  const seen = new Map(taken.map((id) => [id, epochOf(deps, id)] as const)); // → id → epoch
  const revoked = () =>
    !deps.ready() || [...seen].some(([id, epoch]) => epochOf(deps, id) !== epoch);
  // Runs `write` for `id` unless the lease is revoked; `id` joins the lease as it writes.
  const under = (id: string, write: () => void) => {
    if (!seen.has(id)) seen.set(id, epochOf(deps, id));
    if (!revoked()) write();
  };
  return { revoked, under };
}

function tally(deps: LeaseDeps, id: string, by: number): void {
  const left = (deps.replying.get(id) ?? 0) + by;
  if (left > 0) deps.replying.set(id, left);
  else deps.replying.delete(id);
  deps.commit();
}

// A lease on `taken` (see `Lease`).
export function leaseIn(deps: LeaseDeps, taken: readonly string[]): Lease {
  const { revoked, under } = guardOf(deps, taken);
  // Changes the turns of `id` and returns them.
  const set = (id: string, change: Turned) => {
    const turns = change(deps.transcripts.get(id) ?? []);
    deps.transcripts.set(id, turns);
    return turns;
  };
  return {
    revoked,
    keep: (id, change) => {
      under(id, () => {
        const turns = set(id, change);
        deps.commit(withThread(id, touched(turns, deps.stamp())));
      });
    },
    hold: (id, change) => {
      under(id, () => {
        set(id, change);
      });
    },
    add: (id, turns, edit) => {
      under(id, () => {
        set(id, () => turns);
        deps.commit(edit);
      });
    },
    begin: (id) => {
      under(id, () => {
        tally(deps, id, 1);
      });
    },
    end: (id) => {
      under(id, () => {
        tally(deps, id, -1);
      });
    },
    asked: (id, wording) => {
      under(id, () => {
        if (wording === undefined) deps.questions.delete(id);
        else deps.questions.set(id, wording);
      });
    },
    commit: (edit) => {
      if (!revoked()) deps.commit(edit);
    },
  };
}
