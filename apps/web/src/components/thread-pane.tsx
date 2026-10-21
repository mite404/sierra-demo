import { ChatThreadPanel } from "@yaklabs/catalog";
import type { Runtime, ThreadSummary } from "@yaklabs/runtime";
import { useSidebar } from "@yaklabs/ui/components/sidebar";
import { useEffect, useRef, type FocusEvent, type ReactNode, type RefObject } from "react";
import { inBackground, useRuntime } from "../runtime";
import { useSession } from "../session";
import { useSnoozeCard } from "../shell/snooze-card";
import { useDictation } from "../world/dictation";
import { ThreadHeaderActions } from "../shell/thread-actions-menu";
import { ChildFootnote } from "./child-footnote";
import { noting, useOutsideWork, usePanelRef, useTurns } from "./pane-turns";
import { QuietButton } from "./quiet-button";
import type { Turns } from "./turns";

// Where the focus rests in a thread, by what it shows: the frame while its turns come, Try
// again when they cannot (the frame's body, not its title bar's actions), the compose box once
// they are here.
const REST: Record<Turns["kind"], string> = {
  loading: "[data-pending]",
  failed: "[data-pending] [data-retry]", // Try again, not the collapse or the menu in the bar
  open: ".compose-box textarea",
};

// What a thread's host listens with to know whether the focus is in it.
type FocusHandlers = { onFocus: () => void; onBlur: (event: FocusEvent) => void };

// Whether the focus waits in `pane` for somewhere to rest: dropped to the page as the part that
// held it went, or on the frame, which only holds it while the turns come.
function isWaiting(pane: HTMLElement): boolean {
  const at = document.activeElement;
  return at === document.body || at === pane.querySelector(REST.loading);
}

// Keeps the focus with a thread while what it shows changes under it. Focus in the thread as
// it changes, on Try again as it is pressed or on the frame while the turns come, would fall to
// the page with the part that held it, so it moves to where the thread now rests. Focus taken
// elsewhere in the meantime stays where it went.
function useFocusFollows(host: RefObject<HTMLElement | null>, turns: Turns): FocusHandlers {
  const holding = useRef(false);
  useEffect(() => {
    const pane = host.current;
    if (pane === null || !holding.current || !isWaiting(pane)) return;
    pane.querySelector<HTMLElement>(REST[turns.kind])?.focus();
  }, [host, turns]);
  return {
    onFocus: () => {
      holding.current = true;
    },
    onBlur: (event) => {
      const next = event.relatedTarget;
      if (next !== null && host.current?.contains(next) !== true) holding.current = false;
    },
  };
}

// Puts the focus on the snooze card's first tile when it opens, once the menu that opened it
// has handed the focus back to its trigger, so a keyboard can answer it at once (ADR-128).
function useFocusCard(host: RefObject<HTMLElement | null>, open: boolean): void {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (open)
        host.current?.querySelector<HTMLElement>('[aria-label="Snooze"] .awaiting-tile')?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [host, open]);
}

/**
 * Puts the focus in the first thread inside `within`, where it rests: on its compose box once
 * the thread is open, on Try again if it could not open, and on its frame while it opens, from
 * where the focus follows the thread to one or the other.
 */
export function focusThreadIn(within: ParentNode): void {
  const pane = within.querySelector("[data-thread-pane]");
  const rest =
    pane?.querySelector(`${REST.open}, ${REST.failed}`) ?? pane?.querySelector(REST.loading);
  if (rest instanceof HTMLElement) rest.focus();
}

// A thread whose turns are not here, in the frame an open thread has: a lane keeps its paper,
// border and the title bar it is taken by; the main pane stays bare, with no bar of its own.
function PendingFrame({
  thread,
  leading,
  actions,
  bare,
  children,
}: {
  thread: ThreadSummary;
  leading: ReactNode;
  actions: ReactNode;
  bare: boolean;
  children: ReactNode;
}) {
  return (
    // The frame takes the focus while the turns come, as a place to hold it (useFocusFollows).
    <section
      className="thread-panel outline-none"
      aria-label={thread.title}
      tabIndex={-1}
      data-pending=""
      data-bare={bare ? "" : undefined}
    >
      {!bare && (
        <header className="thread-header">
          {leading !== undefined && <div className="header-leading">{leading}</div>}
          <h2>{thread.title}</h2>
          <div className="thread-header-actions">{actions}</div>
        </header>
      )}
      <div
        className="flex flex-col items-start gap-2 px-(--thread-gutter) py-5 text-sm"
        data-pending-body=""
      >
        {children}
      </div>
    </section>
  );
}

// What the frame says while the turns are not here: that the thread is opening, a line that
// steps in only once the wait is long enough to notice (index.css), or why it could not open,
// with Try again.
function PendingWords({
  title,
  turns,
  retry,
}: {
  title: string;
  turns: Exclude<Turns, { kind: "open" }>;
  retry: () => void;
}) {
  if (turns.kind === "loading") {
    return (
      <p className="text-soft-ink" data-pending-line="">
        Opening {title}…
      </p>
    );
  }
  return (
    <>
      <p className="text-ink">{title} could not be opened.</p>
      <p className="text-soft-ink">{turns.reason}</p>
      <QuietButton onClick={retry} data-retry="">
        Try again
      </QuietButton>
    </>
  );
}

// What renames a thread from its own title bar: nothing for a bare pane, which has no bar and
// is renamed from its tab.
function renamer(
  runtime: Runtime,
  thread: ThreadSummary,
  bare: boolean,
): ((title: string) => void) | undefined {
  if (bare) return undefined;
  return (title) => {
    inBackground(runtime.rename({ kind: "thread", id: thread.id }, title), "Renaming");
  };
}

// What the thread's title bar carries at its end: its own actions, then the host's trailing
// control. A bare pane has no bar.
function barActions(thread: ThreadSummary, trailing: ReactNode, bare: boolean): ReactNode {
  if (bare) return undefined;
  return (
    <>
      <ThreadHeaderActions thread={thread} />
      {trailing}
    </>
  );
}

// What the page lends a thread's panel: the snooze card, when its menu asked for it, and the
// audio its dictation hears.
function useHosting(thread: ThreadSummary) {
  return { hostAsk: useSnoozeCard(thread), dictation: useDictation(thread.id) };
}

/**
 * One thread in the catalog's panel, its turns loaded from the worker; one the snapshot says
 * holds none opens empty at once, with nothing to wait for. While they come, and when they
 * cannot, the thread keeps its frame and title bar, with a quiet line (shown only once the wait
 * is long enough to notice) or the reason and Try again inside. Focus in the thread stays in it
 * as it changes: from Try again to the frame, and on to Try again again or to the compose box.
 * The title and the opening draft come from the snapshot, so a rename shows everywhere at once.
 * Key it by the thread's id: it reads what it starts with once, as it mounts, and again once
 * work done on the thread elsewhere settles. A child says below its compose box that its parent
 * controls it (ADR-141). Under a panel registry, the panel's handle is registered by the
 * thread's id for as long as it is mounted.
 * @param leading A control before the title in the title bar, such as a lane's collapse
 * (ADR-134); in the frame too while the turns come.
 * @param trailing A control at the title bar's far end, after the thread's own actions, such as
 * a lane's close.
 * @param welcome What the thread shows while it has no turns (ADR-136); the main pane's
 * greeting, and nothing in a lane.
 * @param bare A main thread's own pane: no window frame and no title bar, so no actions or
 * rename in the pane, since its tab carries the name, the rename and the menu (ADR-138). Only a
 * lane on the canvas is a window.
 */
export function ThreadPane({
  thread,
  leading,
  trailing,
  welcome,
  bare = false,
}: {
  thread: ThreadSummary;
  leading?: ReactNode;
  trailing?: ReactNode;
  welcome?: ReactNode;
  bare?: boolean;
}) {
  const runtime = useRuntime();
  const session = useSession();
  const { isMobile } = useSidebar();
  const { turns, retry, reread, revision } = useTurns(thread);
  const note = useOutsideWork(thread, reread);
  const panelRef = usePanelRef(thread.id);
  const host = useRef<HTMLDivElement>(null);
  const follow = useFocusFollows(host, turns);
  const hosting = useHosting(thread); // → the snooze card's ask and how dictation hears
  useFocusCard(host, hosting.hostAsk !== undefined);
  const actions = barActions(thread, trailing, bare); // → the bar's end, or undefined when bare
  return (
    <div ref={host} className="contents" data-thread-pane="" {...follow}>
      {turns.kind === "open" ? (
        <ChatThreadPanel
          key={revision}
          ref={panelRef}
          thread={{ title: thread.title, messages: turns.messages }}
          agent={noting(runtime.agent(thread.id, session), note)}
          initialDraft={thread.draft}
          onRename={renamer(runtime, thread, bare)}
          cardsCarry={!isMobile}
          headerActions={actions}
          {...hosting}
          leading={leading}
          empty={welcome}
          bare={bare}
          footnote={thread.place.kind === "child" ? <ChildFootnote thread={thread} /> : undefined}
        />
      ) : (
        <PendingFrame thread={thread} leading={leading} actions={actions} bare={bare}>
          <PendingWords title={thread.title} turns={turns} retry={retry} />
        </PendingFrame>
      )}
    </div>
  );
}
