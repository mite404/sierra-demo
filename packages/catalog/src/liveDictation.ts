import { levelFromSamples, type AudioDevice } from "./dictation";

// The live dictation source: the user's microphone, measured frame by frame, and the browser's
// speech service. Each starter begins listening at once and returns the function that stops it.

// Minimal Web Speech API surface; it is not in TypeScript's DOM library.
type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }>>;
type SpeechRecognizer = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  addEventListener(type: "start" | "end", listener: () => void): void;
  addEventListener(type: "result", listener: (event: { results: SpeechResultList }) => void): void;
  addEventListener(type: "error", listener: (event: { error: string }) => void): void;
  start: () => void;
  stop: () => void;
};
/** A speech recognizer's class, as the browser names it (`SpeechRecognition`). */
export type SpeechRecognizerClass = new () => SpeechRecognizer;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognizerClass;
  webkitSpeechRecognition?: SpeechRecognizerClass;
};

// Where a live microphone reports to while it listens.
type MicrophoneSink = {
  onLevel: (level: number) => void;
  onDevices: (devices: AudioDevice[]) => void;
  onError: (message: string) => void;
};

// Where the speech service reports to while it listens: the words, and a failure that ends it.
type SpeechSink = {
  onText: (text: string) => void;
  onFailure: (message: string) => void;
};

// How long the speech service has to answer a start before the user hears it is not coming.
const ANSWER_MS = 4000;

// What the user reads when the speech service stops for good, by the error it names. The
// waveform comes from the microphone itself, so it keeps moving when this fails; the words
// are the only place that can say so.
const SPEECH_FAILURES: Record<string, string> = {
  "not-allowed": "Speech recognition is blocked for this site. Allow it in your browser settings.",
  "service-not-allowed":
    "This browser's speech service is turned off, so no text will appear. On a Mac, Safari needs Dictation on.",
  network: "This browser's speech service could not be reached, so no text will appear.",
  "audio-capture": "The speech service could not hear the microphone, so no text will appear.",
  "language-not-supported":
    "The speech service does not know this browser's language, so no text will appear.",
};

/** What the user reads when the speech service does not answer at all. */
export const SILENT_SPEECH =
  "This browser's speech service did not answer, so no text will appear.";

/**
 * What the user reads for a speech error, or undefined for one the service gets over: a
 * stretch of silence, or the stop the page itself asked for.
 */
export function speechFailure(error: string): string | undefined {
  if (error === "no-speech" || error === "aborted") return undefined;
  return SPEECH_FAILURES[error] ?? `Speech recognition failed (${error}), so no text will appear.`;
}

/** The words heard so far: those of the sessions before, then the current session's. */
export function heardSoFar(kept: string, session: string): string {
  return [kept, session]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" ");
}

// What the user reads when the microphone cannot open, by the reason the browser gives.
function microphoneError(reason: unknown): string {
  return reason instanceof DOMException && reason.name === "NotAllowedError"
    ? "Microphone access was blocked. Allow it in your browser settings to dictate."
    : "No microphone could be opened.";
}

/**
 * An input's name without the USB vendor and product ids Chrome appends ("Razer BlackShark V2 X
 * USB (1532:0557)"), which read as noise (Ethan); words in brackets, "(Built-in)" or
 * "(Virtual)", stay.
 */
export function inputName(browserLabel: string): string {
  return browserLabel.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "").trim();
}

// The device the system's default is now, by name, from the browser's label for it
// ("Default - MacBook Pro Microphone"); empty where the browser does not say.
const defaultDevice = (browserLabel: string): string =>
  inputName(browserLabel.replace(/^Default\s*-\s*/, ""));

/**
 * The picker's name for the system's default input, with the device it is now where the browser
 * says, since the speech service always hears that one.
 */
export function defaultLabel(browserLabel: string): string {
  const device = defaultDevice(browserLabel);
  return device === "" ? "System Default" : `System Default (${device})`;
}

/**
 * The inputs to pick from, named for the picker: the system's default first as the browser
 * lists it, then every other input but the one the default is now, which would only repeat it
 * (Ethan); unnamed inputs are numbered.
 */
export function pickableInputs(
  all: Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">[],
): AudioDevice[] {
  const inputs = all.filter((device) => device.kind === "audioinput");
  const current = defaultDevice(inputs.find((each) => each.deviceId === "default")?.label ?? "");
  return inputs
    .map((device, index) => ({
      id: device.deviceId,
      label:
        device.deviceId === "default"
          ? defaultLabel(device.label)
          : inputName(device.label) || `Microphone ${index + 1}`,
    }))
    .filter((device) => device.id === "default" || current === "" || device.label !== current);
}

/** The browser's speech recognizer, prefixed or not, or undefined where there is none. */
export function speechRecognizer(): SpeechRecognizerClass | undefined {
  const speechWindow: SpeechWindow = window;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

/**
 * Opens a microphone, reports its level every animation frame, then lists the inputs to pick
 * from. Failures, including a refused permission, go to `sink.onError`, never to the caller.
 * @returns The stop: it closes the stream, even one granted after stopping was asked for.
 */
export function listenToMicrophone(deviceId: string, sink: MicrophoneSink): () => void {
  let stopped = false;
  let frame = 0;
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;

  async function listen() {
    try {
      const audio = deviceId === "default" ? true : { deviceId: { exact: deviceId } };
      const granted = await navigator.mediaDevices.getUserMedia({ audio }); // → MediaStream
      if (stopped) {
        granted.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      stream = granted;
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(granted).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const measure = () => {
        analyser.getFloatTimeDomainData(samples);
        sink.onLevel(levelFromSamples(samples));
        frame = requestAnimationFrame(measure);
      };
      measure();
      const all = await navigator.mediaDevices.enumerateDevices(); // → MediaDeviceInfo[]
      sink.onDevices(pickableInputs(all)); // → AudioDevice[]
    } catch (reason: unknown) {
      sink.onError(microphoneError(reason));
    }
  }

  void listen();
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    void context?.close();
  };
}

// A recognizer that keeps listening and reports words as they form, in the browser's language.
function continuousRecognizer(Recognizer: SpeechRecognizerClass): SpeechRecognizer {
  const recognizer = new Recognizer();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = navigator.language || "en-US";
  return recognizer;
}

/**
 * Runs the browser's speech service continuously, reporting the whole transcript so far each
 * time it changes. Chrome ends a continuous session after a pause, so a session that ended
 * while still wanted starts again and the words already heard are kept. A service that fails,
 * or never answers within ANSWER_MS, goes to `sink.onFailure` with words for the user, never
 * to the caller.
 * @returns The stop.
 */
export function transcribe(Recognizer: SpeechRecognizerClass, sink: SpeechSink): () => void {
  let stopped = false;
  let failed = false;
  let answered = false; // → the current session has started
  let kept = ""; // → the words of the sessions before this one
  let session = "";
  const fail = (message: string) => {
    failed = true;
    sink.onFailure(message);
  };
  const recognizer = continuousRecognizer(Recognizer);
  recognizer.addEventListener("start", () => {
    answered = true;
  });
  recognizer.addEventListener("result", (event) => {
    // Chrome starts each result after the first with a space, so runs of space close up.
    session = Array.from(event.results, (result) => result[0].transcript)
      .join(" ")
      .replaceAll(/\s+/g, " ");
    sink.onText(heardSoFar(kept, session));
  });
  recognizer.addEventListener("error", (event) => {
    const message = speechFailure(event.error); // → string | undefined
    if (message !== undefined) fail(message);
  });
  recognizer.addEventListener("end", () => {
    if (stopped || failed) return;
    // A session that ends without ever starting would end again at once: say so, once.
    if (!answered) {
      fail(SILENT_SPEECH);
      return;
    }
    kept = heardSoFar(kept, session);
    session = "";
    answered = false;
    recognizer.start();
  });
  const unanswered = setTimeout(() => {
    if (!answered && !stopped && !failed) fail(SILENT_SPEECH);
  }, ANSWER_MS);
  recognizer.start();
  return () => {
    stopped = true;
    clearTimeout(unanswered);
    recognizer.stop();
  };
}
