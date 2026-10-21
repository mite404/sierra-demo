import { expect, it } from "vitest";
import {
  appendDictation,
  deviceHint,
  liveNotice,
  NO_SPEECH_NOTICE,
  formatElapsed,
  levelFromSamples,
  simulatedLevel,
  simulatedTranscript,
} from "./dictation";

it("formats recording time as m:ss", () => {
  expect(formatElapsed(0)).toBe("0:00");
  expect(formatElapsed(7_900)).toBe("0:07");
  expect(formatElapsed(760_000)).toBe("12:40");
});

it("joins dictation onto a draft with exactly one space", () => {
  expect(appendDictation("", "  hello there ")).toBe("hello there");
  expect(appendDictation("Draft ", "more")).toBe("Draft more");
  expect(appendDictation("Draft", "   ")).toBe("Draft");
});

it("keeps simulated levels in range and quiet during pauses", () => {
  for (let ms = 0; ms < 10_000; ms += 37) {
    const level = simulatedLevel(ms);
    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThanOrEqual(1);
  }
  expect(simulatedLevel(2_500)).toBeLessThan(0.05);
});

it("reveals the simulated transcript word by word and never goes backwards", () => {
  let previous = "";
  for (let ms = 0; ms < 8_000; ms += 100) {
    const text = simulatedTranscript(ms);
    expect(text.startsWith(previous)).toBe(true);
    previous = text;
  }
  expect(simulatedTranscript(0)).toBe("");
  expect(previous.length).toBeGreaterThan(20);
});

it("measures silence as zero and a full-scale signal as loud", () => {
  expect(levelFromSamples(new Float32Array(256))).toBe(0);
  expect(levelFromSamples(new Float32Array(256).fill(0.5))).toBe(1);
});

it("tells the live modal's user the most pressing thing first, and nothing while all is well", () => {
  const well = {
    microphoneError: undefined,
    supported: true,
    failure: undefined,
  };
  expect(liveNotice(well)).toBeUndefined();
  expect(liveNotice({ ...well, microphoneError: "Blocked", supported: false })).toBe("Blocked");
  expect(liveNotice({ ...well, supported: false })).toBe(NO_SPEECH_NOTICE);
  expect(liveNotice({ ...well, failure: "Unreachable" })).toBe("Unreachable");
});

it("says under a live input what it does, and nothing for a simulated one", () => {
  expect(deviceHint("default", true)).toBe("Turns speech into text");
  expect(deviceHint("usb", true)).toBe("Waveform only");
  expect(deviceHint("default", false)).toBeUndefined();
  expect(deviceHint("usb", false)).toBeUndefined();
});
