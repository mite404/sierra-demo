import type { ThreadHandle } from "@yaklabs/catalog/thread";
import { createContext, useContext, type ReactNode } from "react";

/** Each mounted thread panel's handle, by its thread's id: what a scripted demo drives. */
export type PanelRegistry = Map<string, ThreadHandle>;

const RegistryContext = createContext<PanelRegistry | null>(null);

/**
 * Lets every thread panel below it register its handle in `registry` while it is mounted, so a
 * host (the scripted demo's player) can type, send, answer, stop and retry through the panel's
 * own controls.
 */
export function PanelRegistryProvider({
  registry,
  children,
}: {
  registry: PanelRegistry;
  children: ReactNode;
}) {
  return <RegistryContext value={registry}>{children}</RegistryContext>;
}

/** The registry the panels below register in, or null where no host drives them. */
export function usePanelRegistry(): PanelRegistry | null {
  return useContext(RegistryContext);
}
