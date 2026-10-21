import { AgentTree } from "@yaklabs/catalog";
import type { RuntimeState, ThreadSummary } from "@yaklabs/runtime";
import { useRuntimeState } from "../runtime";
import { isWorking } from "../shell/working";

// The pill wears the user bubble's sage (design pillars, rule 15; ADR-142's "same green fill as
// the user conversation bubble"), so it reads as the reader's own work going on elsewhere.
const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--bubble-line)] bg-[var(--bubble-tint-strong)] px-2 py-0.5 text-[11px] leading-4 font-medium text-ink";

/**
 * Whose a child thread is, by its parent's title (Ethan): "Belongs to Weekly brief". It says
 * "parent thread" while the parent is not in the workspace, as before the runtime is ready.
 */
export function belongsTo(state: RuntimeState, thread: ThreadSummary): string {
  const { place } = thread;
  const parent =
    state.kind === "ready" && place.kind === "child"
      ? state.workspace.threads.find((each) => each.id === place.parentId)
      : undefined; // → ThreadSummary | undefined
  return `Belongs to ${parent?.title ?? "parent thread"}`;
}

/**
 * What a child thread says below its compose box (ADR-141, ADR-142): the thread it belongs to,
 * cut with an ellipsis rather than pushing the pill aside, and, while its work is in flight by
 * the runtime's own live state, a "Running" pill beside that. The word carries the state; the
 * glyph and the fill only echo it.
 */
export function ChildFootnote({ thread }: { thread: ThreadSummary }) {
  const state = useRuntimeState();
  const running = isWorking(state, thread.id);
  return (
    <div data-slot="child-footnote" className="flex items-center gap-2 text-xs text-soft-ink">
      <span className="min-w-0 truncate">{belongsTo(state, thread)}</span>
      {running && (
        <span data-slot="running" className={`shrink-0 ${PILL}`}>
          {/* The word names the state; the glyph's own label would say it twice. */}
          <span aria-hidden="true" className="flex">
            <AgentTree />
          </span>
          Running
        </span>
      )}
    </div>
  );
}
