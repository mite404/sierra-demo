/* eslint-disable vitest/no-conditional-in-test, vitest/no-conditional-expect, no-await-in-loop, max-lines-per-function -- Exhaustive traces branch on generated events and serialize permission schedules. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenToMicrophone, transcribe, type SpeechRecognizerClass } from "./liveDictation";

type SpeechEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
  error: string;
};
type Listener = (event: SpeechEvent) => void;
type StopEvent = "start" | "end" | "result" | "silence" | "network" | "wait3999" | "wait1";
type TranscriptEvent = "alpha" | "beta" | "empty" | "pause" | "silence";

const stopAlphabet: StopEvent[] = [
  "start",
  "end",
  "result",
  "silence",
  "network",
  "wait3999",
  "wait1",
];
const suffixAlphabet: StopEvent[] = ["start", "end", "silence", "wait3999"];
const transcriptAlphabet: TranscriptEvent[] = ["alpha", "beta", "empty", "pause", "silence"];
const snapshots = {
  alpha: { parts: ["  alpha  "], expected: "alpha" },
  beta: { parts: [" beta", " gamma  "], expected: "beta gamma" },
  empty: { parts: [], expected: "" },
};

function* sequences<T>(alphabet: readonly T[], bound: number): Generator<T[]> {
  yield [];
  if (bound === 0) return;
  for (const head of alphabet) {
    for (const tail of sequences(alphabet, bound - 1)) yield [head, ...tail];
  }
}

function speechService() {
  const listeners = new Map<string, Listener[]>();
  const calls = { start: 0, stop: 0 };
  const Recognizer: SpeechRecognizerClass = class {
    continuous = false;
    interimResults = false;
    lang = "";
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }
    start() {
      calls.start += 1;
    }
    stop() {
      calls.stop += 1;
    }
  };
  const emit = (type: string, event: Partial<SpeechEvent> = {}) => {
    for (const listener of listeners.get(type) ?? []) {
      listener({ results: [], error: "", ...event });
    }
  };
  const said = (parts: string[]) => {
    emit("result", { results: parts.map((transcript) => [{ transcript }]) });
  };
  return { Recognizer, calls, emit, said };
}

function deliver(service: ReturnType<typeof speechService>, event: StopEvent) {
  switch (event) {
    case "start":
    case "end":
      service.emit(event);
      return;
    case "result":
      service.said(["alpha"]);
      return;
    case "silence":
      service.emit("error", { error: "no-speech" });
      return;
    case "network":
      service.emit("error", { error: "network" });
      return;
    case "wait3999":
      vi.advanceTimersByTime(3999);
      return;
    case "wait1":
      vi.advanceTimersByTime(1);
      return;
    default: {
      const exhaustive: never = event;
      throw new Error(`Unhandled event ${String(exhaustive)}`);
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded verification of the real voice lifecycle", () => {
  it("never restarts after stop across all 8,400 bounded event pairs", () => {
    let checked = 0;
    for (const prefix of sequences(stopAlphabet, 3)) {
      for (const suffix of sequences(suffixAlphabet, 2)) {
        const service = speechService();
        const stop = transcribe(service.Recognizer, { onText: () => {}, onFailure: () => {} });
        for (const event of prefix) deliver(service, event);
        stop();
        const startsAtStop = service.calls.start;
        for (const event of suffix) {
          deliver(service, event);
          expect({ prefix, suffix, event, starts: service.calls.start }).toEqual({
            prefix,
            suffix,
            event,
            starts: startsAtStop,
          });
        }
        // Always probe a late end, including an answered start queued after stop.
        service.emit("start");
        service.emit("end");
        vi.advanceTimersByTime(4000);
        service.emit("end");
        expect({ prefix, suffix, starts: service.calls.start }).toEqual({
          prefix,
          suffix,
          starts: startsAtStop,
        });
        vi.clearAllTimers();
        checked += 1;
      }
    }
    expect(checked).toBe(8400);
  });

  it("preserves completed sessions across all 3,906 permitted transcript sequences", () => {
    let checked = 0;
    for (const sequence of sequences(transcriptAlphabet, 5)) {
      const service = speechService();
      const heard: string[] = [];
      const failures: string[] = [];
      const stop = transcribe(service.Recognizer, {
        onText: (text) => {
          heard.push(text);
        },
        onFailure: (message) => {
          failures.push(message);
        },
      });
      const completed: string[] = [];
      let current = "";
      service.emit("start");
      for (const event of sequence) {
        if (event === "pause") {
          if (current !== "") completed.push(current);
          current = "";
          service.emit("end");
          service.emit("start");
        } else if (event === "silence") {
          service.emit("error", { error: "no-speech" });
        } else {
          const snapshot = snapshots[event];
          current = snapshot.expected;
          service.said(snapshot.parts);
          expect({ sequence, text: heard.at(-1) }).toEqual({
            sequence,
            text: [...completed, current].filter((part) => part !== "").join(" "),
          });
        }
      }
      service.said(["probe"]);
      expect({ sequence, text: heard.at(-1) }).toEqual({
        sequence,
        text: [...completed, "probe"].join(" "),
      });
      expect({ sequence, failures }).toEqual({ sequence, failures: [] });
      stop();
      vi.clearAllTimers();
      checked += 1;
    }
    expect(checked).toBe(3906);
  });

  it("closes every late-granted track across 27 bounded grant schedules", async () => {
    const schedules = [1, 2, 3].flatMap((trackCount) =>
      [1, 2, 3].flatMap((stopCount) =>
        [0, 1, 2].map((delay) => ({ trackCount, stopCount, delay })),
      ),
    );
    expect(schedules).toHaveLength(27);
    for (const { trackCount, stopCount, delay } of schedules) {
      const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn<() => void>() }));
      const stream = { getTracks: () => tracks };
      let grant: (granted: typeof stream) => void = () => {
        throw new Error(`Microphone permission request did not run for ${trackCount} tracks`);
      };
      const pending = new Promise<typeof stream>((resolve) => {
        grant = resolve;
      });
      const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();
      const AudioContext = vi.fn<() => void>();
      const sink = {
        onLevel: vi.fn<(level: number) => void>(),
        onDevices: vi.fn<Parameters<typeof listenToMicrophone>[1]["onDevices"]>(),
        onError: vi.fn<(message: string) => void>(),
      };
      vi.stubGlobal("navigator", {
        mediaDevices: { getUserMedia: () => pending, enumerateDevices },
      });
      vi.stubGlobal("AudioContext", AudioContext);
      vi.stubGlobal("cancelAnimationFrame", vi.fn<(frame: number) => void>());
      const stop = listenToMicrophone("default", sink);
      for (let index = 0; index < stopCount; index += 1) stop();
      for (let index = 0; index < delay; index += 1) await Promise.resolve();
      grant(stream);
      await pending;
      await Promise.resolve();
      for (const track of tracks) expect(track.stop).toHaveBeenCalledExactlyOnceWith();
      expect(AudioContext).not.toHaveBeenCalled();
      expect(enumerateDevices).not.toHaveBeenCalled();
      expect(sink.onLevel).not.toHaveBeenCalled();
      expect(sink.onDevices).not.toHaveBeenCalled();
      expect(sink.onError).not.toHaveBeenCalled();
    }
  });
});
