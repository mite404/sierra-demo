import { deviceHint, type AudioDevice } from "./dictation";

// One input in the open list: its radio dot, its name, and with a live microphone what it does,
// since only the system's default turns speech into text (Ethan).
function DeviceOption({
  device,
  selected,
  live,
  onPick,
}: {
  device: AudioDevice;
  selected: boolean;
  live: boolean;
  onPick: (id: string) => void;
}) {
  const hint = deviceHint(device.id, live); // → string | undefined
  return (
    <button
      className="device-option"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- <option> is valid only inside a <select>, which this list cannot be
      role="option"
      aria-selected={selected}
      onClick={() => {
        onPick(device.id);
      }}
    >
      <span className="radio" aria-hidden="true" />
      <span className="device-name">
        {device.label}
        {hint !== undefined && <span className="device-hint">{hint}</span>}
      </span>
    </button>
  );
}

// The open list: the inputs as a listbox, described by the modal's warning when there is one.
function DeviceList({
  devices,
  deviceId,
  live,
  describedBy,
  onPick,
}: {
  devices: AudioDevice[];
  deviceId: string;
  live: boolean;
  describedBy: string | undefined;
  onPick: (id: string) => void;
}) {
  return (
    <div className="device-list">
      {/* Options sit directly in the listbox: an <li> there fails axe's listitem rule. */}
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a <select> cannot draw these radio-dot rows; this is the ARIA listbox pattern
        role="listbox"
        aria-label="Choose microphone"
        aria-describedby={describedBy}
      >
        {devices.map((item) => (
          <DeviceOption
            key={item.id}
            device={item}
            selected={item.id === deviceId}
            live={live}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The dictation modal's microphone list: a button naming the current input, and while open a
 * listbox of inputs. With a live microphone each input says what it does, since the browser's
 * speech service hears only the system's default.
 * @param describedBy The id of the words that explain the list, the modal's standing warning.
 */
export function DevicePicker({
  devices,
  deviceId,
  live,
  describedBy,
  open,
  onToggle,
  onPick,
}: {
  devices: AudioDevice[];
  deviceId: string;
  live: boolean;
  describedBy?: string;
  open: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
}) {
  const device = devices.find((item) => item.id === deviceId) ?? {
    id: "default",
    label: "System Default",
  };
  return (
    <div className="device-picker">
      <span className="device-label">Input:</span>
      <button aria-haspopup="listbox" aria-expanded={open} onClick={onToggle}>
        {device.label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <DeviceList
          devices={devices}
          deviceId={deviceId}
          live={live}
          describedBy={describedBy}
          onPick={onPick}
        />
      )}
    </div>
  );
}
