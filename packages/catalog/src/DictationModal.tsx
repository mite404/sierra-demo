import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { formatElapsed, DEFAULT_MIC_WARNING, type AudioDevice } from "./dictation";
import { useDictationView } from "./dictationSession";
import { DevicePicker } from "./DevicePicker";
import { Modal } from "./Modal";
import { Waveform } from "./Waveform";
import "./dictation.css";

/** Where audio comes from: a deterministic simulation, or the user's real microphone. */
export type DictationSource = "simulated" | "microphone";

// The modal handles Tab and Escape; an open microphone picker takes Escape first, and Enter
// anywhere but on a button finishes the recording.
function keyAction(
  key: string,
  picking: boolean,
  onButton: boolean,
): "close-picker" | "done" | undefined {
  if (key === "Escape" && picking) return "close-picker";
  if (key === "Enter" && !onButton) return "done";
  return undefined;
}

// The modal's keys by `keyAction`: what an open picker or Enter asks for, done here.
const keyHandler =
  (picking: boolean, setPicking: (open: boolean) => void, finish: () => void) =>
  (event: KeyboardEvent<HTMLElement>): void => {
    const action = keyAction(event.key, picking, event.target instanceof HTMLButtonElement);
    if (action === undefined) return;
    event.preventDefault();
    if (action === "close-picker") setPicking(false);
    else finish();
  };

// The transcript so far, or the prompt to speak.
function Transcript({ transcript }: { transcript: string }) {
  const heard = transcript !== "";
  return (
    <p className={heard ? "dictation-text" : "dictation-text muted"} aria-live="polite">
      {heard ? transcript : "Start speaking…"}
    </p>
  );
}

// The modal's name, with a pulsing dot and how long it has been listening.
function DictationTitle({ elapsed }: { elapsed: number }) {
  return (
    <p id="dictation-title">
      <span className="rec-dot" aria-hidden="true" />
      Listening
      <span className="dictation-time">{formatElapsed(elapsed)}</span>
    </p>
  );
}

// The title with the clock, the microphone picker, and the standing warning, if any, which also
// explains the list.
function DictationHeader({
  elapsed,
  devices,
  deviceId,
  live,
  warning,
  picking,
  onPicking,
  onPick,
}: {
  elapsed: number;
  devices: AudioDevice[];
  deviceId: string;
  live: boolean;
  warning: string | undefined;
  picking: boolean;
  onPicking: (open: boolean) => void;
  onPick: (id: string) => void;
}) {
  const warningId = useId();
  return (
    <>
      <header className="dictation-header">
        <DictationTitle elapsed={elapsed} />
        <DevicePicker
          devices={devices}
          deviceId={deviceId}
          live={live}
          describedBy={warning === undefined ? undefined : warningId}
          open={picking}
          onToggle={() => {
            onPicking(!picking);
          }}
          onPick={(id) => {
            onPick(id);
            onPicking(false);
          }}
        />
      </header>
      {warning !== undefined && (
        <p id={warningId} className="dictation-notice dictation-mic-warning">
          {warning}
        </p>
      )}
    </>
  );
}

// A ref whose element takes the focus as the caller opens. Called from the modal itself, not
// the footer: a child's effect runs before Modal's own, which would then take the focus to the
// first control, while the modal's runs after it.
function useFocusOnOpen<T extends HTMLElement>(): RefObject<T | null> {
  const element = useRef<T>(null);
  useEffect(() => {
    element.current?.focus();
  }, []);
  return element;
}

// Cancel and Done; the modal puts the focus on Done as it opens, so Enter finishes.
function DictationFooter({
  doneButton,
  onCancel,
  onDone,
}: {
  doneButton: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <footer className="dictation-footer">
      <span className="muted">Typing is paused while recording</span>
      <div>
        <button className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button ref={doneButton} className="dictation-done" onClick={onDone}>
          <span className="stop-square" aria-hidden="true" /> Done
        </button>
      </div>
    </footer>
  );
}

/**
 * Full-attention dictation: a modal over the thread that makes clear typing is paused
 * while recording, with a large center-playhead waveform, a live transcript preview,
 * and a microphone picker. One warning sits under the header, the only one it shows (Ethan):
 * why no speech can become text, while that lasts; else with the live microphone, that only
 * the system's default input turns speech into text. Esc cancels; Enter (or Done) inserts the
 * text.
 * @param note The host's standing warning in place of the live one, such as the Demo's pointer
 *   to where speech can really be tested; none and a simulated source shows no warning.
 */
export function DictationModal({
  source,
  note,
  onCancel,
  onDone,
}: {
  source: DictationSource;
  note?: string;
  onCancel: () => void;
  onDone: (transcript: string) => void;
}) {
  const live = source === "microphone";
  const [deviceId, setDeviceId] = useState("default");
  const [picking, setPicking] = useState(false);
  const { devices, transcript, read, notice, elapsed } = useDictationView(live, deviceId);
  const doneButton = useFocusOnOpen<HTMLButtonElement>();

  return (
    <Modal
      className="dictation"
      labelledBy="dictation-title"
      onClose={onCancel}
      onKeyDown={keyHandler(picking, setPicking, () => {
        onDone(transcript);
      })}
    >
      <DictationHeader
        elapsed={elapsed}
        devices={devices}
        deviceId={deviceId}
        live={live}
        warning={notice ?? note ?? (live ? DEFAULT_MIC_WARNING : undefined)}
        picking={picking}
        onPicking={setPicking}
        onPick={setDeviceId}
      />
      <Waveform read={read} />
      <Transcript transcript={transcript} />
      <DictationFooter
        doneButton={doneButton}
        onCancel={onCancel}
        onDone={() => {
          onDone(transcript);
        }}
      />
    </Modal>
  );
}
