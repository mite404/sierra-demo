import type { AgentEvent } from "@yaklabs/catalog/agent";
import type { ThreadHandle } from "@yaklabs/catalog/thread";
import { describe, expect, it } from "vitest";
import type { Clock } from "./clock";
import { DEMO_WORLD } from "../world/demo";
import { ids } from "../world/ids";
import { scriptsOf, show, worldOf } from "../world/spec";
import { createWorld, type World } from "../world/world";
import { createPlayer, cuesOf, type Played, type Player } from "./player";
import { at, type Beat, type Script } from "./script";

// The Demo's script by its id.
function scriptFor(id: string): Script {
  const found = scriptsOf(DEMO_WORLD).find((script) => script.id === id);
  if (found === undefined) throw new Error(`The Demo has no script "${id}"`);
  return found;
}

// Every beat of a script the user performs, in order.
const userBeats = (script: Script): Beat[] => script.beats.filter((beat) => beat.kind !== "reply");

// A clock on which every wait is over after one turn of the event loop; `before` sees each.
function clockThat(before: (ms: number) => void = () => {}): Clock {
  return {
    state: () => ({ rate: 1, paused: false }),
    subscribe: () => () => {},
    wait: async (ms) => {
      before(ms);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    },
    setRate: () => {},
    pause: () => {},
    resume: () => {},
  };
}

// A world playing `script` alone, its show's takes on `clock`, and what a player watches of it.
function staged(script: Script, clock: Clock): { world: World; played: Played } {
  const spec = worldOf({ projects: [{ id: ids.project, name: "Demo", threads: [show(script)] }] });
  const world = createWorld(spec, { panels: new Map(), clock: () => clock });
  const main = ids.show(script.id);
  const running = world.showOf(main);
  if (running === undefined) throw new Error(`No show plays on ${main}`);
  const played: Played = {
    main,
    progress: () => running.progress(),
    subscribe: (listener) => running.subscribe(listener),
    open: (id) => world.open(id),
  };
  return { world, played };
}

// A stand-in for the thread panel: it sends what its handle is told to the world's agent, as
// the panel would, and notes each call.
function fakePanel(world: World, main: Played["main"]): { handle: ThreadHandle; calls: string[] } {
  const calls: string[] = [];
  const live = new Set<AbortController>();
  let draft = "";
  const tell = (event: AgentEvent) => {
    const stop = new AbortController();
    live.add(stop);
    void (async () => {
      const chunks = [];
      for await (const chunk of world.agent(main).respond(event, stop.signal)) {
        if (stop.signal.aborted) break;
        chunks.push(chunk);
      }
      live.delete(stop);
    })();
  };
  const handle: ThreadHandle = {
    setDraft: (text) => {
      draft = text;
    },
    send: () => {
      calls.push(`send ${draft}`);
      tell({ kind: "message", text: draft, attachments: [] });
      draft = "";
    },
    answer: (text) => {
      calls.push(`answer ${text}`);
      tell({ kind: "answer", text });
    },
    stageAnswer: (text, phase) => {
      calls.push(`${phase ?? "clear"} ${text}`);
    },
    choose: (measure) => {
      calls.push(`choose ${measure}`);
    },
    stop: () => {
      calls.push("stop");
      for (const each of live) each.abort();
    },
    retry: () => {
      calls.push("retry");
      tell({ kind: "message", text: "again", attachments: [] });
    },
  };
  return { handle, calls };
}

// Resolves once the player is done.
function finished(player: Player): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (player.state().status === "done") resolve();
    };
    player.subscribe(check);
    check();
  });
}

// What the fake panel notes for one user beat: an answer shows on the card, hovered, selected
// and pressed, before it is sent.
function noted(beat: Beat): string[] {
  if (beat.kind === "user") return [`send ${beat.text}`];
  if (beat.kind === "answer")
    return ["hover", "selected", "pressed", "answer"].map((step) => `${step} ${beat.text}`);
  if (beat.kind === "choose") return [`choose ${beat.measure}`];
  return [beat.kind];
}

// The presenter answering the docked question before the player's 777ms pause is over.
function presenterAnswersFirst(panel: ThreadHandle): Clock {
  let answered = false;
  return clockThat((ms) => {
    if (ms !== 777 || answered) return;
    answered = true;
    panel.answer("Billing first");
  });
}

describe("the demo player", () => {
  it("waits on the reply before each beat, or counts from the beat before it", () => {
    const beats: Beat[] = [
      { kind: "user", after: 900, text: "Go" },
      { kind: "reply", events: [] },
      { kind: "user", after: 500, overlap: true, text: "Meanwhile" },
      { kind: "reply", events: [] },
      { kind: "stop", after: 1800 },
      { kind: "user", after: 2200, text: "Only the north" },
      { kind: "reply", events: [] },
    ];
    expect(cuesOf(beats).map((cue) => [cue.beat.kind, cue.settles])).toEqual([
      ["user", null],
      ["user", null],
      ["stop", 1],
      ["user", null],
    ]);
    expect(cuesOf(scriptFor("brief").beats).map((cue) => cue.settles)).toEqual([null, 0]);
  });

  it.each(["brief", "interrupted", "returned"])(
    "performs every user beat of %s through the panel, in order, and ends done",
    async (id) => {
      const script = scriptFor(id);
      const { world, played } = staged(script, clockThat());
      const panel = fakePanel(world, played.main);
      const player = createPlayer({
        script,
        runtime: played,
        clock: clockThat(),
        panels: new Map([[played.main, panel.handle]]),
      });
      expect(player.state().status).toBe("idle");
      player.play();
      await finished(player);
      expect(panel.calls).toEqual(userBeats(script).flatMap((beat) => noted(beat)));
      expect(played.progress().settled.size).toBe(played.progress().started);
    },
  );
});

describe("the demo player and the presenter", () => {
  it("does not answer again when the presenter answered first", async () => {
    const script: Script = {
      ...scriptFor("brief"),
      beats: [
        { kind: "user", after: 0, text: "Draft it" },
        { kind: "reply", events: [at(0, "Which order?")] },
        { kind: "answer", after: 777, text: "Oldest first" },
        { kind: "reply", events: [at(0, "Done.")] },
      ],
    };
    const { world, played } = staged(script, clockThat());
    const panel = fakePanel(world, played.main);
    const clock = presenterAnswersFirst(panel.handle);
    const player = createPlayer({
      script,
      runtime: played,
      clock,
      panels: new Map([[played.main, panel.handle]]),
    });
    player.play();
    await finished(player);
    expect(panel.calls).toEqual(["send Draft it", "answer Billing first"]);
  });
});

describe("the demo player's time", () => {
  it("pauses the clock with it, and counts only the time it played", () => {
    let wall = 1_000;
    const paused: boolean[] = [];
    const clock = {
      ...clockThat(),
      pause: () => paused.push(true),
      resume: () => paused.push(false),
    };
    const script = scriptFor("brief");
    const { played } = staged(script, clock);
    const player = createPlayer({
      script,
      runtime: played,
      clock,
      panels: new Map(),
      now: () => wall,
    });
    player.play();
    wall += 400;
    player.pause();
    wall += 5_000;
    expect(player.state().status).toBe("paused");
    expect(player.elapsed()).toBe(400);
    player.play();
    wall += 100;
    expect(player.elapsed()).toBe(500);
    expect(paused).toEqual([true, false]);
    player.dispose();
  });
});
