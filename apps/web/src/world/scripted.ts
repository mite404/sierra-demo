import type { ReplyChunk, WorkStep } from "@yaklabs/catalog/reply";
import type { Clock } from "../demo/clock";
import type { Player, Progress } from "../demo/player";
import { childTurns, END_REPLY, openingTurns, play } from "../demo/replies";
import type { Script, Timed } from "../demo/script";
import { addChild, notified } from "./edits";
import { ids } from "./ids";
import { childOf, type ChildOf } from "./spec";
import type { Lease, Stage } from "./stage";

/** A take's replies: those still to answer with, in order, and how far the answered have got. */
export type Reel = { queue: Timed[][]; progress: Progress };

/** One playthrough of a show: its clock, reel, player and lease, and what ends it. */
export type Take = {
  number: number;
  clock: Clock;
  reel: Reel;
  player: Player;
  lease: Lease;
  stop: AbortController;
  unsubscribe: () => void;
};

// What a scripted reply writes to and reads from the page.
type Cast = { stage: Stage; reduceMotion: () => boolean };

// A running child a reply's steps moved, by its workspace id.
type Running = Map<string, { step: WorkStep; child: ChildOf }>;

// When a turn is made: the wall clock, as an instant, so a child's latest reply reads "just now".
const instant = (): string => new Date().toISOString();

// A step of the main's work, applied to the child it names under the take's lease: made on
// first sight, running, then answered, failed or cancelled; a failure leaves a note for the bell.
function moveChild(cast: Cast, take: Take, script: Script, step: WorkStep, child: ChildOf) {
  const { stage } = cast;
  const main = ids.show(script.id);
  if (!stage.holds(child.id)) {
    const opening = openingTurns(child, instant());
    take.lease.add(child.id, opening, addChild(child, main, opening, stage.stamp()));
  }
  const state = stage.state();
  const wasRunning = state.kind === "ready" && state.replying.includes(child.id);
  take.lease.keep(child.id, (turns) => childTurns(turns, step, instant()));
  const settled = step.status !== "running" && step.status !== "pending";
  if (step.status === "running" && !wasRunning) take.lease.begin(child.id);
  if (settled && wasRunning) take.lease.end(child.id);
  if (step.status !== "failed") return;
  const text = `${script.thread}: ${step.label} could not finish.`;
  const note = { id: ids.note(stage.count()), threadId: child.id, text, at: stage.stamp() };
  take.lease.commit(notified(note));
}

// What a scripted reply does with each chunk before it goes out: a step moves the child it
// names, under its workspace id.
function taker(cast: Cast, take: Take, script: Script, running: Running) {
  return (chunk: ReplyChunk): ReplyChunk => {
    if (typeof chunk === "string" || chunk.kind !== "step" || chunk.step.threadId === undefined)
      return chunk;
    const child = childOf(script, chunk.step.threadId);
    const step = { ...chunk.step, threadId: child.id };
    moveChild(cast, take, script, step, child);
    if (step.status === "running") running.set(child.id, { step, child });
    else running.delete(child.id);
    return { kind: "step", step };
  };
}

/**
 * The main's reply on `take`: the script's next, or the closing line once it is spent. A stop
 * cancels the children it still runs; either way the reply settles in the take's progress,
 * unless a Restart has retired the take meanwhile.
 * @throws When a step names a child the script does not.
 */
export async function* scripted(
  cast: Cast,
  take: Take,
  script: Script,
  signal: AbortSignal,
  changed: () => void,
): AsyncGenerator<ReplyChunk> {
  const { reel } = take;
  const ordinal = reel.progress.started;
  const events = reel.queue.shift() ?? END_REPLY;
  reel.progress = { ...reel.progress, started: ordinal + 1 };
  changed();
  const stop = AbortSignal.any([signal, take.stop.signal]);
  const running: Running = new Map();
  const moved = taker(cast, take, script, running);
  try {
    for await (const chunk of play(events, take.clock, stop, cast.reduceMotion()))
      yield moved(chunk);
  } finally {
    if (!take.lease.revoked()) {
      for (const each of running.values())
        moveChild(cast, take, script, { ...each.step, status: "cancelled" }, each.child);
      reel.progress = { ...reel.progress, settled: new Set([...reel.progress.settled, ordinal]) };
      changed();
    }
  }
}
