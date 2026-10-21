import type { ThreadSummary } from "@yaklabs/runtime";
import { DropdownMenuItem } from "@yaklabs/ui/components/dropdown-menu";
import { AlarmClock } from "lucide-react";
import { MenuStatus, statusName } from "./menu-status";
import type { Shell } from "./model";
import { wakeText } from "./wake-text";

/**
 * The thread menu's Snooze item (ADR-128): it opens the snooze card, and a snoozed thread's
 * item says when it wakes.
 * @param before Runs before the card opens, to bring the thread into view.
 */
export function SnoozeItem({
  shell,
  thread,
  before,
}: {
  shell: Shell;
  thread: ThreadSummary;
  before?: () => void;
}) {
  const wakes =
    thread.snoozedUntil === null ? undefined : wakeText(new Date(thread.snoozedUntil), "menu");
  return (
    <DropdownMenuItem
      aria-label={statusName("Snooze", wakes)}
      onClick={() => {
        before?.();
        shell.askSnooze(thread.id);
      }}
    >
      <AlarmClock aria-hidden="true" />
      Snooze
      {wakes !== undefined && <MenuStatus>{wakes}</MenuStatus>}
    </DropdownMenuItem>
  );
}
