import type { ThreadId, ThreadSummary } from "@yaklabs/runtime";
import { Button } from "@yaklabs/ui/components/button";
import { DropdownMenu, DropdownMenuTrigger } from "@yaklabs/ui/components/dropdown-menu";
import { Skeleton } from "@yaklabs/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@yaklabs/ui/components/tabs";
import { Ellipsis, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { inBackground, useRuntime } from "../runtime";
import { panelId } from "./deck";
import { LAYOUTS } from "./layouts";
import type { Shell } from "./model";
import { closeTab, viewOf } from "./state";
import { THREAD_ACTIONS, ThreadActionsContent } from "./thread-actions-menu";

// A tab's box. A tablist may own only tabs, so each close button sits in a layer over the
// tablist, in a slot with this same box in the same row: it lines up with its tab unmeasured.
const TAB_BOX = "w-[220px] min-w-28 shrink data-active:min-w-40";

// Marks a tab hovered while the pointer is on it or on its close button. The two sit in
// different layers, so neither :hover nor a Tailwind group can pair them.
type Hover = {
  hovered: ThreadId | null;
  handlers: (id: ThreadId) => { onPointerEnter: () => void; onPointerLeave: () => void };
  leave: (id: ThreadId) => void;
};

// Which tab's title is open as a field (a click on its words while it is in view, or Rename in
// its menu). Only one is at a time, and it is held here because the tab and its "⋯" sit in
// different layers.
type Renaming = { id: ThreadId | null; set: (id: ThreadId | null) => void };

function tabId(main: ThreadId): string {
  return `tab-${main}`;
}

function tabOf(main: ThreadId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#${CSS.escape(tabId(main))}`);
}

function useHover(): Hover {
  const [hovered, setHovered] = useState<ThreadId | null>(null);
  const leave = useCallback((id: ThreadId) => {
    setHovered((current) => (current === id ? null : current));
  }, []);
  return {
    hovered,
    handlers: (id) => ({
      onPointerEnter: () => {
        setHovered(id);
      },
      onPointerLeave: () => {
        leave(id);
      },
    }),
    leave,
  };
}

// Scrolls the active tab into view whenever it changes.
function useInView(active: ThreadId | null): void {
  useEffect(() => {
    if (active !== null) tabOf(active)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
}

// Closes a tab from one of its own controls. If that control held focus, focus moves to the tab
// that takes the closed one's place, else to New thread (APG), instead of falling to the page.
function closeFrom(
  shell: Shell,
  id: ThreadId,
  control: Element,
  plus: RefObject<HTMLButtonElement | null>,
): void {
  const held = control === document.activeElement;
  const { next } = closeTab(shell.doc, id); // → the right neighbour, else the left, else null
  shell.close(id);
  if (held) (next === null ? plus.current : tabOf(next))?.focus();
}

// What a tab and its close button share.
type TabProps = {
  thread: ThreadSummary;
  shell: Shell;
  hover: Hover;
  renaming: Renaming;
  plus: RefObject<HTMLButtonElement | null>;
};

// The name a typed title asks for: trimmed, or null when it was dropped (Escape), is empty, or
// is the name it has.
function nextTitle(typed: string | null, current: string): string | null {
  const next = typed?.trim() ?? ""; // → the title without stray spaces, "" when dropped
  return next === "" || next === current ? null : next;
}

// The title in place, in the tab's own box (ADR-138): Enter keeps what was typed, Escape puts
// the old title back, and leaving the field keeps what was typed. Every way out goes through
// the field's blur, so the field is never torn down inside the key event that closed it. Its
// keys stop here: the tablist would take the arrows, Home and End to move between tabs.
function TabTitleField({
  title,
  icon,
  onDone,
}: {
  title: string;
  icon: ReactNode;
  onDone: (typed: string | null, refocus: boolean) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const exit = useRef<"blur" | "enter" | "escape">("blur");
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <div className="tab-box flex h-[30px] w-full min-w-0 items-center gap-2 rounded-[var(--radius)] bg-[var(--chrome-pill)] pr-13 pl-2.5 text-xs text-ink focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--focus)]">
      {icon}
      <input
        ref={field}
        className="tab-rename min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-ink"
        aria-label="Thread title"
        defaultValue={title}
        onBlur={(event) => {
          const { current } = exit;
          onDone(current === "escape" ? null : event.currentTarget.value, current !== "blur");
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key !== "Enter" && event.key !== "Escape") return;
          exit.current = event.key === "Enter" ? "enter" : "escape";
          event.currentTarget.blur();
        }}
      />
    </div>
  );
}

// Renames a thread from a tab, without waiting on the worker; a name that is empty or the one
// it has changes nothing.
function useRenameThread(thread: ThreadSummary): (typed: string | null) => void {
  const runtime = useRuntime();
  return (typed) => {
    const title = nextTitle(typed, thread.title); // → the new name, or null to keep the old
    if (title !== null) {
      inBackground(runtime.rename({ kind: "thread", id: thread.id }, title), "Renaming");
    }
  };
}

// Puts the focus back on a tab once its field has gone and the tab is there again, if the
// returned function was told it should.
function useRefocusAfterRename(id: ThreadId, editing: boolean): (refocus: boolean) => void {
  const wanted = useRef(false);
  useEffect(() => {
    if (editing || !wanted.current) return;
    wanted.current = false;
    tabOf(id)?.focus();
  }, [id, editing]);
  return (refocus) => {
    wanted.current = refocus;
  };
}

// Whether a thread is the main one in view.
const inView = (shell: Shell, id: ThreadId): boolean => shell.active?.main === id;

// Whether a click landed on a tab's title words rather than its glyph or padding.
const onTitle = (target: EventTarget): boolean =>
  target instanceof Element && target.closest("[data-tab-title]") !== null;

// The tab itself, which chooses its thread. Delete closes it (APG), and so does a middle click.
// On the tab in view, a click on its title's words opens them as a field, the text cursor
// saying so (Ethan); elsewhere on it, or on a tab not in view, a click chooses the tab, so a
// second click on another tab's title, once the first has chosen it, renames it.
function TabButton({
  thread,
  active,
  hover,
  icon,
  onRename,
  onClose,
}: {
  thread: ThreadSummary;
  active: boolean;
  hover: Hover;
  icon: ReactNode;
  onRename: () => void;
  onClose: (control: Element) => void;
}) {
  return (
    <TabsTrigger
      value={thread.id}
      id={tabId(thread.id)}
      aria-controls={panelId(thread.id)}
      data-hovered={hover.hovered === thread.id || undefined}
      className="tab h-[30px] w-full min-w-0 flex-none justify-start gap-2 rounded-[var(--radius)] bg-transparent px-2.5 text-xs font-normal text-soft-ink data-hovered:pr-7 data-hovered:text-ink data-hovered:not-data-active:bg-paper-deep data-active:bg-[var(--chrome-pill)] data-active:pr-13 data-active:text-ink dark:text-soft-ink dark:data-hovered:text-ink dark:data-active:border-transparent dark:data-active:bg-[var(--chrome-pill)] dark:data-active:text-ink"
      {...hover.handlers(thread.id)}
      onAuxClick={(event) => {
        if (event.button === 1) onClose(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") onClose(event.currentTarget);
      }}
      onClick={(event) => {
        if (active && onTitle(event.target)) onRename();
      }}
    >
      {icon}
      <span data-tab-title className={active ? "cursor-text truncate" : "truncate"}>
        {thread.title}
      </span>
    </TabsTrigger>
  );
}

// One open thread: its layout's glyph and title (APG: Delete closes a focused tab, and a
// middle click closes any). On the green bar a tab is clear at rest, fills while hovered, and the
// active one is the cream pill (ADR-110). A click on the active one's words opens the title as a
// field, in place of the tab and inside the same box.
function Tab({ thread, shell, hover, renaming, plus }: TabProps) {
  const { Icon } = LAYOUTS[viewOf(shell.doc, thread.id).pane];
  const { leave } = hover;
  const editing = renaming.id === thread.id;
  const rename = useRenameThread(thread);
  const wantFocus = useRefocusAfterRename(thread.id, editing);
  const icon = <Icon className="size-3.5 shrink-0" aria-hidden="true" />;
  // A tab closed under the pointer never hears it leave, so its hover would come back with it.
  useEffect(
    () => () => {
      leave(thread.id);
    },
    [leave, thread.id],
  );
  const close = (control: Element) => {
    closeFrom(shell, thread.id, control, plus);
  };
  const active = inView(shell, thread.id);
  return (
    <div
      role="presentation"
      data-active={active || undefined}
      className={`chrome-pill flex ${TAB_BOX}`}
    >
      {editing ? (
        <TabTitleField
          title={thread.title}
          icon={icon}
          onDone={(typed, refocusTab) => {
            wantFocus(refocusTab);
            rename(typed);
            renaming.set(null);
          }}
        />
      ) : (
        <TabButton
          thread={thread}
          active={active}
          hover={hover}
          icon={icon}
          onRename={() => {
            renaming.set(thread.id);
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

// The active tab's "⋯", left of its close: the thread's menu (ADR-126), which a main thread no
// longer carries in a title bar of its own. Only the tab in view has one, so it is the one
// "⋯" the keyboard reaches after the strip, and the menu always acts on the thread on screen.
// It shows while the pointer is on the tab, while its menu is open and while it holds the
// keyboard's focus; the rest of the time it is only faded out, never removed, so it keeps its
// place in the tab order and the accessibility tree.
function TabMenu({ thread, shell, hover, renaming }: TabProps) {
  if (shell.active?.main !== thread.id) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={THREAD_ACTIONS}
            data-hovered={hover.hovered === thread.id || undefined}
            className="pointer-events-auto absolute top-1/2 right-7 flex size-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius)] border-0 bg-transparent p-0 text-soft-ink opacity-0 hover:bg-paper-deep hover:text-ink focus-visible:opacity-100 aria-expanded:bg-paper-deep aria-expanded:text-ink aria-expanded:opacity-100 data-hovered:opacity-100"
            {...hover.handlers(thread.id)}
          />
        }
      >
        <Ellipsis className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <ThreadActionsContent
        shell={shell}
        thread={thread}
        onRename={() => {
          renaming.set(thread.id);
        }}
        // Snoozing opens its card in the thread's pane, which a browser or canvas view hides.
        beforeSnooze={() => {
          shell.setPane(thread.id, "thread");
        }}
      />
    </DropdownMenu>
  );
}

// A tab's close button, in its slot over the tab's right end: shown on the active tab and while
// the pointer is on the tab. It is for the pointer; the keyboard closes a tab with Delete.
function CloseSlot(props: TabProps) {
  const { thread, shell, hover, plus } = props;
  const active = inView(shell, thread.id);
  return (
    <div data-active={active || undefined} className={`chrome-pill group/slot relative ${TAB_BOX}`}>
      <TabMenu {...props} />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${thread.title}`}
        data-hovered={hover.hovered === thread.id || undefined}
        className="pointer-events-auto absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius)] border-0 bg-transparent p-0 text-soft-ink opacity-0 group-data-active/slot:opacity-100 data-hovered:opacity-100 hover:bg-paper-deep hover:text-ink"
        {...hover.handlers(thread.id)}
        onClick={(event) => {
          closeFrom(shell, thread.id, event.currentTarget, plus);
        }}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The open threads as shadcn Tabs: choosing one goes to its address, which is what makes it
 * active. Tabs narrow as more open; past their floor the strip scrolls, fading at an edge with
 * tabs beyond it, and keeps the active one in view. While the runtime starts, one skeleton tab
 * holds the place; a failed start leaves the strip empty.
 */
export function TabStrip({ shell, starting }: { shell: Shell | null; starting: boolean }) {
  const active = shell?.active?.main ?? null;
  const hover = useHover();
  const [renamingId, setRenaming] = useState<ThreadId | null>(null);
  const renaming: Renaming = { id: renamingId, set: setRenaming };
  const plus = useRef<HTMLButtonElement>(null);
  useInView(active);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 max-md:hidden">
      <Tabs
        value={active}
        onValueChange={(value) => {
          const tab = shell?.tabs.find((each) => each.id === value);
          if (tab) shell?.open(tab.id);
        }}
        className="min-w-0 flex-row"
      >
        <div className="tab-scroller no-scrollbar grid min-w-0 overflow-x-auto">
          <TabsList
            aria-label="Open threads"
            className="h-auto w-auto min-w-0 justify-start gap-1 bg-transparent p-0 [grid-area:1/1]"
          >
            {starting && <Skeleton className="h-[30px] w-40 rounded-[var(--radius)]" />}
            {shell?.tabs.map((thread) => (
              <Tab
                key={thread.id}
                thread={thread}
                shell={shell}
                hover={hover}
                renaming={renaming}
                plus={plus}
              />
            ))}
          </TabsList>
          <div className="pointer-events-none flex min-w-0 gap-1 [grid-area:1/1]">
            {shell?.tabs.map((thread) => (
              <CloseSlot
                key={thread.id}
                thread={thread}
                shell={shell}
                hover={hover}
                renaming={renaming}
                plus={plus}
              />
            ))}
          </div>
        </div>
      </Tabs>
      <Button
        ref={plus}
        variant="ghost"
        size="icon-sm"
        className="text-soft-ink"
        aria-label="New thread"
        disabled={shell === null}
        onClick={() => {
          shell?.newThread();
        }}
      >
        <Plus />
      </Button>
    </div>
  );
}
