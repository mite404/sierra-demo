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
import { useLocation } from "react-router";
import { PanelRegistryProvider, type PanelRegistry } from "../components/panel-registry";
import { env } from "../env";
import { ProvidedRuntime, useStartedRuntime } from "../runtime";
import { wantedFrom } from "../source";
import { composeRuntime } from "./compose";
import { DEMO_WORLD } from "./demo";
import type { Show, ShowState } from "./show";
import { createWorld, type World } from "./world";

const WorldContext = createContext<World | null>(null);

// The Demo's world, made in an effect with a cleanup, never in a state initializer, so
// StrictMode's second mount stops the first world's shows before the second plays.
function useWorld(panels: PanelRegistry): World | null {
  const [world, setWorld] = useState<World | null>(null);
  useEffect(() => {
    const made = createWorld(DEMO_WORLD, { panels });
    // oxlint-disable-next-line react/set-state-in-effect -- the world is the external system this effect starts; render needs its handle
    setWorld(made);
    return () => {
      made.dispose();
      setWorld(null);
    };
  }, [panels]);
  return world;
}

// The Demo over the worker: one runtime for the shell, the panel registry its shows drive, and
// the world for the show bar.
function Overlaid({ children }: { children: ReactNode }) {
  const [panels] = useState<PanelRegistry>(() => new Map());
  const world = useWorld(panels);
  const worker = useStartedRuntime();
  const composed = useMemo(
    () => (worker === null || world === null ? null : composeRuntime(worker, world)),
    [worker, world],
  );
  return (
    <WorldContext value={world}>
      <ProvidedRuntime runtime={composed}>
        <PanelRegistryProvider registry={panels}>{children}</PanelRegistryProvider>
      </ProvidedRuntime>
    </WorldContext>
  );
}

/**
 * Plays the scripted Demo beside the device's own threads for as long as it is mounted: its
 * shows, their clocks and players, and the panel registry they drive, composed with the worker
 * into the one runtime the shell reads. Only over the device's data and only when the build has
 * the Demo on (`VITE_DEMO`), so a `?scenario=` fixture opens exactly as it always has.
 */
export function DemoOverlay({ children }: { children: ReactNode }) {
  const onDevice = wantedFrom(useLocation().search).kind === "device"; // → no ?scenario=
  if (!env.demo || !onDevice) return children;
  return <Overlaid>{children}</Overlaid>;
}

/**
 * The show playing on `main` and where it stands, re-rendering on each change; null when that
 * thread is no show, or the Demo is not playing.
 */
export function useShow(main: string | null): { show: Show; state: ShowState } | null {
  const world = useContext(WorldContext);
  const show = main === null ? undefined : world?.showOf(main);
  const subscribe = useCallback(
    (listener: () => void) => show?.subscribe(listener) ?? (() => {}),
    [show],
  );
  const snapshot = useCallback(() => show?.state() ?? null, [show]);
  const state = useSyncExternalStore(subscribe, snapshot);
  return show === undefined || state === null ? null : { show, state };
}

/** Whether the Demo holds the thread `id`: a show, one of its children, or one made in it. */
export function useScripted(id: string): boolean {
  return useContext(WorldContext)?.owns(id) === true;
}
