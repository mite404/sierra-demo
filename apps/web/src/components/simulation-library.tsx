import { Button } from "@yaklabs/ui/components/button";
import { Sidebar, SidebarContent, SidebarHeader } from "@yaklabs/ui/components/sidebar";
import type { AcceptedWorkflow, SavedSimulationDefinition } from "gateway/simulation-contract";

type LibraryProps = {
  workflow: AcceptedWorkflow | null;
  start: () => void;
  open: (id: string) => void;
  library: {
    items: SavedSimulationDefinition[] | null;
    error: string | null;
    load: () => Promise<unknown>;
  };
  unavailable: boolean;
};

/** Recovery does not gate access to the durable library or replay expired role requests. */
export function SimulationRecovery({
  failed,
  onLibrary,
  onRestart,
}: {
  failed: boolean;
  onLibrary: () => void;
  onRestart: () => void;
}) {
  return (
    <main className="simulation-lab">
      <div className="lab-welcome">
        <h1>{failed ? "Saved session unavailable" : "Restoring your simulation"}</h1>
        <p aria-live="polite">
          {failed
            ? "The server may have restarted, the session expired, or the connection is unavailable. No messages were resent and no invoices were recreated. Reload to retry, or explicitly start a new workflow."
            : "Loading conversation and payment evidence from the same server sessions."}
        </p>
        <Button variant="outline" className="btn" onClick={onLibrary}>
          Saved simulations
        </Button>
        {failed && <Button onClick={onRestart}>Start a new workflow</Button>}
      </div>
    </main>
  );
}

/** Library entry explains the accepted-workflow prerequisite without hiding existing tests. */
export function LibraryWelcome({ workflow, start }: Pick<LibraryProps, "workflow" | "start">) {
  return (
    <div className="lab-welcome">
      <h2>Describe a test. Review it before you trust it.</h2>
      <p>
        Create a simulation through a separate authoring conversation, or open a saved test. No
        customer actions happen here.
      </p>
      <Button variant="outline" className="btn" disabled={!workflow} onClick={start}>
        Create simulation
      </Button>
      {!workflow && (
        <p>
          Accept a workflow in Configure to create a new test. Saved tests can be opened and edited
          without the old workflow chat.
        </p>
      )}
    </div>
  );
}

function LibraryItem({
  saved,
  open,
}: {
  saved: SavedSimulationDefinition;
  open: LibraryProps["open"];
}) {
  return (
    <section className="lab-library-item">
      <h3 className="lab-group-title">{saved.definition.name}</h3>
      <p className="lab-muted">
        {saved.definition.case === "spouse" ? "Casey · spouse" : "Morgan · owner"} · revision{" "}
        {saved.revision}
      </p>
      <Button
        variant="outline"
        className="btn"
        aria-label={`Open ${saved.definition.name}`}
        onClick={() => {
          open(saved.id);
        }}
      >
        Open
      </Button>
    </section>
  );
}

function LibraryContents({
  library,
  open,
  unavailable,
}: Pick<LibraryProps, "library" | "open" | "unavailable">) {
  return (
    <>
      {library.items === null && library.error === null && (
        <output>Loading saved simulations…</output>
      )}
      {library.items?.length === 0 && (
        <p className="lab-muted">
          No saved simulations yet. Examples only fill a draft. Nothing is saved until you choose
          Save simulation.
        </p>
      )}
      {library.items?.map((saved) => (
        <LibraryItem key={saved.id} saved={saved} open={open} />
      ))}
      {library.error !== null && <p role="alert">{library.error}</p>}
      {unavailable && (
        <p role="alert">
          Previous authoring chat unavailable. No message was resent. Saved simulations remain
          available.
        </p>
      )}
    </>
  );
}

/** Saved-test reads and explicit reload remain available without live credentials. */
export function LibrarySidebar({ workflow, start, open, library, unavailable }: LibraryProps) {
  return (
    <Sidebar collapsible="none" side="right" className="lab-sidebar" aria-label="Saved simulations">
      <SidebarHeader>
        <h2>Saved simulations</h2>
        <p className="lab-muted">Reusable definitions · no automatic runs</p>
      </SidebarHeader>
      <SidebarContent className="lab-sidebar-content">
        <div className="lab-review-actions">
          <Button variant="outline" className="btn" disabled={!workflow} onClick={start}>
            Create another simulation
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void library.load();
            }}
          >
            Reload library
          </Button>
        </div>
        <LibraryContents library={library} open={open} unavailable={unavailable} />
      </SidebarContent>
    </Sidebar>
  );
}
