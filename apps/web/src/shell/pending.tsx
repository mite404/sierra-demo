import type { ReactNode } from "react";
import { QuietButton } from "../components/quiet-button";
import { useRestart, useRuntimeState } from "../runtime";

/** A quiet message centred in the workspace: what shows where no tab is. */
export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="font-serif text-2xl text-ink">{title}</p>
      {children}
    </div>
  );
}

/**
 * The workspace while the runtime is not ready: a quiet line while it starts (a held start
 * stays here), why it waits while another tab has the device's threads, and the reason with
 * Try again when it could not start.
 */
export function RuntimePending() {
  const state = useRuntimeState();
  const restart = useRestart();
  if (state.kind === "held") {
    return (
      <Notice title="Your threads are open in another tab">
        <p className="max-w-md text-sm text-soft-ink">
          This device keeps them in one tab at a time. Close the other tab and they open here.
        </p>
      </Notice>
    );
  }
  if (state.kind !== "broken") return <Notice title="Opening your threads…" />;
  return (
    <Notice title="Your threads could not be opened">
      <p className="max-w-md text-sm text-soft-ink">{state.reason}</p>
      {restart && <QuietButton onClick={restart}>Try again</QuietButton>}
    </Notice>
  );
}
