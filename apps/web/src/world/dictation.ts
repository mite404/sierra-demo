import type { RuntimeState } from "@yaklabs/runtime";
import { useRuntimeState } from "../runtime";
import { useScripted } from "./provider";

/** What a thread's dictation hears: the visitor's microphone, or a simulated recording. */
export type DictationSource = "microphone" | "simulated";

/**
 * How a thread hears dictation. The device's own threads, the Live Playground's among them,
 * listen to the visitor's microphone (Ethan); a thread the Demo holds, and every thread of a
 * scenario, plays a simulated recording, so a scripted take or a fixture sounds the same every
 * time. Until the runtime is ready it is simulated, since its source is not known yet.
 * @param scripted Whether the Demo holds the thread.
 */
export function dictationOf(state: RuntimeState, scripted: boolean): DictationSource {
  const onDevice = state.kind === "ready" && state.source.kind === "device";
  return onDevice && !scripted ? "microphone" : "simulated";
}

/**
 * The standing warning a simulated recording shows in place of the live microphone's: it
 * plays a scripted take, so it points to where speech really turns into text (Ethan).
 */
export const SIMULATED_NOTE = "Choose Live Playground to test Speech to Text";

/** The dictation modal's standing warning for a source: the simulated one's, or the live one's own. */
export function noteOf(source: DictationSource): string | undefined {
  return source === "simulated" ? SIMULATED_NOTE : undefined;
}

/** How the thread `id` hears dictation (`dictationOf`) and its note, as the panel's `dictation`. */
export function useDictation(id: string): { source: DictationSource; note: string | undefined } {
  const source = dictationOf(useRuntimeState(), useScripted(id)); // → DictationSource
  return { source, note: noteOf(source) };
}
