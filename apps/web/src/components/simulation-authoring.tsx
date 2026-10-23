import {
  savedSimulationDefinition,
  type AcceptedWorkflow,
  type SavedSimulationDefinition,
  type SimulationAuthorSource,
} from "gateway/simulation-contract";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AuthorChat } from "./simulation-author-chat";
import { SavedReview } from "./simulation-definition";
import { LibrarySidebar, LibraryWelcome } from "./simulation-library";
import { clearAuthor, type RestoredAuthor } from "./simulation-persistence";

type View =
  | { kind: "browse" }
  | { kind: "saved"; saved: SavedSimulationDefinition }
  | {
      kind: "chat";
      source: SimulationAuthorSource;
      workflow: AcceptedWorkflow;
      restored: RestoredAuthor | null;
    };
type AuthoringProps = {
  workflow: AcceptedWorkflow | null;
  create: boolean;
  restored: RestoredAuthor | null;
  unavailable: boolean;
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
  { create, workflow, restored }: AuthoringProps,
  opening: RefObject<AbortController | null>,
) {
  const [view, setView] = useState<View>(() =>
    create && workflow
      ? { kind: "chat", source: { workflowId: workflow.id }, workflow, restored: null }
      : { kind: "browse" },
  );
  const [epoch, setEpoch] = useState(0);
  const recovering = useRef(!create);
  useEffect(() => () => opening.current?.abort(), [opening]);
  useEffect(() => {
    if (restored && recovering.current) {
      recovering.current = false;
      setView({ kind: "chat", source: restored.source, workflow: restored.workflow, restored });
    }
  }, [restored]);
  const choose = (next: View) => {
    recovering.current = false;
    opening.current?.abort();
    clearAuthor();
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
  workflow,
  start,
  onSaved,
}: {
  view: View;
  epoch: number;
  choose: (next: View) => void;
  workflow: AcceptedWorkflow | null;
  start: () => void;
  onSaved: (saved: SavedSimulationDefinition) => void;
}) {
  if (view.kind === "chat") return <AuthorChat key={epoch} {...view} onSaved={onSaved} />;
  return (
    <div className="lab-library-review">
      {view.kind === "saved" ? (
        <SavedReview
          saved={view.saved}
          onEdit={() => {
            choose({
              kind: "chat",
              source: { definitionId: view.saved.id, expectedRevision: view.saved.revision },
              workflow: view.saved.workflow,
              restored: null,
            });
          }}
        />
      ) : (
        <LibraryWelcome workflow={workflow} start={start} />
      )}
    </div>
  );
}

/** Saved definitions load separately from chat recovery and credentials. Opening never starts a run. */
export function SimulationAuthoring(props: AuthoringProps) {
  const opening = useRef<AbortController | null>(null);
  const { view, epoch, choose, stopRecovery } = useDefinitionView(props, opening);
  const library = useSavedLibrary();
  const start = () => {
    if (props.workflow)
      choose({
        kind: "chat",
        source: { workflowId: props.workflow.id },
        workflow: props.workflow,
        restored: null,
      });
  };
  const open = (id: string) => {
    stopRecovery();
    void openDefinition(
      id,
      opening,
      (saved) => {
        choose({ kind: "saved", saved });
      },
      () => {
        library.setError("Saved simulation could not open. Reload the library and try again.");
      },
    );
  };
  const onSaved = (saved: SavedSimulationDefinition) => {
    choose({ kind: "saved", saved });
    void library.load();
  };
  return (
    <>
      <LibraryView
        view={view}
        epoch={epoch}
        choose={choose}
        workflow={props.workflow}
        start={start}
        onSaved={onSaved}
      />
      <LibrarySidebar
        workflow={props.workflow}
        start={start}
        open={open}
        library={library}
        unavailable={props.unavailable}
      />
    </>
  );
}
