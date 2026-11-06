import {
  savedSimulationDefinition,
  type SavedSimulationDefinition,
  type SimulationAuthorSource,
} from "gateway/simulation-contract";
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { AuthorChat } from "./simulation-author-chat";
import { SimulationRunView } from "./simulation-run-view";
import { LibrarySidebar, LibraryWelcome } from "./simulation-library";
import type { SimulationRowStatus } from "./simulation-run-state";
import { clearAuthor, readLab, saveLab, type RestoredAuthor } from "./simulation-persistence";

type View =
  | { kind: "browse" }
  | { kind: "saved"; saved: SavedSimulationDefinition }
  | {
      kind: "chat";
      source: SimulationAuthorSource;
      restored: RestoredAuthor | null;
    };
type AuthoringProps = {
  restored: RestoredAuthor | null;
  unavailable: boolean;
  locked: boolean;
  onLock: (locked: boolean) => void;
};

async function readLibrary(signal: AbortSignal) {
  const response = await fetch("/api/simulation-definitions", {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  if (!response.ok) throw new Error("Library unavailable");
  return savedSimulationDefinition.array().parse(await response.json());
}

function useSavedLibrary() {
  const [items, setItems] = useState<SavedSimulationDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    return readLibrary(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setItems(value);
          setError(null);
        }
        return null;
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Saved simulations could not load. Reload the library to retry. No requests were replayed.",
          );
      });
  }, []);
  useEffect(() => {
    void load();
    return () => loading.current?.abort();
  }, [load]);
  return { items, error, setError, load };
}

function useDefinitionView(
  { restored, unavailable }: AuthoringProps,
  opening: RefObject<AbortController | null>,
) {
  const [view, setView] = useState<View>(() =>
    restored
      ? { kind: "chat", source: restored.source, restored }
      : unavailable || readLab().definitionId
        ? { kind: "browse" }
        : { kind: "chat", source: { lesson: "subscription-refunds" }, restored: null },
  );
  const [epoch, setEpoch] = useState(0);
  const recovering = useRef(!restored);
  useEffect(() => () => opening.current?.abort(), [opening]);
  useEffect(() => {
    const id = readLab().definitionId;
    if (id !== undefined && recovering.current) {
      recovering.current = false;
      void openDefinition(
        id,
        opening,
        (saved) => {
          setView({ kind: "saved", saved });
        },
        () => {},
      );
    }
  }, [opening]);
  const choose = (next: View) => {
    recovering.current = false;
    opening.current?.abort();
    clearAuthor();
    saveLab({ phase: "library", definitionId: next.kind === "saved" ? next.saved.id : undefined });
    setEpoch((value) => value + 1);
    setView(next);
  };
  const stopRecovery = () => {
    recovering.current = false;
  };
  return { view, epoch, choose, stopRecovery };
}

async function openDefinition(
  id: string,
  opening: RefObject<AbortController | null>,
  onRead: (saved: SavedSimulationDefinition) => void,
  onError: () => void,
) {
  opening.current?.abort();
  const controller = new AbortController();
  opening.current = controller;
  try {
    const response = await fetch(`/api/simulation-definitions/${id}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Read failed");
    const saved = savedSimulationDefinition.parse(await response.json());
    if (!controller.signal.aborted) onRead(saved);
  } catch {
    if (!controller.signal.aborted) onError();
  }
}

function LibraryView({
  view,
  epoch,
  choose,
  start,
  onSaved,
  onLock,
  runFormId,
  onStatus,
}: {
  view: View;
  epoch: number;
  choose: (next: View) => void;
  start: () => void;
  onSaved: (saved: SavedSimulationDefinition) => void;
  onLock: AuthoringProps["onLock"];
  runFormId: string;
  onStatus: (id: string, status: SimulationRowStatus) => void;
}) {
  if (view.kind === "chat")
    return <AuthorChat key={epoch} {...view} onSaved={onSaved} onLock={onLock} />;
  return (
    <div className="lab-library-review">
      {view.kind === "saved" ? (
        <SimulationRunView
          key={`${view.saved.id}-${epoch}`}
          saved={view.saved}
          runFormId={runFormId}
          enabled
          onStatus={onStatus}
          onLock={onLock}
          onEdit={() => {
            choose({
              kind: "chat",
              source: { definitionId: view.saved.id, expectedRevision: view.saved.revision },
              restored: null,
            });
          }}
        />
      ) : (
        <LibraryWelcome start={start} />
      )}
    </div>
  );
}

/** Saved definitions load separately from chat recovery and credentials. Opening never starts a run. */
export function SimulationAuthoring(props: AuthoringProps) {
  const runFormId = useId();
  const opening = useRef<AbortController | null>(null);
  const selection = useDefinitionView(props, opening);
  const library = useSavedLibrary();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, SimulationRowStatus>>({});
  const onStatus = useCallback((id: string, status: SimulationRowStatus) => {
    setStatuses((previous) =>
      previous[id]?.kind === status.kind && previous[id]?.label === status.label
        ? previous
        : { ...previous, [id]: status },
    );
  }, []);
  const start = () => {
    if (!props.locked && !openingId)
      selection.choose({
        kind: "chat",
        source: { lesson: "subscription-refunds" },
        restored: null,
      });
  };
  const open = (id: string) => {
    if (props.locked || openingId) return;
    setOpeningId(id);
    selection.stopRecovery();
    void openDefinition(
      id,
      opening,
      (saved) => {
        setOpeningId(null);
        selection.choose({ kind: "saved", saved });
      },
      () => {
        setOpeningId(null);
        library.setError("Saved simulation could not open. Reload the library and try again.");
      },
    );
  };
  const onSaved = (saved: SavedSimulationDefinition) => {
    selection.choose({ kind: "saved", saved });
    void library.load();
  };
  return (
    <>
      <LibrarySidebar
        start={start}
        open={open}
        library={library}
        unavailable={props.unavailable}
        locked={props.locked || openingId !== null}
        selectedId={selection.view.kind === "saved" ? selection.view.saved.id : undefined}
        runFormId={runFormId}
        statuses={statuses}
      />
      {openingId === null ? (
        <LibraryView
          {...selection}
          start={start}
          onSaved={onSaved}
          onLock={props.onLock}
          runFormId={runFormId}
          onStatus={onStatus}
        />
      ) : (
        <div className="lab-library-review">
          <output>Opening selected scenario…</output>
        </div>
      )}
    </>
  );
}
