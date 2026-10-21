import type { ThreadId, ThreadSummary } from "@yaklabs/runtime";
import { AgentTree } from "@yaklabs/catalog";
import { ChildThreadIcon } from "@yaklabs/catalog/icons";
import { SidebarMenuButton } from "@yaklabs/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@yaklabs/ui/components/tooltip";
import {
  AlarmClock,
  Archive,
  ChevronDown,
  ChevronRight,
  Pin,
  PinOff,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactElement } from "react";
import { Link } from "react-router";
import { usePaths, useRuntimeState } from "../runtime";
import { useShell } from "./model";
import { rowLook, type Mark, type RowLook } from "./row-marks";
import { useLabelCut } from "./label-cut";
import { isWorking } from "./working";

// A row: the hover fill stays inside the sidebar's padding, with the site's 4px corners.
const ROW = "h-8 rounded-[var(--radius)] text-sm";

// A project's threads sit one step in under its name, so the name reads as the label of the
// group below it. The fill still spans the row; only the words move in. A child's branch icon
// stands where its main's title starts, and its own title one step further in. The right keeps the
// 8px every row has, so a long title or a fold arrow stops short of the fill's edge. `relative`
// is what the row's marks hang from.
const THREAD_ROW = `${ROW} relative pl-6 pr-2`;

// shadcn leaves room at a row's right end when its item holds an action. The project's "+"
// shares its item with the project's threads, so that room reaches every thread row, though
// none of them holds an action of its own; each takes it back for its title.
const NO_ACTION = "group-has-data-[sidebar=menu-action]/menu-item:pr-2";

// Each mark's icon: a pin, a clock, a closed filebox.
const MARK_ICONS: Record<Mark, LucideIcon> = {
  pinned: Pin,
  snoozed: AlarmClock,
  archived: Archive,
};

// The marks hang in the row's left gutter, out of the flow, so a title starts at the same x
// marked or not, and a child's mark stands left of its branch icon. The gutter is `pl-6`, 24px:
// a mark is 14px, 4px in from the fill's edge (clear of its 4px corners) and 6px short of the
// title.
// Two do not fit side by side, so they stack, a step smaller, and a thread carries at most two
// since archiving clears a pin and a snooze (ADR-129).
const MARKS = "absolute inset-y-0 left-1 flex w-3.5 flex-col items-center justify-center";

// The marks at the row's left; the icons say to the eye what `spoken` says to a screen reader.
function Marks({ marks }: { marks: Mark[] }) {
  if (marks.length === 0) return null;
  const size = marks.length > 1 ? "size-3!" : "size-3.5!";
  return (
    <span aria-hidden="true" className={MARKS}>
      {marks.map((mark) => {
        const Icon = MARK_ICONS[mark];
        return <Icon key={mark} data-mark={mark} className={`${size} shrink-0`} />;
      })}
    </span>
  );
}

// How many threads a fold holds, as its button names them: "2 threads", "1 thread".
const threadCount = (count: number): string => `${count} ${count === 1 ? "thread" : "threads"}`;

// A row's own title, cut to whatever room its row leaves it and faded out at the cut (index.css,
// `useLabelCut`). `block` matters here: as a flex item's child it would otherwise stay inline
// and ignore that width.
const LABEL = "block overflow-hidden whitespace-nowrap";

// Whether the row's label is cut short, so its tooltip has something to add.
function isCut(row: Element | undefined): boolean {
  const label = row?.querySelector("[data-label]") ?? null;
  return label !== null && label.scrollWidth > label.clientWidth;
}

// A row whose label may be cut short: the whole name shows beside it, and only when it is cut,
// unless `always` (a snoozed row, whose tooltip says when it wakes). The cut is measured as the
// tooltip asks to open, so the first hover and a keyboard focus count as much as a second hover.
function Named({
  name,
  row,
  always = false,
}: {
  name: string;
  row: ReactElement;
  always?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      open={open}
      onOpenChange={(next, { trigger }) => {
        setOpen(next && (always || isCut(trigger)));
      }}
    >
      <TooltipTrigger render={row} />
      <TooltipContent side="right" className="max-w-80 whitespace-normal wrap-anywhere">
        {name}
      </TooltipContent>
    </Tooltip>
  );
}

// The fold arrow a project's row and a main thread's fold button share: ">" while folded, and
// open, a "v" that fades in while the pointer is on the row and fades out once it leaves - each
// wraps this in its own `group/fold`, whether that group is the whole row (a project) or just
// spans it (a thread row's stretched link and separate button both sit inside one). Keyboard
// focus shows it too, but only `:focus-visible`: a click also leaves focus on the button, and
// plain `:focus-within` would then hold the "v" up after the pointer has gone.
// A touch screen, with no hover to reveal it, shows the "v" whenever the fold is open.
function FoldChevron({ open }: { open: boolean }): ReactElement {
  const common = "size-3.5! shrink-0 text-soft-ink";
  return open ? (
    <ChevronDown
      data-slot="fold-chevron"
      aria-hidden="true"
      className={`${common} opacity-0 transition-opacity group-hover/fold:opacity-100 group-has-focus-visible/fold:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none`}
    />
  ) : (
    <ChevronRight data-slot="fold-chevron" aria-hidden="true" className={common} />
  );
}

// A child's branch, where its main's title starts; the row's title names it.
function ChildIcon(): ReactElement {
  return (
    <span data-slot="child-icon" aria-hidden="true" className="flex shrink-0 text-soft-ink">
      <ChildThreadIcon />
    </span>
  );
}

// Whether a thread's row shows the working glyph, read from the runtime's own live state.
function useWorking(threadId: ThreadId): boolean {
  return isWorking(useRuntimeState(), threadId);
}

// A row's words after a child's branch icon: its marks (which hang in the gutter, out of the
// flow), the working glyph while its reply is in flight, its title, and the marks as a screen
// reader hears them.
function RowWords({ thread, look }: { thread: ThreadSummary; look: RowLook }): ReactElement {
  const working = useWorking(thread.id);
  const label = useLabelCut();
  return (
    <>
      <Marks marks={look.marks} />
      {working && <AgentTree label={`${thread.title} is working`} />}
      <span ref={label} data-label="" className={LABEL}>
        {thread.title}
      </span>
      <span className="sr-only">{look.spoken}</span>
    </>
  );
}

// The fold arrow's own button on a main's row, named by how many threads it hides or shows.
// `relative z-10` lifts it over the row's stretched link, so it still receives its own clicks.
function FoldButton({
  open,
  count,
  title,
  onToggle,
}: {
  open: boolean;
  count: number;
  title: string;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} the ${threadCount(count)} in ${title}`}
      onClick={onToggle}
      className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius)] border-0 bg-transparent p-0 text-soft-ink outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
    >
      <FoldChevron open={open} />
    </button>
  );
}

// A pinned row's Unpin (ADR-127), at its right end, shown while the pointer or the focus is on
// the row (`group/thread` is the row's list item) and always on a touch screen, which has no
// hover to show it. It sits beside the row, not in its link, since a button may not live in one.
// A row that shows a count leaves that its corner, so this stands one step left of it. Nothing
// unless the thread is pinned.
function UnpinButton({ thread, beside }: { thread: ThreadSummary; beside?: boolean }) {
  const shell = useShell();
  if (shell === null || thread.pinnedAt === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`Unpin ${thread.title}`}
            data-slot="unpin"
            onClick={() => {
              shell.pin(thread.id, false);
            }}
            className={`absolute top-1/2 ${beside === true ? "right-7" : "right-1"} z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-[var(--radius)] border-0 bg-transparent p-0 text-soft-ink opacity-0 outline-hidden ring-sidebar-ring transition-opacity group-focus-within/thread:opacity-100 group-hover/thread:opacity-100 hover:bg-paper-deep hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 motion-reduce:transition-none [@media(hover:none)]:opacity-100`}
          />
        }
      >
        <PinOff className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="top">Unpin thread</TooltipContent>
    </Tooltip>
  );
}

/**
 * A main thread with sub-threads: the stretched-link pattern (Bootstrap's recipe), so a click
 * anywhere on the row still opens the thread while a separate button folds the children, and
 * the number of children sits at the row's far right, read only, since the button names it. The
 * link stays un-positioned and sized to its title; its `::after` is what stretches, to the
 * row's own edges, since that is the nearest positioned ancestor. The button sits after the
 * title in flow, lifted above that layer by its own stacking context (`relative z-10`) so it
 * still receives its own clicks.
 */
function FoldableMainRow({
  thread,
  active,
  open,
  count,
  onToggle,
}: {
  thread: ThreadSummary;
  active: boolean;
  open: boolean;
  count: number;
  onToggle: () => void;
}): ReactElement {
  const { pathTo } = usePaths();
  const look = rowLook(thread);
  return (
    <>
      <Named
        name={look.tooltip}
        always={look.alwaysTip}
        row={
          <div
            data-slot="thread-row"
            data-active={active || undefined}
            className={`${THREAD_ROW} group/fold flex items-center gap-2 ${look.ink} hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-ink`}
          >
            <Link
              to={pathTo(thread.id)}
              aria-current={active ? "page" : undefined}
              data-thread="main"
              className="flex min-w-0 items-center gap-2 text-inherit outline-hidden after:absolute after:inset-0 after:rounded-[var(--radius)] focus-visible:after:ring-2 focus-visible:after:ring-sidebar-ring"
            >
              <RowWords thread={thread} look={look} />
            </Link>
            <FoldButton open={open} count={count} title={thread.title} onToggle={onToggle} />
            <span
              data-slot="thread-count"
              aria-hidden="true"
              className="ml-auto shrink-0 text-xs text-soft-ink tabular-nums"
            >
              {count}
            </span>
          </div>
        }
      />
      <UnpinButton thread={thread} beside />
    </>
  );
}

/**
 * A thread row: a link named by its title, indented under its project. A main with sub-threads
 * takes `fold`, with how many it holds, and becomes a {@link FoldableMainRow} instead; a child
 * shows a branch icon before its title, one step further in than its main. A pin, a clock or a
 * closed filebox hangs in the left gutter of a pinned, snoozed or archived thread's row, so its
 * title starts where every other does, and an archived one is dimmed until it is the one open
 * (ADR-127 to ADR-129).
 */
export function ThreadRow({
  thread,
  active,
  kind,
  fold,
}: {
  thread: ThreadSummary;
  active: boolean;
  kind: "main" | "child";
  fold?: { open: boolean; count: number; onToggle: () => void };
}): ReactElement {
  const { pathTo } = usePaths();
  if (fold) {
    return (
      <FoldableMainRow
        thread={thread}
        active={active}
        open={fold.open}
        count={fold.count}
        onToggle={fold.onToggle}
      />
    );
  }
  const look = rowLook(thread);
  return (
    <>
      <Named
        name={look.tooltip}
        always={look.alwaysTip}
        row={
          <SidebarMenuButton
            render={<Link to={pathTo(thread.id)} />}
            isActive={active}
            aria-current={active ? "page" : undefined}
            data-thread={kind}
            className={`${THREAD_ROW} ${NO_ACTION} ${look.ink} data-active:text-ink`}
          >
            {kind === "child" && <ChildIcon />}
            <RowWords thread={thread} look={look} />
          </SidebarMenuButton>
        }
      />
      <UnpinButton thread={thread} />
    </>
  );
}

/**
 * The project's own row, the label of the group below it: "name >" folded; open, no chevron at
 * rest and a down chevron while the pointer is on the row.
 */
export function ProjectButton({
  name,
  open,
  onToggle,
}: {
  name: string;
  open: boolean;
  onToggle: () => void;
}): ReactElement {
  const label = useLabelCut();
  return (
    <Named
      name={name}
      row={
        <SidebarMenuButton
          aria-expanded={open}
          className={`${ROW} group/fold text-ink`}
          onClick={onToggle}
        >
          <span ref={label} data-label="" className="min-w-0 overflow-hidden whitespace-nowrap">
            {name}
          </span>
          <FoldChevron open={open} />
        </SidebarMenuButton>
      }
    />
  );
}
