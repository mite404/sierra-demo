import { Button } from "@yaklabs/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@yaklabs/ui/components/dialog";
import { SidebarContent, SidebarHeader } from "@yaklabs/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@yaklabs/ui/components/tooltip";
import type { SavedSimulationDefinition } from "gateway/simulation-contract";
import { CircleCheck, Monitor, Play, RotateCcw, Search, Settings } from "lucide-react";
import { useState } from "react";
import type { SimulationRowStatus } from "./simulation-run-state";
import { resetDemo } from "./simulation-persistence";

type LibraryProps = {
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
  statuses: Record<string, SimulationRowStatus>;
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
          <DialogTitle>Create Test Scenario</DialogTitle>
          <DialogDescription>
            Describe what your customer needs and what should happen. Nothing runs until you review
            and create a simulation.
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

/** Library entry explains the accepted-workflow prerequisite without hiding existing tests. */
export function LibraryWelcome({ start }: Pick<LibraryProps, "start">) {
  return (
    <div className="lab-welcome">
      <h2>Describe a test. Review it before you trust it.</h2>
      <p>
        Describe the next customer story, or open a saved simulation. No customer actions happen
        here.
      </p>
      <Button variant="outline" className="btn" onClick={start}>
        Create next simulation
      </Button>
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
  status: SimulationRowStatus | undefined;
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
      <span className="lab-library-name">
        <span>{saved.definition.name}</span>
        {status?.kind === "passed" && (
          <CircleCheck
            className="lab-run-passed"
            size={14}
            fill="currentColor"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="lab-muted">{status?.label ?? "Saved · not run in this view"}</span>
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
        No simulations yet. Describe your expectations in chat, then review and create one.
      </p>
    );
  if (matches.length === 0) return <p className="lab-muted">No matching simulations.</p>;
  return (
    <section aria-label="Subscription refunds">
      <h3 className="lab-group-title">Subscription refunds</h3>
      {matches.map((saved) => (
        <LibraryItem
          key={saved.id}
          saved={saved}
          open={open}
          locked={locked}
          selectedId={selectedId}
          status={statuses[saved.id]}
        />
      ))}
    </section>
  );
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
  statuses: Record<string, SimulationRowStatus>;
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

function LibraryToolbar({
  query,
  setQuery,
  runFormId,
  runDisabled,
  runCallout,
}: {
  query: string;
  setQuery: (query: string) => void;
  runFormId: string;
  runDisabled: boolean;
  runCallout: boolean;
}) {
  const [searching, setSearching] = useState(false);
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
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Agent settings" aria-disabled />
            }
          >
            <Settings size={16} />
          </TooltipTrigger>
          <TooltipContent>Out of scope</TooltipContent>
        </Tooltip>
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
          data-callout={runCallout && !runDisabled ? "" : undefined}
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
    </>
  );
}

/** Saved-test reads and explicit reload remain available without live credentials. */
export function LibrarySidebar(props: LibraryProps) {
  const { start, open, library, unavailable, locked, selectedId, runFormId, statuses } = props;
  const [query, setQuery] = useState("");
  return (
    <aside className="lab-sidebar" aria-label="Saved simulations">
      <SidebarHeader>
        <LibraryToolbar
          query={query}
          setQuery={setQuery}
          runFormId={runFormId}
          runDisabled={!selectedId || locked}
          runCallout={selectedId !== undefined && statuses[selectedId]?.kind === "not-run"}
        />
      </SidebarHeader>
      <SidebarContent className="lab-sidebar-content">
        <div className="lab-review-actions">
          <Button variant="outline" className="btn" disabled={locked} onClick={start}>
            Create next simulation
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
        {library.items !== null && library.items.length > 0 && <DemoReset disabled={locked} />}
      </SidebarContent>
    </aside>
  );
}
