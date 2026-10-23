import { customerSession, workflowSession } from "gateway/simulation-contract";
import { z } from "zod";

const key = "sierra-simulation-session-v1";
const savedLab = z.object({
  employeeId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  phase: z.enum(["configure", "customer"]).default("configure"),
  persona: z.enum(["spouse", "owner"]).default("spouse"),
});
export type SavedLab = z.infer<typeof savedLab>;
export type RestoredEmployee = z.infer<typeof workflowSession>;
export type RestoredCustomer = z.infer<typeof customerSession>;

/** Browser storage contains handles and navigation only, never trusted invoices or model history. */
export function readLab(): SavedLab {
  try {
    return savedLab.parse(JSON.parse(localStorage.getItem(key) ?? "{}"));
  } catch {
    return { phase: "configure", persona: "spouse" };
  }
}

/**
 * Updates this browser's resumable handles synchronously, including explicit reset removal.
 * @throws When browser storage is unavailable; the request must not start without a saved handle.
 */
export function saveLab(patch: Partial<SavedLab>) {
  localStorage.setItem(key, JSON.stringify({ ...readLab(), ...patch }));
}

/**
 * Explicit reset clears the selected browser handles and releases abandoned server session slots.
 * @throws When browser storage cannot be cleared.
 */
export function resetLab(scope: "test" | "workflow") {
  const saved = readLab();
  const ids = [
    ["simulation", saved.customerId],
    ...(scope === "workflow" ? [["workflow", saved.employeeId]] : []),
  ];
  saveLab(
    scope === "workflow"
      ? { employeeId: undefined, customerId: undefined, phase: "configure", persona: "spouse" }
      : { customerId: undefined },
  );
  for (const [endpoint, id] of ids) {
    if (id) void fetch(`/api/${endpoint}/${id}`, { method: "DELETE" }).catch(() => {});
  }
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
  const [employee, customer] = await Promise.allSettled([
    saved.employeeId
      ? getSession(`/api/workflow/${saved.employeeId}`).then((value) =>
          workflowSession.parse(value),
        )
      : null,
    saved.customerId
      ? getSession(`/api/simulation/${saved.customerId}`).then((value) =>
          customerSession.parse(value),
        )
      : null,
  ]);
  return {
    employee: employee.status === "fulfilled" ? employee.value : null,
    customer: customer.status === "fulfilled" ? customer.value : null,
    employeeUnavailable: employee.status === "rejected",
    customerUnavailable: customer.status === "rejected",
  };
}
