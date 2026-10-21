import { useEffect, useRef, useState } from "react";
import {
  SIMULATED_DEVICES,
  liveNotice,
  simulatedLevel,
  simulatedTranscript,
  type AudioDevice,
} from "./dictation";
import { listenToMicrophone, speechRecognizer, transcribe } from "./liveDictation";

// A dictation recording's state for DictationModal: its clock, the microphone and the speech
// service it listens to, and what the modal shows of them.

// How often the visible timer and simulated transcript refresh.
const CLOCK_MS = 250;

// Live input: a real microphone stream measured by an AnalyserNode.
function useMicrophone(enabled: boolean, deviceId: string) {
  const level = useRef(0);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const stop = enabled
      ? listenToMicrophone(deviceId, {
          onLevel: (value) => {
            level.current = value;
          },
          onDevices: setDevices,
          onError: setError,
        })
      : undefined;
    return () => {
      stop?.();
    };
  }, [enabled, deviceId]);

  return { read: () => level.current, devices, error };
}

// Live transcription through the browser's speech service, where one exists, and what to tell
// the user when it fails, since the waveform keeps moving either way.
function useSpeechTranscript(enabled: boolean) {
  const [text, setText] = useState("");
  const [failure, setFailure] = useState<string>();
  const Recognizer = speechRecognizer();
  const supported = Recognizer !== undefined;

  useEffect(() => {
    const sink = { onText: setText, onFailure: setFailure };
    const stop = enabled && Recognizer ? transcribe(Recognizer, sink) : undefined;
    return () => {
      stop?.();
    };
  }, [enabled, Recognizer]);

  return { text, supported, failure };
}

type Microphone = ReturnType<typeof useMicrophone>;
type Speech = ReturnType<typeof useSpeechTranscript>;

// What the modal shows for its source: the devices, the transcript so far, the level to draw,
// and a notice when the browser cannot deliver part of it.
type DictationView = {
  devices: AudioDevice[];
  transcript: string;
  read: () => number;
  notice: string | undefined;
};

function viewFor(
  live: boolean,
  microphone: Microphone,
  speech: Speech,
  elapsed: number,
  startedAt: number,
): DictationView {
  if (!live) {
    return {
      devices: SIMULATED_DEVICES,
      transcript: simulatedTranscript(elapsed),
      read: () => simulatedLevel(performance.now() - startedAt),
      notice: undefined,
    };
  }
  return {
    devices: microphone.devices,
    transcript: speech.text,
    read: microphone.read,
    notice: liveNotice({
      microphoneError: microphone.error,
      supported: speech.supported,
      failure: speech.failure,
    }),
  };
}

// The recording's clock: when it started, read once on the first render so it never moves, and
// how long it has run, refreshed every CLOCK_MS.
function useRecordingClock() {
  const [startedAt] = useState(() => performance.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(performance.now() - startedAt);
    }, CLOCK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [startedAt]);
  return { startedAt, elapsed };
}

/**
 * A recording's clock and what the dictation modal shows for its source: the devices to pick
 * from, the transcript so far, the level to draw, and a notice when part of it cannot come.
 * @param live Whether it listens to the real microphone rather than playing the simulation.
 */
export function useDictationView(
  live: boolean,
  deviceId: string,
): DictationView & { elapsed: number } {
  const { startedAt, elapsed } = useRecordingClock();
  const microphone = useMicrophone(live, deviceId);
  const speech = useSpeechTranscript(live && microphone.error === undefined);
  return { ...viewFor(live, microphone, speech, elapsed, startedAt), elapsed };
}
