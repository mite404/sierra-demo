import { Button } from "@yaklabs/ui/components/button";
import { DropdownMenu, DropdownMenuTrigger } from "@yaklabs/ui/components/dropdown-menu";
import { Ellipsis } from "lucide-react";
import type { Shell } from "./model";
import { onScreen } from "./state";
import { THREAD_ACTIONS, ThreadActionsContent } from "./thread-actions-menu";

/** The name of the project on screen, where a phone's bar shows it in place of the tabs. */
export function ProjectName({ shell }: { shell: Shell | null }) {
  return (
    <span
      data-slot="project-name"
      className="min-w-0 truncate px-1 text-sm font-medium text-ink md:hidden"
    >
      {shell === null ? null : onScreen(shell.workspace, shell.active).name}
    </span>
  );
}

// The "⋯" itself, which only a phone shows.
function MoreTrigger({ disabled }: { disabled: boolean }) {
  return (
    <DropdownMenuTrigger
      disabled={disabled}
      render={
        <Button
          variant="ghost"
          size="icon"
          aria-label={THREAD_ACTIONS}
          className="text-soft-ink hover:text-ink md:hidden"
        />
      }
    >
      <Ellipsis aria-hidden="true" />
    </DropdownMenuTrigger>
  );
}

/**
 * The phone bar's "⋯" (ADR-116, ADR-126): the thread menu for the thread the address names,
 * a child in focus or else its main. A desktop has it in each thread's own title bar instead.
 * Nothing on screen leaves it disabled. Snoozing a main that another view hides first shows
 * the thread, where the snooze card opens.
 */
export function ThreadMenu({ shell }: { shell: Shell | null }) {
  const thread = shell === null ? null : onScreen(shell.workspace, shell.active).thread;
  if (shell === null || thread === null) {
    return (
      <DropdownMenu>
        <MoreTrigger disabled />
      </DropdownMenu>
    );
  }
  const { active } = shell;
  return (
    <DropdownMenu>
      <MoreTrigger disabled={false} />
      <ThreadActionsContent
        shell={shell}
        thread={thread}
        beforeSnooze={() => {
          if (active !== null && active.focus === null) shell.setPane(active.main, "thread");
        }}
      />
    </DropdownMenu>
  );
}
