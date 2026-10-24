import { workflowSession, simulationAuthorSession } from "gateway/simulation-contract";
import { z } from "zod";

const key = "sierra-simulation-session-v1";
const savedLab = z.object({
  employeeId: z.uuid().optional(),
  authorId: z.uuid().optional(),
  definitionId: z.uuid().optional(),
  runHandles: z.record(z.string(), z.uuid()).optional(),
  phase: z
    .enum(["configure", "customer", "library"])
    .default("configure")
    .transform((phase) => (phase === "customer" ? "configure" : phase)),
});
export type SavedLab = z.infer<typeof savedLab>;
export type RestoredEmployee = z.infer<typeof workflowSession>;
export type RestoredAuthor = z.infer<typeof simulationAuthorSession>;

/** Browser storage contains handles and navigation only, never trusted invoices or model history. */
export function readLab(): SavedLab {
  try {
    return savedLab.parse(JSON.parse(localStorage.getItem(key) ?? "{}"));
  } catch {
    return { phase: "configure" };
  }
}

/**
 * Updates this browser's resumable handles synchronously, including explicit reset removal.
 * @throws When browser storage is unavailable; the request must not start without a saved handle.
 */
export function saveLab(patch: Partial<SavedLab>) {
  localStorage.setItem(key, JSON.stringify({ ...readLab(), ...patch }));
}

/** Releases the author handle without affecting saved definitions.
 * @throws When browser storage cannot be updated.
 */
export function clearAuthor() {
  const id = readLab().authorId;
  saveLab({ authorId: undefined });
  if (id !== undefined)
    void fetch(`/api/simulation-author/${id}`, { method: "DELETE" }).catch(() => {});
}

async function getSession(endpoint: string): Promise<unknown> {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Saved session unavailable");
  const data: unknown = await response.json();
  return data;
}

/**
 * Restores each role independently; missing sessions never hide healthy evidence or start a POST.
 */
export async function restoreLab(saved: SavedLab) {
  const [employee, author] = await Promise.allSettled([
    saved.employeeId === undefined
      ? null
      : getSession(`/api/workflow/${saved.employeeId}`).then((value) =>
          workflowSession.parse(value),
        ),
    saved.authorId === undefined
      ? null
      : getSession(`/api/simulation-author/${saved.authorId}`).then((value) =>
          simulationAuthorSession.parse(value),
        ),
  ]);
  return {
    employee: employee.status === "fulfilled" ? employee.value : null,
    author: author.status === "fulfilled" ? author.value : null,
    employeeUnavailable: employee.status === "rejected",
    authorUnavailable: author.status === "rejected",
  };
}
