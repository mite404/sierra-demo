import {
  startRuntime,
  type Runtime,
  type RuntimeData,
  type RuntimeState,
  type ThreadId,
} from "@yaklabs/runtime";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { matchPath, useLocation } from "react-router";
import { toast } from "sonner";
import { env } from "./env";
import { keepScenario, legacyFrom, unknownScenario, wantedFrom, type Wanted } from "./source";

/**
 * The page's addresses: a thread's, home's and the Lab's, and the thread a pathname names. The
 * Door owns them, so a mock scenario's links keep `?scenario=`.
 */
export type Paths = {
  pathTo: (id: ThreadId) => string;
  hrefTo: (path: "/" | "/lab") => string;
  /** The thread id a pathname names, or undefined. */
  threadIdOf: (pathname: string) => string | undefined;
};

// The runtime the page started, the state it shows before that runtime answers, how to start
// it again, and the page's addresses.
type Door = {
  runtime: Runtime | null;
  before: RuntimeState;
  restart: (() => void) | null;
  paths: Paths;
};
// What a runtime can open: the device, or a scenario that exists.
type Openable = Exclude<Wanted, { kind: "unknown" }>;

// The v1 canvas's two keys (ADR-089), which the worker's 1 → 2 migration reads once.
const LEGACY_HIDDEN = "kay.canvas.hidden";
const LEGACY_ORDER = "kay.canvas.order";
// The key a browser lever sets to have a dev build seed the device (`seedDemoStore`).
const SEED = "kay.seed";

const DoorContext = createContext<Door | null>(null);

/** Why something failed, in words fit for the page. */
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lets a write to the worker run on its own. The snapshot already shows it; if the worker
 * refuses it, the next state rolls it back and a toast says what did not happen.
 */
export function inBackground(write: Promise<unknown>, doing: string): void {
  write.catch((error: unknown) => {
    toast.error(`${doing} did not work`, { description: reasonOf(error) });
  });
}

// The seed a browser lever asked for; a production build never seeds the device.
function seedAsked(): "demo-store" | undefined {
  if (!import.meta.env.DEV) return undefined;
  return localStorage.getItem(SEED) === "demo-store" ? "demo-store" : undefined;
}

// The device's store with the v1 keys and a lever's seed; a browser that refuses storage has
// neither to send.
function readDevice(): RuntimeData {
  try {
    const legacy = legacyFrom(
      localStorage.getItem(LEGACY_HIDDEN),
      localStorage.getItem(LEGACY_ORDER),
    );
    return { kind: "device", legacy, seed: seedAsked() };
  } catch {
    return { kind: "device" };
  }
}

function clearLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_HIDDEN);
    localStorage.removeItem(LEGACY_ORDER);
  } catch {
    // Nothing was readable, so nothing is left to clear.
  }
}

// The keys go only once the file on disk has opened: a memory store never migrated them, and a
// later visit that reaches the file still needs them.
function clearLegacyOnceKept(runtime: Runtime): () => void {
  return runtime.subscribe(() => {
    const state = runtime.state();
    if (state.kind === "ready" && state.source.kind === "device" && state.source.storage === "opfs")
      clearLegacy();
  });
}

// What the state is before a runtime answers: starting (with the scenario it will say, if
// any), or broken for good when the address names a scenario that does not exist.
function stateBefore(wanted: Wanted): RuntimeState {
  switch (wanted.kind) {
    case "device":
      return { kind: "starting", source: null };
    case "scenario":
      return { kind: "starting", source: { kind: "scenario", name: wanted.name } };
    case "unknown":
      return { kind: "broken", source: null, reason: unknownScenario(wanted.name) };
    default: {
      const unhandled: never = wanted;
      return unhandled;
    }
  }
}

// The device's or a scenario's addresses, each keeping `?scenario=`, so a mock visit never
// drifts onto the device's data.
function scenarioPaths(wanted: Wanted): Paths {
  return {
    pathTo: (id) => keepScenario(`/t/${encodeURIComponent(id)}`, wanted),
    hrefTo: (path) => keepScenario(path, wanted),
    threadIdOf: (pathname) => matchPath("/t/:threadId", pathname)?.params.threadId,
  };
}

// The data an address asks for as one string, so two addresses that differ only in another
// query parameter compare equal.
function dataOf(wanted: Wanted): string {
  return wanted.kind === "device" ? "device" : `${wanted.kind}:${wanted.name}`;
}

// What the address asks the runtime to open, kept as the same object for as long as it asks
// for the same data: a link keeps only ?scenario=, and a new object would restart the worker.
function useWanted(): Wanted {
  const asked = wantedFrom(useLocation().search); // → Wanted, a new object on every render
  const [wanted, setWanted] = useState(asked);
  if (dataOf(asked) === dataOf(wanted)) return wanted;
  setWanted(asked);
  return asked;
}

function useDoor(): Door {
  const door = useContext(DoorContext);
  if (door === null) throw new Error("The runtime hooks need <RuntimeProvider> above them");
  return door;
}

// One runtime's life: started in an effect with a cleanup, never in a state initializer, so
// StrictMode's second mount stops the first worker before the second opens the device's file.
function RuntimeHost({
  wanted,
  restart,
  before,
  paths,
  children,
}: {
  wanted: Openable;
  restart: () => void;
  before: RuntimeState;
  paths: Paths;
  children: ReactNode;
}) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);

  useEffect(() => {
    const data: RuntimeData =
      wanted.kind === "device" ? readDevice() : { kind: "scenario", name: wanted.name };
    const started = startRuntime({ agent: env.agent, data });
    if (wanted.kind === "device") void navigator.storage.persist(); // ADR-081: keep the file
    const stopClearing = clearLegacyOnceKept(started);
    // oxlint-disable-next-line react/set-state-in-effect -- the worker is the external system this effect starts; render needs its handle
    setRuntime(started);
    return () => {
      stopClearing();
      started.dispose();
      setRuntime(null);
    };
  }, [wanted]);

  const door = useMemo<Door>(
    () => ({ runtime, before, restart, paths }),
    [runtime, before, restart, paths],
  );
  return <DoorContext value={door}>{children}</DoorContext>;
}

/**
 * Runs the worker for as long as the workspace is on screen (ADR-076), on the data the address
 * asks for: `?scenario=<name>` opens that mock (ADR-096), anything else the device's store. A
 * restart is a new runtime and a new page beneath it, so nothing keeps the failed one's state.
 */
export function RuntimeProvider({ children }: { children: ReactNode }) {
  const wanted = useWanted();
  const [attempt, setAttempt] = useState(0);
  const restart = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  const before = useMemo(() => stateBefore(wanted), [wanted]);
  const paths = useMemo(() => scenarioPaths(wanted), [wanted]);
  // An unknown scenario opens nothing, and trying again cannot change that.
  const refused = useMemo<Door>(
    () => ({ runtime: null, before, restart: null, paths }),
    [before, paths],
  );
  if (wanted.kind === "unknown") return <DoorContext value={refused}>{children}</DoorContext>;
  return (
    <RuntimeHost key={attempt} wanted={wanted} restart={restart} before={before} paths={paths}>
      {children}
    </RuntimeHost>
  );
}

/**
 * Puts a runtime its host composes over the Door's own (the scripted Demo's overlay beside the
 * worker) in the Door, keeping the Door's addresses, restart and the state it shows before a
 * runtime answers. Null reads as that state until the host has its runtime.
 * @throws Outside a {@link RuntimeProvider}.
 */
export function ProvidedRuntime({
  runtime,
  children,
}: {
  runtime: Runtime | null;
  children: ReactNode;
}) {
  const { before, restart, paths } = useDoor();
  const door = useMemo<Door>(
    () => ({ runtime, before, restart, paths }),
    [runtime, before, restart, paths],
  );
  return <DoorContext value={door}>{children}</DoorContext>;
}

/** The runtime's state, re-rendering on every change: starting until the worker has started. */
export function useRuntimeState(): RuntimeState {
  const { runtime, before } = useDoor();
  const subscribe = useCallback(
    (listener: () => void) => runtime?.subscribe(listener) ?? (() => {}),
    [runtime],
  );
  const snapshot = useCallback(() => runtime?.state() ?? before, [runtime, before]);
  return useSyncExternalStore(subscribe, snapshot);
}

/**
 * The runtime's verbs, for the parts of the page drawn once it is ready.
 * @throws Before the worker has started, which no ready view can reach.
 */
export function useRuntime(): Runtime {
  const { runtime } = useDoor();
  if (runtime === null) throw new Error("useRuntime needs a started runtime");
  return runtime;
}

/**
 * The runtime once its worker has started, else null: for what stays mounted in every state,
 * such as the shell, which must not throw while the worker starts.
 */
export function useStartedRuntime(): Runtime | null {
  return useDoor().runtime;
}

/** Starts the runtime again after a failed start; null when trying again cannot help. */
export function useRestart(): (() => void) | null {
  return useDoor().restart;
}

/** The page's addresses, as the Door's host set them: a thread's, home's and the Lab's. */
export function usePaths(): Paths {
  return useDoor().paths;
}
