import { Button } from "@yaklabs/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@yaklabs/ui/components/dialog";
import { SidebarProvider } from "@yaklabs/ui/components/sidebar";
import { useEffect, useState } from "react";
import { SimulationAuthoring } from "./simulation-authoring";
import { readLab, resetDemo, restoreLab } from "./simulation-persistence";
import "./simulation.css";

function DemoReset({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const reset = async () => {
    setPending(true);
    setError(false);
    try {
      await resetDemo();
      window.location.reload();
    } catch {
      setError(true);
      setPending(false);
    }
  };
  return (
    <footer className="lab-demo-footer">
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setError(false);
          setOpen(true);
        }}
      >
        Reset demo
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Reset demo?</DialogTitle>
            <DialogDescription>
              Delete all saved simulations, run results and chats from this demo. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="lab-invitation">
            {error && (
              <p role="alert">
                Reset was not confirmed. Check the library and finish any active work before trying
                again.
              </p>
            )}
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                void reset();
              }}
            >
              {pending ? "Resetting…" : "Reset demo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </footer>
  );
}

function LessonWorkspace() {
  const [saved] = useState(readLab);
  const [restored, setRestored] = useState<Awaited<ReturnType<typeof restoreLab>> | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    void restoreLab(saved).then(setRestored);
  }, [saved]);
  return (
    <main className="simulation-lab lab-library">
      <header className="lab-header">
        <span>Independent educational demo · synthetic accounts and payments</span>
      </header>
      <SidebarProvider className="lab-workspace">
        <div className="lab-stage">
          {restored ? (
            <SimulationAuthoring
              restored={restored.author}
              unavailable={restored.authorUnavailable}
              locked={locked}
              onLock={setLocked}
            />
          ) : (
            <output>Restoring your simulation…</output>
          )}
        </div>
      </SidebarProvider>
      <DemoReset disabled={locked || restored === null} />
    </main>
  );
}

/** One authoring conversation and a saved library share the lesson's stable desktop shell. */
export function SimulationLab() {
  return (
    <>
      <div data-slot="desk" className="lab-desk" aria-hidden="true" />
      <div data-slot="window" className="lab-window">
        <header data-slot="title-bar" className="lab-title-bar chrome-surface">
          <div data-slot="traffic-lights" className="lab-traffic-lights" aria-hidden="true">
            {["close", "minimise", "zoom"].map((light) => (
              <span key={light} style={{ background: `var(--traffic-${light})` }} />
            ))}
          </div>
          <h1>Sierra Agent QA Lab</h1>
        </header>
        <div className="lab-window-body">
          <LessonWorkspace />
        </div>
      </div>
    </>
  );
}
