/**
 * One structured outcome recorded while the agent worked. Recaps render these
 * records, never free prose written after the fact (ADR-005). A recap only reports:
 * anything the user must answer is an awaiting-input question instead (ADR-039).
 */
export type RecapItem = {
  text: string;
  /** The thread turn that holds the evidence for this outcome. */
  turnId: string;
  /** The step in that turn's work that recorded it, so a jump lands on its own evidence. */
  stepId?: string;
};

/** Whether the agent has worked since the user last spoke, and when that was (ADR-027). */
export type ThreadActivity = { active: boolean; lastUserInputAt: number };

/** How long an active thread must go without user input before the recap appears. */
export const RECAP_IDLE_MS = 10 * 60 * 1000;

/**
 * Whether the recap should be visible: the thread is still active, the user has not
 * sent anything for at least RECAP_IDLE_MS, and they have not dismissed the recap
 * during this idle stretch.
 */
export function shouldShowRecap({
  now,
  lastUserInputAt,
  active,
  dismissedAt,
}: {
  now: number;
  lastUserInputAt: number;
  active: boolean;
  dismissedAt?: number;
}): boolean {
  if (!active) return false;
  if (now - lastUserInputAt < RECAP_IDLE_MS) return false;
  return dismissedAt === undefined || dismissedAt < lastUserInputAt;
}

/** Formats an idle duration for the recap header, e.g. "12 min" or "2 h 5 min". */
export function formatIdle(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
