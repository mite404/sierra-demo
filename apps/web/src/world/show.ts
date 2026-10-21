import type { Agent } from "@yaklabs/catalog/agent";
import type { ThreadHandle } from "@yaklabs/catalog/thread";
import type { ProjectId, ThreadId } from "@yaklabs/runtime";
import type { Clock, Rate } from "../demo/clock";
import { createPlayer, type PlayerState, type Progress } from "../demo/player";
import type { Script, Timed } from "../demo/script";
import { ids } from "./ids";
import { openingOf } from "./opening";
import { scripted, type Reel, type Take } from "./scripted";
import type { Stage } from "./stage";

/** Where a show stands, the same object until it changes: its player's, its rate and its take. */
export type ShowState = PlayerState & {
  rate: Rate;
  /** Counts restarts; a new take is a new number. */
  take: number;
};

/**
 * One scripted thread and the take now playing on it. A take is one playthrough: its clock, its
 * player, its queue of replies, its progress, and a lease on the show's threads. Restart ends
 * the take and seats the next on the same thread id, touching nothing outside the show's own
 * main and children, so the other shows, the Live Playground and the visitor's threads carry on.
 */
export type Show = {
  readonly thread: ThreadId;
  readonly script: Script;
  /** How the show answers its main thread: the take's next reply, or the closing line. */
  readonly agent: Agent;
  state(): ShowState;
  /** Calls `listener` after every change to `state()` or to the take's progress. */
  subscribe(listener: () => void): () => void;
  /** How far the take's replies have got. */
  progress(): Progress;
  /** Starts the take, or goes on from a pause; nothing once it is done. */
  play(): void;
  pause(): void;
  /** Kept across takes: a restarted show plays at the rate it had. */
  setRate(rate: Rate): void;
  /** Wall time played in this take, pauses left out. */
  elapsed(): number;
  /**
   * Ends this take and seats the next, idle: the player and every reply of the take stop, the
   * compose box's draft is cleared through the panel's handle, and the stage puts the show's
   * thread back as it opens (a returned show's times counted from now). Twice is once.
   */
  restart(): void;
  dispose(): void;
};

/** What a show plays with; tests pass their own clock and time. */
export type ShowDeps = {
  stage: Stage;
  /** The mounted thread panels' handles, by thread id. */
  panels: { get(id: string): ThreadHandle | undefined };
  /** The project the show's thread sits in, and the instant it was made. */
  project: ProjectId;
  at: string;
  reduceMotion: () => boolean;
  /** A fresh clock for each take. */
  clock: () => Clock;
  /** The wall clock in epoch ms, which a returned show's opening counts back from. */
  now: () => number;
};

// What a take reports to its show: every change to the show's state, and how to hear them.
type Tell = { changed: () => void; subscribe: (listener: () => void) => () => void };

// The replies a script answers with, in order.
const repliesOf = (script: Script): Timed[][] =>
  script.beats.flatMap((beat) => (beat.kind === "reply" ? [beat.events] : []));

// Adds `listener` to `listeners` and returns how to take it back.
function hear(listeners: Set<() => void>, listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Take `number` of `script`, idle, at `rate`: a fresh clock, the script's replies still to come,
// a player that performs its user beats, and a lease on the show's main.
function seat(script: Script, deps: ShowDeps, number: number, rate: Rate, tell: Tell): Take {
  const { stage, panels } = deps;
  const main = ids.show(script.id);
  const clock = deps.clock();
  clock.setRate(rate);
  const reel: Reel = { queue: repliesOf(script), progress: { started: 0, settled: new Set() } };
  const watched = {
    main,
    progress: () => reel.progress,
    subscribe: tell.subscribe,
    open: (id: ThreadId) => Promise.resolve(stage.turnsOf(id)),
  };
  const player = createPlayer({ script, runtime: watched, clock, panels });
  const lease = stage.lease([main]);
  const stop = new AbortController();
  return { number, clock, reel, player, lease, stop, unsubscribe: player.subscribe(tell.changed) };
}

// Ends a take: its player and every reply it still plays stop.
function retire(take: Take): void {
  take.stop.abort();
  take.player.dispose();
  take.unsubscribe();
}

/**
 * A show of `script` on its main thread, seated on its first take, idle. Its `agent` answers
 * each request on the main with the take's next reply, moving the children its steps name
 * under the take's lease.
 */
export function createShow(script: Script, deps: ShowDeps): Show {
  const main = ids.show(script.id);
  const listeners = new Set<() => void>();
  let rate: Rate = 1;
  const stateOf = (of: Take): ShowState => ({ ...of.player.state(), rate, take: of.number });
  // Seated after `tell`, whose `changed` reads them; declared first so an early fire is safe.
  let take: Take;
  let current: ShowState;
  const tell: Tell = {
    changed: () => {
      current = stateOf(take);
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => hear(listeners, listener),
  };
  take = seat(script, deps, 1, rate, tell);
  current = stateOf(take);
  return {
    thread: main,
    script,
    agent: { respond: (event, signal) => scripted(deps, take, script, signal, tell.changed) },
    state: () => current,
    subscribe: tell.subscribe,
    progress: () => take.reel.progress,
    play: () => {
      take.player.play();
    },
    pause: () => {
      take.player.pause();
    },
    setRate: (next) => {
      rate = next;
      take.clock.setRate(next);
      tell.changed();
    },
    elapsed: () => take.player.elapsed(),
    restart: () => {
      retire(take);
      deps.panels.get(main)?.setDraft("");
      deps.stage.reset(openingOf(script, deps.project, deps.at, deps.now()));
      take = seat(script, deps, take.number + 1, rate, tell);
      tell.changed();
    },
    dispose: () => {
      retire(take);
    },
  };
}
