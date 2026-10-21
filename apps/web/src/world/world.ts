import type { Agent } from "@yaklabs/catalog/agent";
import { labAgent } from "@yaklabs/catalog/labAgent";
import { createClock } from "../demo/clock";
import type { Overlay } from "./compose";
import { converse } from "./converse";
import { seedOf } from "./seed";
import { createShow, type Show, type ShowDeps } from "./show";
import type { Seat, WorldSpec } from "./spec";
import { createStage } from "./stage";
import { menuVerbs, workspaceVerbs } from "./verbs";

/** An overlay that plays a world's shows, and finds the show on a main thread. */
export type World = Overlay & {
  /** The show playing on `main`, if that thread is one. */
  showOf(main: string): Show | undefined;
};

/** What a world reads from the page; tests pass their own. */
export type WorldDeps = {
  /** The mounted thread panels' handles, by thread id, which the shows' players drive. */
  panels: ShowDeps["panels"];
  /** Whether a reply's words land a block at a time rather than a word at a time. */
  reduceMotion?: () => boolean;
  /** A fresh clock for each take of each show. */
  clock?: ShowDeps["clock"];
  /** The wall clock in epoch ms. */
  now?: () => number;
};

// Whether the page asks for less motion; a page without a window never does.
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Who answers a thread in its seat: its show, or the lab stand-in.
function answererOf(seat: Seat<Show>): Agent {
  switch (seat.kind) {
    case "scripted":
      return seat.script.agent;
    case "lab":
      return labAgent;
    default: {
      const unhandled: never = seat;
      return unhandled;
    }
  }
}

/**
 * An overlay that opens `spec` in memory, with nothing kept on the device: every show seated on
 * its first take, idle, and every other thread (what the visitor makes, the children a show
 * spawns) answered by the lab stand-in, each reply kept as structured turns. Reload starts it
 * clean.
 * @throws When a show's opening names a child its script does not.
 */
export function createWorld(spec: WorldSpec, deps: WorldDeps): World {
  const now = deps.now ?? Date.now;
  const { placed, seed } = seedOf(spec, now());
  const stage = createStage(seed);
  const shows = new Map<string, Show>(
    placed.map(({ show, project, at }) => {
      const running = createShow(show.script, {
        stage,
        panels: deps.panels,
        project,
        at,
        reduceMotion: deps.reduceMotion ?? prefersReducedMotion,
        clock: deps.clock ?? (() => createClock()),
        now,
      });
      return [running.thread, running];
    }),
  );
  const seatOf = (id: string): Seat<Show> => {
    const show = shows.get(id);
    return show === undefined ? { kind: "lab" } : { kind: "scripted", script: show };
  };
  return {
    state: () => stage.state(),
    subscribe: (listener) => stage.subscribe(listener),
    ...workspaceVerbs(stage),
    ...menuVerbs(stage),
    agent: (id) => ({
      respond: (event, signal) => converse(stage, id, event, answererOf(seatOf(id)), signal),
    }),
    owns: (id) => stage.owns(id),
    showOf: (main) => shows.get(main),
    dispose: () => {
      for (const show of shows.values()) show.dispose();
      stage.dispose("The scripted demo was closed");
    },
  };
}
