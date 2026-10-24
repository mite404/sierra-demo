import { Button } from "@yaklabs/ui/components/button";
import { SidebarProvider } from "@yaklabs/ui/components/sidebar";
import type { AcceptedWorkflow, SimulationSelection } from "gateway/simulation-contract";
import { useEffect, useState } from "react";
import { SimulationCustomer } from "./simulation-customer";
import { SimulationAuthoring } from "./simulation-authoring";
import { LockedScenarios, SimulationRecovery } from "./simulation-library";
import { SimulationSetup } from "./simulation-setup";
import {
  clearAuthor,
  readLab,
  resetLab,
  restoreLab,
  saveLab,
  type SavedLab,
} from "./simulation-persistence";
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
          <h1>Sierra Agent QA Lab</h1>
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

/** Keeps configure, author, and manual-customer roles distinct while the library survives recovery. */
export function SimulationLab() {
  const lab = useLab();
  return (
    <>
      <div hidden={lab.library}>
        {lab.restored ? (
          <LabWorkspace
            saved={lab.saved}
            restored={lab.restored}
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
    </>
  );
}

function WorkflowNavigation({
  configuring,
  libraryAvailable,
  onConfigure,
  onLibrary,
}: {
  configuring: boolean;
  libraryAvailable: boolean;
  onConfigure: () => void;
  onLibrary: () => void;
}) {
  return (
    <div className="lab-header-actions">
      {!configuring && (
        <Button variant="ghost" onClick={onConfigure}>
          Configure
        </Button>
      )}
      <Button variant="ghost" disabled={!libraryAvailable} onClick={onLibrary}>
        Saved simulations
      </Button>
    </div>
  );
}

function LabWorkspace({
  saved,
  restored,
  onLibrary,
  onWorkflow,
}: {
  saved: SavedLab;
  restored: Awaited<ReturnType<typeof restoreLab>>;
  onLibrary: (create: boolean) => void;
  onWorkflow: (workflow: AcceptedWorkflow | null) => void;
}) {
  const [phase, setPhase] = useState(saved.phase === "library" ? "configure" : saved.phase);
  const [workflow, setWorkflow] = useState<AcceptedWorkflow | null>(
    employeeWorkflow(restored.employee) ?? restored.customer?.workflow ?? null,
  );
  const employee = restored.employee;
  const [customer, setCustomer] = useState(restored.customer);
  const employeeUnavailable = restored.employeeUnavailable;
  const [customerUnavailable, setCustomerUnavailable] = useState(restored.customerUnavailable);
  const [testEpoch, setTestEpoch] = useState(0);
  const [persona, setPersona] = useState<SimulationSelection["case"]>(
    restored.customer?.result?.selection.case ?? saved.persona,
  );
  const changePhase = (next: "configure" | "customer") => {
    saveLab({ phase: next });
    setPhase(next);
  };
  const resetCustomer = () => {
    resetLab();
    setCustomer(null);
    setCustomerUnavailable(false);
    setTestEpoch((epoch) => epoch + 1);
  };
  return (
    <main className="simulation-lab">
      <header className="lab-header">
        <div>
          <h1>Sierra Agent QA Lab</h1>
          <span>Independent educational demo · synthetic accounts and payments</span>
        </div>
        <WorkflowNavigation
          configuring={phase === "configure"}
          libraryAvailable={workflow !== null || restored.employeeUnavailable}
          onConfigure={() => {
            changePhase("configure");
          }}
          onLibrary={() => {
            onLibrary(false);
          }}
        />
      </header>
      <SidebarProvider className="lab-workspace">
        <div className="lab-stage" hidden={phase !== "configure"}>
          {!workflow && <LockedScenarios />}
          {employeeUnavailable ? (
            <div className="lab-welcome" role="alert">
              <h2>Employee configuration unavailable</h2>
              <p>
                No requests were replayed. Any surviving customer conversation and payment evidence
                remain available in Customer test. Reload to retry recovery. Saved scenarios remain
                available for inspection.
              </p>
            </div>
          ) : (
            <SimulationSetup
              restored={employee}
              onAccepted={(receipt) => {
                setWorkflow(receipt);
                onWorkflow(receipt);
              }}
              onTry={() => {
                changePhase("customer");
              }}
              onCreate={() => {
                onLibrary(true);
              }}
            />
          )}
        </div>
        {(workflow || customerUnavailable) && (
          <div className="lab-stage" hidden={phase !== "customer"}>
            {customerUnavailable ? (
              <div className="lab-welcome" role="alert">
                <h2>Customer session unavailable</h2>
                <p>
                  No request was replayed and no invoices were recreated. Your employee conversation
                  and accepted workflow are preserved when available. Reset only this test, or
                  reload to retry recovery.
                </p>
                <Button disabled={!workflow || employeeUnavailable} onClick={resetCustomer}>
                  Reset test
                </Button>
              </div>
            ) : (
              workflow && (
                <SimulationCustomer
                  key={`${workflow.id}-${persona}-${testEpoch}`}
                  workflow={workflow}
                  restored={customer}
                  configurationAvailable={!employeeUnavailable}
                  persona={persona}
                  onPersona={(next) => {
                    resetCustomer();
                    saveLab({ persona: next });
                    setPersona(next);
                  }}
                  onReset={resetCustomer}
                />
              )
            )}
          </div>
        )}
      </SidebarProvider>
    </main>
  );
}
