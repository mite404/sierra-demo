import { SidebarProvider } from "@yaklabs/ui/components/sidebar";
import { useEffect, useState } from "react";
import { SimulationAuthoring } from "./simulation-authoring";
import { readLab, restoreLab } from "./simulation-persistence";
import "./simulation.css";

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
