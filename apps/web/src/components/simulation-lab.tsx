import { Button } from "@yaklabs/ui/components/button";
import { SidebarProvider } from "@yaklabs/ui/components/sidebar";
import type { AcceptedWorkflow, SimulationSelection } from "gateway/simulation-contract";
import { useEffect, useState } from "react";
import { SimulationCustomer } from "./simulation-customer";
import { SimulationSetup } from "./simulation-setup";
import { readLab, resetLab, restoreLab, saveLab, type SavedLab } from "./simulation-persistence";
import "./simulation.css";

/** One bounded employee-to-customer journey; no canvas or inherited navigation lifecycle. */
export function SimulationLab() {
  const [saved] = useState(readLab);
  const [restored, setRestored] = useState<Awaited<ReturnType<typeof restoreLab>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void restoreLab(saved)
      .then(setRestored)
      .catch(() => {
        setFailed(true);
      });
  }, [saved]);
  if (!restored)
    return (
      <main className="simulation-lab">
        <div className="lab-welcome">
          <h1>{failed ? "Saved session unavailable" : "Restoring your simulation"}</h1>
          <p aria-live="polite">
            {failed
              ? "The server may have restarted, the session expired, or the connection is unavailable. No messages were resent and no invoices were recreated. Reload to retry, or explicitly start a new workflow."
              : "Loading conversation and payment evidence from the same server sessions."}
          </p>
          {failed && (
            <Button
              onClick={() => {
                resetLab("workflow");
                window.location.reload();
              }}
            >
              Start a new workflow
            </Button>
          )}
        </div>
      </main>
    );
  return <LabWorkspace saved={saved} restored={restored} />;
}

function LabWorkspace({
  saved,
  restored,
}: {
  saved: SavedLab;
  restored: Awaited<ReturnType<typeof restoreLab>>;
}) {
  const [phase, setPhase] = useState(saved.phase);
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
              onAccepted={setWorkflow}
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
