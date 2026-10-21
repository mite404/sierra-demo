import {
  laneIdSchema,
  newCardLaneId,
  projectIdSchema,
  randomSuffix,
  threadIdSchema,
  type LaneId,
  type ProjectId,
  type ThreadId,
} from "./workspace";

/**
 * Where the worker gets every new id and instant. On the device ids are random and time is
 * real; in a scenario ids count up and the clock never moves, so a load is the same every time.
 */
export type Mint = {
  project(): ProjectId;
  thread(): ThreadId;
  /** A card lane's id; a thread lane's id is always `l-<threadId>`. */
  lane(): LaneId;
  now(): Date;
  /** A turn's time of day as the seeds write it, "9:02": local on the device, UTC in a scenario. */
  turnTime(at: Date): string;
};

// "9:02", "10:02".
function clock(hours: number, minutes: number): string {
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/** Random ids and the real clock, for the device. */
export function liveMint(): Mint {
  return {
    project: () => projectIdSchema.parse(`p-${randomSuffix()}`),
    thread: () => threadIdSchema.parse(`t-${randomSuffix()}`),
    lane: newCardLaneId,
    now: () => new Date(),
    turnTime: (at) => clock(at.getHours(), at.getMinutes()),
  };
}

/**
 * Counted ids (`p-001`, `t-001`, `c-001`, each kind on its own count) and a clock stopped at
 * `at`, for scenarios. Zero-padded, so ids sort in the order they were minted.
 */
export function fixedMint(at: Date): Mint {
  const counts = { p: 0, t: 0, c: 0 };
  const next = (kind: keyof typeof counts) => `${kind}-${String(++counts[kind]).padStart(3, "0")}`;
  return {
    project: () => projectIdSchema.parse(next("p")),
    thread: () => threadIdSchema.parse(next("t")),
    lane: () => laneIdSchema.parse(next("c")),
    now: () => new Date(at),
    turnTime: (time) => clock(time.getUTCHours(), time.getUTCMinutes()),
  };
}
