import { Button } from "@yaklabs/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@yaklabs/ui/components/dialog";
import { SidebarContent, SidebarHeader } from "@yaklabs/ui/components/sidebar";
import type { AcceptedWorkflow, SavedSimulationDefinition } from "gateway/simulation-contract";
import { Monitor, Play, RotateCcw, Search, Settings, LockKeyhole } from "lucide-react";
import { useState } from "react";

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
  locked: boolean;
  selectedId: string | undefined;
  runFormId: string;
  statuses: Record<string, string>;
};

/** Invites an explicit test without saving, running, or discarding the accepted agent. */
export function ScenarioInvitation({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create your first test scenario</DialogTitle>
          <DialogDescription>
            Your agent is ready. Test an edge case, such as a spouse asking for someone else's
            refund or an owner requesting the same refund twice. Nothing runs until you review and
            save.
          </DialogDescription>
        </DialogHeader>
        <div className="lab-invitation">
          <label htmlFor="scenario-device">Device type</label>
          <select id="scenario-device" className="field" defaultValue="desktop">
            <option value="desktop">Desktop web</option>
          </select>
          <p className="lab-muted">
            <Monitor size={16} aria-hidden="true" /> Synthetic desktop web conversation
          </p>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onCreate();
            }}
          >
            Describe a test scenario
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** First-use controls explain their prerequisite and cannot submit any simulation request. */
export function LockedScenarios() {
  return (
    <aside className="lab-sidebar lab-scenarios" aria-label="Simulation scenarios">
      <SidebarHeader>
        <div className="lab-library-toolbar" aria-label="Simulation tools">
          {[
            { label: "Search simulations", icon: Search },
            { label: "Agent settings", icon: Settings },
            { label: "Rerun selected simulation", icon: RotateCcw },
            { label: "Run selected simulation", icon: Play },
          ].map(({ label, icon: Icon }) => (
            <Button key={label} variant="ghost" size="icon" aria-label={label} disabled>
              <Icon size={16} />
            </Button>
          ))}
        </div>
        <h2>Test scenarios</h2>
        <p className="lab-muted">
          <LockKeyhole size={14} aria-hidden="true" /> Describe your agent, answer its questions,
          then accept the workflow to unlock simulations.
        </p>
      </SidebarHeader>
      <SidebarContent className="lab-sidebar-content">
        <Button variant="outline" disabled>
          Create simulation
        </Button>
        {["Spouse pressure", "Owner confirm + repeat"].map((name) => (
          <Button key={name} variant="ghost" className="lab-library-item" disabled>
            <span>{name}</span>
            <span className="lab-muted">Example · agent acceptance required</span>
          </Button>
        ))}
      </SidebarContent>
    </aside>
  );
}

/** Recovery does not gate access to the durable library or replay expired role requests. */
export function SimulationRecovery({
  failed,
  onLibrary,
}: {
  failed: boolean;
  onLibrary: () => void;
}) {
  return (
    <main className="simulation-lab">
      <div className="lab-welcome">
        <h1>{failed ? "Saved session unavailable" : "Restoring your simulation"}</h1>
        <p aria-live="polite">
          {failed
            ? "The server may have restarted, the session expired, or the connection is unavailable. No messages were resent and no invoices were recreated. Reload to retry. Saved scenarios remain available for inspection."
            : "Loading conversation and payment evidence from the same server sessions."}
        </p>
        <Button variant="outline" className="btn" onClick={onLibrary}>
          Saved simulations
        </Button>
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
  locked,
  selectedId,
  status,
}: {
  saved: SavedSimulationDefinition;
  open: LibraryProps["open"];
  locked: boolean;
  selectedId: string | undefined;
  status: string | undefined;
}) {
  return (
    <Button
      variant="ghost"
      className="lab-library-item"
      aria-label={`Open ${saved.definition.name}`}
      aria-current={selectedId === saved.id ? "page" : undefined}
      disabled={locked}
      onClick={() => {
        open(saved.id);
      }}
    >
      <span className="lab-library-name">{saved.definition.name}</span>
      <span className="lab-muted">
        {status ?? (
          <>
            <span className="lab-saved-label">Saved</span> · open to inspect results
          </>
        )}
      </span>
    </Button>
  );
}

function LibraryMatches({
  items,
  query,
  open,
  locked,
  selectedId,
  statuses,
}: Pick<LibraryProps, "open" | "locked" | "selectedId" | "statuses"> & {
  items: SavedSimulationDefinition[];
  query: string;
}) {
  const matches = items.filter((saved) =>
    saved.definition.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  if (items.length === 0)
    return (
      <p className="lab-muted">
        No saved simulations yet. Examples only fill a draft. Nothing is saved until you choose Save
        simulation.
      </p>
    );
  if (matches.length === 0) return <p className="lab-muted">No matching simulations.</p>;
  return matches.map((saved) => (
    <LibraryItem
      key={saved.id}
      saved={saved}
      open={open}
      locked={locked}
      selectedId={selectedId}
      status={statuses[saved.id]}
    />
  ));
}

function LibraryContents({
  library,
  open,
  unavailable,
  locked,
  selectedId,
  query,
  statuses,
}: Pick<LibraryProps, "library" | "open" | "unavailable" | "locked" | "selectedId"> & {
  query: string;
  statuses: Record<string, string>;
}) {
  return (
    <>
      {library.items === null && library.error === null && (
        <output>Loading saved simulations…</output>
      )}
      {library.items !== null && (
        <LibraryMatches
          items={library.items}
          query={query}
          open={open}
          locked={locked}
          selectedId={selectedId}
          statuses={statuses}
        />
      )}
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

function AgentSettings({ config }: { config: AcceptedWorkflow["config"] | undefined }) {
  return (
    <section aria-label="Accepted agent settings" className="lab-muted">
      <h3 className="lab-group-title">Agent settings</h3>
      {config ? (
        <p>
          {config.tone === "warm" ? "Warm" : "Brief"} replies.{" "}
          {config.approval === "confirm"
            ? "Owner confirmation before refund."
            : "Immediate eligible owner refund."}{" "}
          Ownership and payment safeguards always apply.
        </p>
      ) : (
        <p>Accept your agent before creating a simulation.</p>
      )}
    </section>
  );
}

function LibraryToolbar({
  query,
  setQuery,
  config,
  runFormId,
  runDisabled,
}: {
  query: string;
  setQuery: (query: string) => void;
  config: AcceptedWorkflow["config"] | undefined;
  runFormId: string;
  runDisabled: boolean;
}) {
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState(false);
  return (
    <>
      <div className="lab-library-toolbar" aria-label="Simulation tools">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search simulations"
          aria-pressed={searching}
          onClick={() => {
            setSearching(!searching);
            setQuery("");
          }}
        >
          <Search size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Agent settings"
          aria-expanded={settings}
          onClick={() => {
            setSettings(!settings);
          }}
        >
          <Settings size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Rerun selected simulation"
          title="Rerun selected simulation"
          type="submit"
          form={runFormId}
          disabled={runDisabled}
        >
          <RotateCcw size={16} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Run selected simulation"
          title="Run selected simulation"
          type="submit"
          form={runFormId}
          disabled={runDisabled}
        >
          <Play size={16} />
        </Button>
      </div>
      {searching && (
        <input
          className="field"
          aria-label="Search saved simulation names"
          placeholder="Search simulations"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      )}
      {settings && <AgentSettings config={config} />}
    </>
  );
}

function selectedConfig({ library, selectedId, workflow }: LibraryProps) {
  const selected = library.items?.find((item) => item.id === selectedId);
  return selected ? selected.workflow.config : workflow?.config;
}

/** Saved-test reads and explicit reload remain available without live credentials. */
export function LibrarySidebar(props: LibraryProps) {
  const { workflow, start, open, library, unavailable, locked, selectedId, runFormId, statuses } =
    props;
  const [query, setQuery] = useState("");
  return (
    <aside className="lab-sidebar" aria-label="Saved simulations">
      <SidebarHeader>
        <LibraryToolbar
          query={query}
          setQuery={setQuery}
          config={selectedConfig(props)}
          runFormId={runFormId}
          runDisabled={!selectedId || locked || !workflow}
        />
        <h2>Saved simulations</h2>
        <p className="lab-muted" hidden={workflow !== null}>
          Accept your current agent to run scenarios. Saved evidence remains readable.
        </p>
      </SidebarHeader>
      <SidebarContent className="lab-sidebar-content">
        <div className="lab-review-actions">
          <Button variant="outline" className="btn" disabled={!workflow || locked} onClick={start}>
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
        <LibraryContents
          library={library}
          open={open}
          unavailable={unavailable}
          locked={locked}
          selectedId={selectedId}
          query={query}
          statuses={statuses}
        />
      </SidebarContent>
    </aside>
  );
}
