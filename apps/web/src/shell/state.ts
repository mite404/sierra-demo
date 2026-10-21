import {
  latestMain,
  threadIdSchema,
  lanesOf,
  type Located,
  type ThreadId,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import { z } from "zod";
import { pageAddressSchema, START_PAGE, type PageAddress } from "./browser";

/** What a browser pane's controls ask for; reload is not a step, it only draws the page again. */
export type BrowserStep = { kind: "go"; to: PageAddress } | { kind: "back" } | { kind: "forward" };

/** The thread pane's share of a workspace's width, in percent: its floor, ceiling and default. */
export const SPLIT = { min: 28, max: 80, initial: 52 } as const;

// Pages kept on each side of the current one; a long session cannot grow the document forever.
const HISTORY_LIMIT = 50;

const paneSchema = z.enum(["thread", "browser", "canvas"]);

// One page with its history, as a zipper: an index out of range cannot be written.
const browserSchema = z.object({
  back: z.array(pageAddressSchema).max(HISTORY_LIMIT),
  current: pageAddressSchema,
  forward: z.array(pageAddressSchema).max(HISTORY_LIMIT),
});

// One main thread's view: what sits beside the thread, the split, and the browser's page.
const viewSchema = z.object({
  pane: paneSchema,
  split: z.number().min(SPLIT.min).max(SPLIT.max),
  browser: browserSchema,
});

// The document the page saves whole (the runtime keeps it as opaque JSON). `tabs` are open main
// threads, left to right; `views` outlive their tab, so a reopened thread comes back the same;
// `read` holds the notifications seen.
const shellSchema = z.object({
  version: z.literal(1),
  tabs: z.array(threadIdSchema),
  views: z.record(threadIdSchema, viewSchema),
  read: z.array(z.string()),
});

/** What sits right of the thread: nothing, the simulated browser, or the compose canvas. */
export type PaneKind = z.infer<typeof paneSchema>;
/** A browser pane's page and its history either side. */
export type BrowserState = z.infer<typeof browserSchema>;
/** One main thread's view: its pane, its split, its browser. */
export type View = z.infer<typeof viewSchema>;
/** The shell's saved document; the page is its only writer. */
export type ShellState = z.infer<typeof shellSchema>;

const FRESH_BROWSER: BrowserState = { back: [], current: START_PAGE, forward: [] };
const DEFAULT_VIEW: View = { pane: "thread", split: SPLIT.initial, browser: FRESH_BROWSER };

function isMain(ws: Workspace, id: string): boolean {
  return ws.threads.some((thread) => thread.id === id && thread.place.kind === "main");
}

// The main a thread belongs to: itself for a main, its parent for a child.
function mainOf(thread: Workspace["threads"][number]): ThreadId {
  return thread.place.kind === "main" ? thread.id : thread.place.parentId;
}

function withView(state: ShellState, main: ThreadId, view: View): ShellState {
  return { ...state, views: { ...state.views, [main]: view } };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** A main thread's view, or the default for one never shown: the thread alone. */
export function viewOf(state: ShellState, main: ThreadId): View {
  return new Map(Object.entries(state.views)).get(main) ?? DEFAULT_VIEW;
}

/**
 * The first document on a device or in a scenario with none saved: the main with the newest
 * activity, open on the thread pane with the canvas hidden, so a first visit to an empty
 * thread shows its welcome.
 */
export function firstRun(ws: Workspace): ShellState {
  const main = latestMain(ws);
  if (main === undefined) return { version: 1, tabs: [], views: {}, read: [] };
  return { version: 1, tabs: [main], views: { [main]: DEFAULT_VIEW }, read: [] };
}

/**
 * The document without what the workspace no longer has: tabs that are gone, repeated or not a
 * main, views of threads that are gone, and read marks for notifications that are gone. The
 * same object when there is nothing to drop.
 */
export function prune(state: ShellState, ws: Workspace): ShellState {
  const tabs = [...new Set(state.tabs)].filter((id) => isMain(ws, id));
  const views = Object.fromEntries(Object.entries(state.views).filter(([id]) => isMain(ws, id)));
  const notified = new Set(ws.notifications.map((each) => each.id));
  const read = state.read.filter((id) => notified.has(id));
  const unchanged =
    sameIds(tabs, state.tabs) &&
    sameIds(Object.keys(views), Object.keys(state.views)) &&
    sameIds(read, state.read);
  return unchanged ? state : { ...state, tabs, views, read };
}

/**
 * Reads the document the page last saved. Nothing saved, or anything the schema refuses, gives
 * `firstRun`: a bad document costs the tabs, never the app. Past here nothing checks it again.
 */
export function parseShell(saved: unknown, ws: Workspace): ShellState {
  if (saved === null) return firstRun(ws);
  const parsed = shellSchema.safeParse(saved); // → ShellState, or why it is not one
  return parsed.success ? prune(parsed.data, ws) : firstRun(ws);
}

/**
 * Opening a thread: its main gets a tab at the end if it has none, and a child forces its main
 * onto the canvas, the only place a child shows. The same object when nothing changes, so
 * render can derive it and an effect can save it, as often as either runs.
 */
export function visit(state: ShellState, at: Located): ShellState {
  const tabbed = state.tabs.includes(at.main)
    ? state
    : { ...state, tabs: [...state.tabs, at.main] };
  const view = viewOf(tabbed, at.main);
  if (at.focus === null || view.pane === "canvas") return tabbed;
  return withView(tabbed, at.main, { ...view, pane: "canvas" });
}

/**
 * The document to save when the workspace holds a different one (nothing saved yet, or a
 * thread gone since), else null.
 */
export function unsaved(saved: ShellState | null, ws: Workspace | null): ShellState | null {
  if (saved === null || ws === null) return null;
  return JSON.stringify(saved) === JSON.stringify(ws.shell) ? null : saved;
}

/**
 * Whether showing `pane` beside `main` takes the page off the child its address names; a child
 * shows only on its main's canvas, so the page goes to the main instead.
 */
export function leavesChild(at: Located | null, main: ThreadId, pane: PaneKind): boolean {
  return pane !== "canvas" && at?.main === main && at.focus !== null;
}

/**
 * Closes a tab, keeping its view for when it opens again. `next` is where the page goes if the
 * closed tab was on screen: its right neighbour, else its left, else null for home.
 */
export function closeTab(
  state: ShellState,
  main: ThreadId,
): { state: ShellState; next: ThreadId | null } {
  const at = state.tabs.indexOf(main);
  if (at === -1) return { state, next: null };
  const tabs = state.tabs.filter((id) => id !== main);
  return { state: { ...state, tabs }, next: tabs.at(at) ?? tabs.at(at - 1) ?? null };
}

/**
 * Where the page goes when a thread it may show is deleted (ADR-130): a main's tab closes, and
 * if it was on screen the page goes where `closeTab` says; a child in focus gives way to its
 * main; otherwise `next` is undefined and the page stays where it is.
 */
export function awayFrom(
  state: ShellState,
  at: Located | null,
  id: ThreadId,
): { state: ShellState; next: ThreadId | null | undefined } {
  const closed = closeTab(state, id);
  if (at?.main === id) return closed;
  return { state: closed.state, next: at?.focus === id ? at.main : undefined };
}

/** Shows `pane` beside a main thread. */
export function setPane(state: ShellState, main: ThreadId, pane: PaneKind): ShellState {
  const view = viewOf(state, main);
  return view.pane === pane ? state : withView(state, main, { ...view, pane });
}

/** Keeps where the divider was left, within the thread pane's floor and ceiling. */
export function setSplit(state: ShellState, main: ThreadId, split: number): ShellState {
  const view = viewOf(state, main);
  const kept = Math.min(Math.max(split, SPLIT.min), SPLIT.max);
  return view.split === kept ? state : withView(state, main, { ...view, split: kept });
}

/**
 * One step of the zipper. Going somewhere pushes the current page onto `back` (the oldest
 * falls off past the limit) and clears `forward`; going where it already is changes nothing,
 * and so does back or forward with nothing there.
 */
export function stepBrowser(browser: BrowserState, step: BrowserStep): BrowserState {
  const { back, current, forward } = browser;
  switch (step.kind) {
    case "go":
      if (step.to === current) return browser;
      return { back: [...back, current].slice(-HISTORY_LIMIT), current: step.to, forward: [] };
    case "back": {
      const previous = back.at(-1);
      if (previous === undefined) return browser;
      return { back: back.slice(0, -1), current: previous, forward: [current, ...forward] };
    }
    case "forward": {
      const following = forward.at(0);
      if (following === undefined) return browser;
      return { back: [...back, current], current: following, forward: forward.slice(1) };
    }
    default: {
      const unhandled: never = step;
      return unhandled;
    }
  }
}

/** A main thread's browser after one step. */
export function browse(state: ShellState, main: ThreadId, step: BrowserStep): ShellState {
  const view = viewOf(state, main);
  const browser = stepBrowser(view.browser, step);
  return browser === view.browser ? state : withView(state, main, { ...view, browser });
}

/** Marks notifications seen. */
export function markRead(state: ShellState, ids: string[]): ShellState {
  const fresh = ids.filter((id) => !state.read.includes(id));
  return fresh.length === 0 ? state : { ...state, read: [...state.read, ...fresh] };
}

/** How many notifications the bell has not shown yet. */
export function unreadCount(state: ShellState, ws: Workspace): number {
  return ws.notifications.filter((each) => !state.read.includes(each.id)).length;
}

/** The bell's badge: the count, "9+" past nine, nothing at zero. */
export function badgeText(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? "9+" : String(unread);
}

/**
 * Where "/" goes: the tab on screen last in this visit while it is still open, else the open
 * tab with the newest activity in it or its children, else nowhere ("Nothing open").
 */
export function resume(
  state: ShellState,
  ws: Workspace,
  lastShown: ThreadId | null,
): ThreadId | null {
  if (lastShown !== null && state.tabs.includes(lastShown)) return lastShown;
  const open = { ...ws, threads: ws.threads.filter((each) => state.tabs.includes(mainOf(each))) };
  return latestMain(open) ?? null;
}

/**
 * The main a project opens on: its main with the newest activity in it or its children, as
 * `latestMain` ranks them; undefined for a project with no main.
 */
export function entryOf(ws: Workspace, projectId: string): ThreadId | undefined {
  const inProject = (thread: ThreadSummary) =>
    thread.place.kind === "child" || thread.place.projectId === projectId;
  return latestMain({ ...ws, threads: ws.threads.filter(inProject) });
}

/** The thread the address names and its project's name, as the phone's bar shows them. */
export type OnScreen = { name: string | null; thread: ThreadSummary | null };

/**
 * What the phone bar's "⋯" and project name act on (ADR-116, ADR-126): the thread the address
 * names (a child in focus, else its main) and its main's project; nulls with nothing on screen
 * or a thread the workspace lacks.
 */
export function onScreen(ws: Workspace, at: Located | null): OnScreen {
  const byId = new Map(ws.threads.map((each) => [each.id, each] as const));
  const main = at === null ? undefined : byId.get(at.main); // → ThreadSummary | undefined
  const thread = at === null || at.focus === null ? main : byId.get(at.focus);
  const projectId = main?.place.kind === "main" ? main.place.projectId : undefined;
  const project = ws.projects.find((each) => each.id === projectId); // → Project | undefined
  return thread === undefined
    ? { name: null, thread: null }
    : { name: project?.name ?? null, thread };
}

/**
 * What Collapse all offers for the thread on screen (ADR-134): to collapse its canvas's lanes
 * while any is open, and to expand them once all are collapsed.
 */
export type FoldOffer = { main: ThreadId; collapse: boolean };

/** Collapse all's offer, or null while the canvas is off screen or holds no lanes. */
export function foldOffer(ws: Workspace, state: ShellState, at: Located | null): FoldOffer | null {
  if (at === null || viewOf(state, at.main).pane !== "canvas") return null;
  const lanes = lanesOf(ws, at.main);
  if (lanes.length === 0) return null;
  return { main: at.main, collapse: lanes.some((lane) => !lane.collapsed) };
}
