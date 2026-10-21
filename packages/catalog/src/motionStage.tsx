import type { ReactNode } from "react";

// Review stages share one surface so the greens are judged against the real paper.
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 32,
        alignItems: "flex-end",
        padding: 24,
        background: "var(--paper)",
      }}
    >
      {children}
    </div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <span style={{ font: "12px var(--font-text)", color: "var(--soft-ink)" }}>{children}</span>
  );
}

export function Labeled({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 10 }}>
      {children}
      <Caption>{caption}</Caption>
    </div>
  );
}

// A glyph beside a line of status text, as in a thread or the sidebar.
export function InLine({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        font: "14px var(--font-text)",
        color: "var(--soft-ink)",
      }}
    >
      {children}
      Kay is working on it
    </div>
  );
}
