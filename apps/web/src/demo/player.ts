import type { AnswerPhase } from "@yaklabs/catalog/awaiting";
import type { ThreadHandle, ThreadMessage } from "@yaklabs/catalog/thread";
import type { ThreadId } from "@yaklabs/runtime";
import type { Clock, Rate } from "./clock";
import type { Beat, Script } from "./script";

/**
 * How far a script's replies have got: how many the scripted agent has started, in script
 * order, and which of those have settled (ended, failed or been stopped).
 */
export type Progress = { started: number; settled: ReadonlySet<number> };

/** What a player watches: the thread it plays, its replies' progress, and the turns it holds. */
export type Played = {
  main: ThreadId;
  /** The same object until a reply starts or settles; `subscribe` hears both. */
  progress(): Progress;
  subscribe(listener: () => void): () => void;
  open(id: ThreadId): Promise<ThreadMessage[]>;
};

/** Where a playthrough stands: not started, playing, paused, or played to the end. */
export type PlayerStatus = "idle" | "playing" | "paused" | "done";

/**
 * The player's state, the same object until it changes: its status, the beat it is on, when
 * the current stretch of play began (while playing), and the wall time played before it.
 */
export type PlayerState = {
  status: PlayerStatus;
  beat: number;
  startedAt?: number;
  playedMs: number;
};

/** A scripted demo's player: it performs the script's user beats through the thread's controls. */
export type Player = {
  state(): PlayerState;
  /** Calls `listener` after every change to `state()`; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Starts the script, or goes on from a pause; nothing once it is done. */
  play(): void;
  /** Holds the script where it is, the replies streaming with it, since both wait on the clock. */
  pause(): void;
  setRate(rate: Rate): void;
  /** Wall time played so far, pauses left out. */
  elapsed(): number;
  /** Stops for good; nothing more is performed. */
  dispose(): void;
};

/** What a player plays with: the script, the thread playing it, its clock, and the panels. */
export type PlayerDeps = {
  script: Script;
  runtime: Played;
  clock: Clock;
  /** The mounted thread panels' handles, by thread id. */
  panels: { get(id: string): ThreadHandle | undefined };
  now?: () => number;
};

// A beat the player performs, and the reply whose settling it waits on before its `after`
// (null: it counts from the beat before it, or from the start).
type Cue = { at: number; beat: Exclude<Beat, { kind: "reply" }>; settles: number | null };

// One playthrough's parts, and the signal that ends it.
type Stage = Omit<PlayerDeps, "now"> & { signal: AbortSignal };

// A keystroke's pause at 1x: a quick, steady typist.
const TYPE_MS = 18;
// How long each step of answering the docked question shows at 1x, as a hand would give it:
// the pointer resting on the tile, the tile selected, Submit held down (Ethan: "we need to see a
// hover state and then the submit btn depressed and submitted").
const ANSWER_STEPS: readonly (readonly [AnswerPhase, number])[] = [
  ["hover", 700],
  ["selected", 600],
  ["pressed", 180],
];
// How often the player looks for the main thread's panel while it mounts.
const LOOK_MS = 50;

const graphemes = new Intl.Segmenter();

/**
 * The beats the player performs, each with the reply it waits on: a beat right after a reply
 * waits for that reply to settle; one with `overlap`, or after a beat of its own (a Stop),
 * counts from that beat, so a second request can go out while the first reply still streams.
 */
export function cuesOf(beats: Beat[]): Cue[] {
  let replies = 0;
  return beats.flatMap((beat, at) => {
    if (beat.kind === "reply") {
      replies += 1;
      return [];
    }
    const overlaps = beat.kind === "user" && beat.overlap === true;
    const afterReply = beats[at - 1]?.kind === "reply";
    return [{ at, beat, settles: overlaps || !afterReply ? null : replies - 1 }];
  });
}

// How many turns in `turns` are the user's.
function userTurns(turns: ThreadMessage[]): number {
  return turns.filter((turn) => turn.role === "user").length;
}

// Resolves once `ready` holds, checked now and after every change the runtime reports, or on
// abort.
function until(stage: Stage, ready: () => boolean): Promise<void> {
  const { runtime, signal } = stage;
  return new Promise((resolve) => {
    const check = () => {
      if (!ready() && !signal.aborted) return;
      stop();
      signal.removeEventListener("abort", check);
      resolve();
    };
    const stop = runtime.subscribe(check);
    signal.addEventListener("abort", check, { once: true });
    check();
  });
}

// Every reply the script has, and any the presenter added, started and settled.
function allSettled(stage: Stage): Promise<void> {
  const replies = stage.script.beats.filter((beat) => beat.kind === "reply").length;
  return until(stage, () => {
    const { started, settled } = stage.runtime.progress();
    return started >= replies && settled.size >= started;
  });
}

// The main thread's handle, once its panel is mounted.
async function handleOf(stage: Stage): Promise<ThreadHandle | undefined> {
  const { panels, runtime, clock, signal } = stage;
  let found = panels.get(runtime.main);
  while (found === undefined && !signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- it looks again only after a pause
    await clock.wait(LOOK_MS, signal);
    found = panels.get(runtime.main);
  }
  return found;
}

// Types `text` into the compose box a character at a time, as a person would, then sends it.
async function request(stage: Stage, text: string): Promise<void> {
  const characters = Array.from(graphemes.segment(text), (each) => each.segment);
  for (let typed = 1; typed <= characters.length; typed += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each keystroke lands before the next
    (await handleOf(stage))?.setDraft(characters.slice(0, typed).join(""));
    // oxlint-disable-next-line no-await-in-loop -- as above
    await stage.clock.wait(TYPE_MS, stage.signal);
    if (stage.signal.aborted) return;
  }
  (await handleOf(stage))?.send();
}

// Gives the answer through the docked card the way a hand would: each step of `ANSWER_STEPS`
// shown for its pause on the show's clock, so Pause and 2x hold it too, then sent.
async function answer(stage: Stage, text: string): Promise<void> {
  for (const [phase, ms] of ANSWER_STEPS) {
    // oxlint-disable-next-line no-await-in-loop -- each step shows before the next
    (await handleOf(stage))?.stageAnswer(text, phase);
    // oxlint-disable-next-line no-await-in-loop -- as above
    await stage.clock.wait(ms, stage.signal);
    if (stage.signal.aborted) return;
  }
  (await handleOf(stage))?.answer(text);
}

// Performs one beat through the main thread's handle. An answer the presenter already gave
// (the user has more turns than `asked`) is not given again.
async function perform(stage: Stage, beat: Cue["beat"], asked: number): Promise<void> {
  if (beat.kind === "user") {
    await request(stage, beat.text);
    return;
  }
  if (beat.kind === "answer") {
    if (userTurns(await stage.runtime.open(stage.runtime.main)) > asked) return;
    await answer(stage, beat.text);
    return;
  }
  const handle = await handleOf(stage);
  switch (beat.kind) {
    case "choose":
      handle?.choose(beat.measure);
      return;
    case "stop":
      handle?.stop();
      return;
    case "retry":
      handle?.retry();
      return;
    default: {
      const unhandled: never = beat;
      return unhandled;
    }
  }
}

// Walks the script's cues in order: each waits on its reply, then its `after`, then is
// performed. Resolves once every reply has settled, or on abort.
async function playThrough(stage: Stage, onBeat: (at: number) => void): Promise<void> {
  const { runtime, clock, signal } = stage;
  for (const cue of cuesOf(stage.script.beats)) {
    onBeat(cue.at);
    const { settles } = cue;
    // oxlint-disable-next-line no-await-in-loop -- a beat waits on the reply before it
    if (settles !== null) await until(stage, () => runtime.progress().settled.has(settles));
    // oxlint-disable-next-line no-await-in-loop -- the user's turns as the wait begins
    const asked = userTurns(await runtime.open(runtime.main));
    // oxlint-disable-next-line no-await-in-loop -- then the beat's own pause
    await clock.wait(cue.beat.after, signal);
    if (signal.aborted) return;
    // oxlint-disable-next-line no-await-in-loop -- beats happen one after another
    await perform(stage, cue.beat, asked);
  }
  await allSettled(stage);
}

/**
 * A player for `script`: a state machine from idle through playing and paused to done. It walks
 * the script's beats and performs the user's through the main thread's handle (typing into the
 * compose box, then sending; answering the docked question; Stop; Try again), each after its
 * `after` on the clock. The replies are the runtime's to play when the panel asks, so the
 * player only waits for them to settle.
 */
export function createPlayer({ now = () => performance.now(), ...deps }: PlayerDeps): Player {
  const stopped = new AbortController();
  const listeners = new Set<() => void>();
  let state: PlayerState = { status: "idle", beat: 0, playedMs: 0 };
  const set = (next: Partial<PlayerState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const elapsed = () =>
    state.playedMs + (state.startedAt === undefined ? 0 : now() - state.startedAt);
  // The stretch of play so far folded into `playedMs`, as a pause or the end leaves it.
  const banked = () => ({ playedMs: elapsed(), startedAt: undefined });
  const stage: Stage = { ...deps, signal: stopped.signal };
  const run = async () => {
    await playThrough(stage, (beat) => {
      set({ beat });
    });
    if (!stopped.signal.aborted)
      set({ status: "done", beat: deps.script.beats.length, ...banked() });
  };
  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    play: () => {
      if (state.status === "done" || state.status === "playing") return;
      const starting = state.status === "idle";
      if (!starting) deps.clock.resume();
      set({ status: "playing", startedAt: now() });
      if (starting) void run();
    },
    pause: () => {
      if (state.status !== "playing") return;
      deps.clock.pause();
      set({ status: "paused", ...banked() });
    },
    setRate: (rate) => {
      deps.clock.setRate(rate);
    },
    elapsed,
    dispose: () => {
      stopped.abort();
    },
  };
}
