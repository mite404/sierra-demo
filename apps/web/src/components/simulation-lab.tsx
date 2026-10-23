import { Button } from "@yaklabs/ui/components/button";
import { SidebarProvider } from "@yaklabs/ui/components/sidebar";
import type { AcceptedWorkflow, SimulationSelection } from "gateway/simulation-contract";
import { useEffect, useState } from "react";
import { SimulationCustomer } from "./simulation-customer";
import { SimulationAuthoring } from "./simulation-authoring";
import { SimulationRecovery } from "./simulation-library";
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

function useLab() {
  const [saved] = useState(readLab);
  const [restored, setRestored] = useState<Awaited<ReturnType<typeof restoreLab>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [library, setLibrary] = useState(saved.phase === "library");
  const [create, setCreate] = useState(false);
  const [libraryEpoch, setLibraryEpoch] = useState(0);
  const [accepted, setAccepted] = useState<AcceptedWorkflow | null>();
  const workflow =
    accepted === undefined
      ? restored?.employee?.accepted
        ? { id: restored.employee.id, config: restored.employee.accepted }
        : null
      : accepted;
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
    setLibrary,
  };
}

function restartWorkflow() {
  resetLab("workflow");
  window.location.reload();
}

function LibraryScreen({ lab }: { lab: ReturnType<typeof useLab> }) {
  return (
    <main className="simulation-lab lab-library">
      <header className="lab-header">
        <div>
          <h1>Sierra Agent QA Lab</h1>
          <span>Independent educational demo · synthetic accounts and payments</span>
        </div>
        <div className="lab-header-actions">
          <Button
            variant="ghost"
            onClick={() => {
              saveLab({ phase: "configure" });
              lab.setLibrary(false);
            }}
          >
            Back to workflow
          </Button>
          <Button variant="outline" className="btn" onClick={restartWorkflow}>
            New workflow
          </Button>
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
            onRestart={restartWorkflow}
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
    restored.employee?.accepted
      ? { id: restored.employee.id, config: restored.employee.accepted }
      : (restored.customer?.workflow ?? null),
  );
  const [employee, setEmployee] = useState(restored.employee);
  const [customer, setCustomer] = useState(restored.customer);
  const [employeeUnavailable, setEmployeeUnavailable] = useState(restored.employeeUnavailable);
  const [customerUnavailable, setCustomerUnavailable] = useState(restored.customerUnavailable);
  const [workflowEpoch, setWorkflowEpoch] = useState(0);
  const [testEpoch, setTestEpoch] = useState(0);
  const [persona, setPersona] = useState<SimulationSelection["case"]>(
    restored.customer?.result?.selection.case ?? saved.persona,
  );
  const changePhase = (next: "configure" | "customer") => {
    saveLab({ phase: next });
    setPhase(next);
  };
  const resetCustomer = () => {
    resetLab("test");
    setCustomer(null);
    setCustomerUnavailable(false);
    setTestEpoch((epoch) => epoch + 1);
  };
  const startOver = () => {
    resetLab("workflow");
    setEmployeeUnavailable(false);
    setCustomerUnavailable(false);
    setEmployee(null);
    setCustomer(null);
    setWorkflow(null);
    onWorkflow(null);
    setPhase("configure");
    setWorkflowEpoch((epoch) => epoch + 1);
    setPersona("spouse");
  };
  return (
    <main className="simulation-lab">
      <header className="lab-header">
        <div>
          <h1>Sierra Agent QA Lab</h1>
          <span>Independent educational demo · synthetic accounts and payments</span>
        </div>
        <div className="lab-header-actions">
          <Button
            variant="ghost"
            onClick={() => {
              changePhase("configure");
            }}
            aria-pressed={phase === "configure"}
          >
            Configure
          </Button>
          <Button
            variant="ghost"
            disabled={!workflow || employeeUnavailable}
            onClick={() => {
              onLibrary(true);
            }}
          >
            Create simulation
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onLibrary(false);
            }}
          >
            Saved simulations
          </Button>
          <Button
            variant="ghost"
            disabled={!workflow}
            onClick={() => {
              changePhase("customer");
            }}
            aria-pressed={phase === "customer"}
          >
            Customer test
          </Button>
          <Button variant="outline" className="btn" onClick={startOver}>
            New workflow
          </Button>
        </div>
      </header>
      <SidebarProvider className="lab-workspace">
        <div className="lab-stage" hidden={phase !== "configure"}>
          {employeeUnavailable ? (
            <div className="lab-welcome" role="alert">
              <h2>Employee configuration unavailable</h2>
              <p>
                No requests were replayed. Any surviving customer conversation and payment evidence
                remain available in Customer test. Reload to retry recovery, or use New workflow to
                clear both roles and start again.
              </p>
            </div>
          ) : (
            <SimulationSetup
              key={workflowEpoch}
              restored={employee}
              onAccepted={(receipt) => {
                setWorkflow(receipt);
                onWorkflow(receipt);
              }}
              onTry={() => {
                changePhase("customer");
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
