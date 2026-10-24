import { Button } from "@yaklabs/ui/components/button";
import { SidebarProvider } from "@yaklabs/ui/components/sidebar";
import type { AcceptedWorkflow } from "gateway/simulation-contract";
import { useEffect, useState } from "react";
import { SimulationAuthoring } from "./simulation-authoring";
import { LockedScenarios, SimulationRecovery } from "./simulation-library";
import { SimulationSetup } from "./simulation-setup";
import { clearAuthor, readLab, restoreLab, saveLab } from "./simulation-persistence";
import "./simulation.css";

function employeeWorkflow(
  employee: Awaited<ReturnType<typeof restoreLab>>["employee"] | undefined,
) {
  return employee?.accepted ? { id: employee.id, config: employee.accepted } : null;
}

function useLab() {
  const [saved] = useState(readLab);
  const [restored, setRestored] = useState<Awaited<ReturnType<typeof restoreLab>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [library, setLibrary] = useState(saved.phase === "library");
  const [create, setCreate] = useState(false);
  const [libraryEpoch, setLibraryEpoch] = useState(0);
  const [accepted, setAccepted] = useState<AcceptedWorkflow | null>();
  const workflow = accepted === undefined ? employeeWorkflow(restored?.employee) : accepted;
  const showLibrary = (newTest: boolean) => {
    if (newTest) clearAuthor();
    saveLab({ phase: "library" });
    setCreate(newTest);
    setLibraryEpoch((value) => value + 1);
    setLibrary(true);
  };
  useEffect(() => {
    void restoreLab(saved)
      .then(setRestored)
      .catch(() => {
        setFailed(true);
      });
  }, [saved]);
  return {
    saved,
    restored,
    failed,
    library,
    create,
    libraryEpoch,
    workflow,
    showLibrary,
    setAccepted,
  };
}

function LibraryScreen({ lab }: { lab: ReturnType<typeof useLab> }) {
  const [locked, setLocked] = useState(false);
  return (
    <main className="simulation-lab lab-library">
      <header className="lab-header">
        <div>
          <span>Independent educational demo · synthetic accounts and payments</span>
        </div>
      </header>
      <SidebarProvider className="lab-workspace">
        <div className="lab-stage">
          <SimulationAuthoring
            key={lab.libraryEpoch}
            workflow={lab.workflow}
            create={lab.create}
            restored={
              !lab.create && lab.restored?.author && lab.restored.author.id === readLab().authorId
                ? lab.restored.author
                : null
            }
            unavailable={lab.restored?.authorUnavailable ?? false}
            locked={locked}
            onLock={setLocked}
          />
        </div>
      </SidebarProvider>
    </main>
  );
}

/** Keeps agent setup and saved scenarios inside one stable shell, including recovery. */
export function SimulationLab() {
  const lab = useLab();
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
          <div className="lab-retained-workspace" hidden={lab.library}>
            {lab.restored ? (
              <LabWorkspace
                restored={lab.restored}
                active={!lab.library}
                onLibrary={lab.showLibrary}
                onWorkflow={lab.setAccepted}
              />
            ) : (
              <SimulationRecovery
                failed={lab.failed}
                onLibrary={() => {
                  lab.showLibrary(false);
                }}
              />
            )}
          </div>
          {lab.library && <LibraryScreen lab={lab} />}
        </div>
      </div>
    </>
  );
}

function LabWorkspace({
  restored,
  active,
  onLibrary,
  onWorkflow,
}: {
  restored: Awaited<ReturnType<typeof restoreLab>>;
  active: boolean;
  onLibrary: (create: boolean) => void;
  onWorkflow: (workflow: AcceptedWorkflow | null) => void;
}) {
  const [workflow, setWorkflow] = useState<AcceptedWorkflow | null>(
    employeeWorkflow(restored.employee),
  );
  const employee = restored.employee;
  const employeeUnavailable = restored.employeeUnavailable;
  return (
    <main className="simulation-lab">
      <header className="lab-header">
        <div>
          <span>Independent educational demo · synthetic accounts and payments</span>
        </div>
        <Button
          variant="ghost"
          disabled={workflow === null && !employeeUnavailable}
          onClick={() => {
            onLibrary(false);
          }}
        >
          Saved simulations
        </Button>
      </header>
      <SidebarProvider className="lab-workspace">
        <div className="lab-stage">
          {!workflow && <LockedScenarios />}
          {employeeUnavailable ? (
            <div className="lab-welcome" role="alert">
              <h2>Employee configuration unavailable</h2>
              <p>
                No requests were replayed. Reload to retry recovery. Saved scenarios and their
                recorded payment evidence remain available for inspection.
              </p>
            </div>
          ) : (
            <SimulationSetup
              restored={employee}
              active={active}
              onAccepted={(receipt) => {
                setWorkflow(receipt);
                onWorkflow(receipt);
              }}
              onCreate={() => {
                onLibrary(true);
              }}
            />
          )}
        </div>
      </SidebarProvider>
    </main>
  );
}
