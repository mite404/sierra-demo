import { scenarioNames, type LegacyCanvas, type ScenarioName } from "@yaklabs/runtime";
import { z } from "zod";

/**
 * What the address asks the runtime to open (ADR-096): the device's own threads, a mock
 * scenario, or a scenario name that does not exist, which opens nothing.
 */
export type Wanted =
  | { kind: "device" }
  | { kind: "scenario"; name: ScenarioName }
  | { kind: "unknown"; name: string };

const PARAM = "scenario";

const idsSchema = z.array(z.string());

// A stored list of ids, or none when the key is missing, not JSON, or not a list of strings.
function idsFrom(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed = idsSchema.safeParse(JSON.parse(raw)); // → string[], or why it is not
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Reads `?scenario=` from the page's address, the one place the page decides it. */
export function wantedFrom(search: string): Wanted {
  const name = new URLSearchParams(search).get(PARAM); // → string | null
  if (name === null) return { kind: "device" };
  const known = scenarioNames.find((each) => each === name);
  return known === undefined ? { kind: "unknown", name } : { kind: "scenario", name: known };
}

/**
 * `path` with the scenario the page was opened on, even an unknown one, so a link inside a mock
 * visit never drifts onto the device's data.
 */
export function keepScenario(path: string, wanted: Wanted): string {
  if (wanted.kind === "device") return path;
  return `${path}?${new URLSearchParams({ [PARAM]: wanted.name }).toString()}`;
}

/** Why an unknown scenario opens nothing, naming the ones that exist. */
export function unknownScenario(name: string): string {
  return `There is no scenario called "${name}". The scenarios are ${scenarioNames.join(", ")}.`;
}

/**
 * The v1 canvas's hidden lanes and lane order (ADR-089) from their two localStorage values,
 * for the worker's 1 → 2 migration; undefined when neither was ever written.
 */
export function legacyFrom(hidden: string | null, order: string | null): LegacyCanvas | undefined {
  if (hidden === null && order === null) return undefined;
  return { hidden: idsFrom(hidden), order: idsFrom(order) };
}
