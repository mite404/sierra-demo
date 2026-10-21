// Inline icons keep the lab dependency-free; strokes follow currentColor.
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A chevron pointing right; rotates to point down when `open`. */
export function ChevronIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      style={{ transform: open ? "rotate(90deg)" : undefined }}
    >
      <path d="M6 3.5 10.5 8 6 12.5" {...STROKE} />
    </svg>
  );
}

/** Share: an arrow leaving a box. */
export function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M8 2.5v7M5 5l3-3 3 3M3.5 8.5v4a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-4" {...STROKE} />
    </svg>
  );
}

/** A chain link, for copying a link. */
export function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6"
        {...STROKE}
      />
    </svg>
  );
}

/** A window with an arrow: opens in a new tab. */
export function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M9.5 2.5h4v4M13.5 2.5 8 8M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"
        {...STROKE}
      />
    </svg>
  );
}

/** A stack of files, for attaching images and files. */
export function FilesIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M11.5 6.3 7.1 10.7a1.9 1.9 0 0 1-2.7-2.7l4.6-4.6a3.1 3.1 0 0 1 4.4 4.4L8.8 12.4a4.3 4.3 0 0 1-6.1-6.1L6.8 2.2"
        {...STROKE}
      />
    </svg>
  );
}

/** A monitor, for taking a screenshot. */
export function ScreenIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="2" y="3" width="12" height="8" rx="1" {...STROKE} />
      <path d="M6 13.5h4M8 11v2.5" {...STROKE} />
    </svg>
  );
}

/** A magnifier, for searching a thread. */
export function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" {...STROKE} />
      <path d="m10.5 10.5 3 3" {...STROKE} />
    </svg>
  );
}

/** A bookmark ribbon, for the requests sent in a thread. */
export function BookmarkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M4.5 2.5h7v11L8 10.5l-3.5 3z" {...STROKE} />
    </svg>
  );
}

/** A chevron pointing up, or down when `down`: to the previous or next match. */
export function StepIcon({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d={down ? "M3.5 6 8 10.5 12.5 6" : "M3.5 10 8 5.5l4.5 4.5"} {...STROKE} />
    </svg>
  );
}

/** A cross, for closing. */
export function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="m4 4 8 8M12 4l-8 8" {...STROKE} />
    </svg>
  );
}

/** A branch leaving a trunk: a child thread, spawned by the agent or spun off by the user. */
export function ChildThreadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4.5 2.5v6a2 2 0 0 0 2 2h6M10 8l2.5 2.5L10 13" {...STROKE} />
    </svg>
  );
}

/** A square, for stopping a reply in flight. */
export function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
