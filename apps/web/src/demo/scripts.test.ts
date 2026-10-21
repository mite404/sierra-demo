import { describe, expect, it } from "vitest";
import { DEMO_WORLD } from "../world/demo";
import { scriptsOf } from "../world/spec";
import { durationOf, type Beat } from "./script";

const scripts = scriptsOf(DEMO_WORLD);

// The interview walkthrough: about a minute of playback at 1x, and never past three with the
// pauses that stand in for reading time.
const PLAYBACK_MS = 90_000;
const WALKTHROUGH_MS = 180_000;

// How long a script plays at 1x with no reading time: every reply's events and every wait
// before a user beat, ignoring the overlap that runs a request during a reply.
function playbackOf(beats: Beat[]): number {
  return beats.reduce(
    (sum, beat) => sum + (beat.kind === "reply" ? durationOf(beat.events) : beat.after),
    0,
  );
}

describe("the scripted scenarios", () => {
  it.each(scripts)("$id plays in about a minute and well under three", (script) => {
    const playback = playbackOf(script.beats); // → ms at 1x
    expect(playback).toBeLessThan(PLAYBACK_MS);
    expect(playback + 60_000).toBeLessThan(WALKTHROUGH_MS);
  });

  it.each(scripts)("$id opens with a request and answers every request with a reply", (script) => {
    const first = script.beats.find((beat) => beat.kind !== "choose"); // → a card step may lead
    expect(first?.kind).toBe("user");
    const unanswered = script.beats.filter(
      (beat, at) =>
        (beat.kind === "user" || beat.kind === "answer" || beat.kind === "retry") &&
        script.beats[at + 1]?.kind !== "reply",
    );
    expect(unanswered).toEqual([]);
  });

  it("shows three separations of concern", () => {
    expect(scripts.map((script) => script.id)).toEqual(["brief", "interrupted", "returned"]);
    const returned = scripts.at(-1)?.beats.filter((beat) => beat.kind !== "reply");
    expect(returned?.map((beat) => beat.kind)).toEqual(["choose", "user", "answer"]);
  });
});
