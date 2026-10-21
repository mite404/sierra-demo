import type { HostAsk } from "@yaklabs/catalog";
import type { ThreadSummary } from "@yaklabs/runtime";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRuntime } from "../runtime";
import { useShell, type Shell } from "./model";
import { snoozeChoices, snoozeQuestion, wakeFor, type SnoozeChoice } from "./snooze";

// The card's tiles, once the thread's turns are read.
type Ready = { id: string; choices: SnoozeChoice[] };

// The tiles for a thread, read from its turns as the worker has them when the card opens, so
// a date in a message sent a moment ago counts. A thread that cannot be read gets the fallbacks.
function useChoices(thread: ThreadSummary, asking: boolean): Ready | null {
  const runtime = useRuntime();
  const [ready, setReady] = useState<Ready | null>(null);
  useEffect(() => {
    let live = asking;
    const read = async () => {
      const messages = await runtime.open(thread.id).catch(() => []); // → ThreadMessage[]
      if (live) setReady({ id: thread.id, choices: snoozeChoices(messages, new Date()) });
    };
    if (asking) void read();
    return () => {
      live = false;
    };
  }, [runtime, thread.id, asking]);
  return asking && ready?.id === thread.id ? ready : null;
}

/**
 * The snooze card for a thread (ADR-128) while the thread menu has it open: the agent's card,
 * named Snooze, with the tiles `snoozeChoices` finds and a field for any time. Undefined while
 * it is closed.
 */
export function useSnoozeCard(thread: ThreadSummary): HostAsk | undefined {
  const shell = useShell();
  const ready = useChoices(thread, shell?.snoozing === thread.id);
  return shell === null || ready === null ? undefined : snoozeCard(shell, thread, ready.choices);
}

// The card itself: its question, and what an answer does. A typed time that cannot be read
// keeps the card open and says so.
function snoozeCard(shell: Shell, thread: ThreadSummary, choices: SnoozeChoice[]): HostAsk {
  const wakes = thread.snoozedUntil === null ? null : new Date(thread.snoozedUntil);
  return {
    label: "Snooze",
    question: snoozeQuestion(choices, wakes),
    onAnswer: (answer) => {
      const until = wakeFor(answer, choices, new Date());
      if (until !== undefined) {
        shell.snooze(thread.id, until);
        return;
      }
      toast.error(`“${answer}” is not a time ahead`, {
        description: "Try Friday 3pm, in 2 hours, or 3 October.",
      });
    },
    onDismiss: () => {
      shell.askSnooze(null);
    },
  };
}
