import {
  locate,
  type Located,
  type Runtime,
  type Session,
  type RuntimeState,
  type Source,
  type ThreadId,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useNavigation, type Location } from "react-router";
import { env } from "../env";
import { inBackground, usePaths, useRuntimeState, useStartedRuntime } from "../runtime";
import { useSession } from "../session";
import type { ShareClient } from "./share-thread";
import { parseShell, resume, unreadCount, unsaved, visit, type ShellState } from "./state";
import { edit, verbs, type Go, type ShellVerbs } from "./verbs";

/**
 * The shell once the runtime is ready: the snapshot, the saved document with the URL's thread
 * visited, and the verbs that change what the shell shows. Every part of the frame reads it.
 */
export type Shell = ShellVerbs & {
  source: Source;
  workspace: Workspace;
  doc: ShellState;
  /** The URL's thread; null on "/", on /lab, and for a thread the workspace lacks. */
  active: Located | null;
  /** This visit to the URL: a new key for each navigation, a second click on its link included. */
  visitKey: string;
  /** The open main threads, left to right. */
  tabs: ThreadSummary[];
  /** Where "/" goes, or null when nothing is open. */
  resumeTo: ThreadId | null;
  unread: number;
  /** The thread whose snooze card is open, if any (ADR-128). */
  snoozing: ThreadId | null;
  /** The thread whose share permissions dialog is open, if any (ADR-131). */
  sharePermissions: ThreadId | null;
};

// The runtime's state once it is ready: its source and its workspace.
type Ready = Extract<RuntimeState, { kind: "ready" }>;

// The dialogs and cards a menu can ask the window to open, each for one thread at a time.
type Asks = {
  snoozing: ThreadId | null;
  setSnoozing: (id: ThreadId | null) => void;
  sharePermissions: ThreadId | null;
  setSharePermissions: (id: ThreadId | null) => void;
};

// What the shell is built from on each render.
type Parts = {
  runtime: Runtime;
  ready: Ready;
  saved: ShellState;
  active: Located | null;
  visitKey: string;
  go: Go;
  lastShown: ThreadId | null;
  href: (id: ThreadId) => string;
  asks: Asks;
  session: Session | undefined;
};

const ShellContext = createContext<Shell | null>(null);

// How the page makes a thread public (ADR-131): the gateway this build names, the visitor's
// token when the build signs in, the worker's turns, and the device's record of each share.
function shareClientFor(runtime: Runtime, session: Session | undefined): ShareClient {
  return {
    base: env.shareBase,
    now: () => new Date(),
    token: () => session?.getAccessToken(),
    turns: (thread) => runtime.open(thread.id),
    keep: (share) => runtime.share(share),
    fetch: (input, init) => fetch(input, init),
  };
}

// Where a thread the address names sits in the runtime's workspace as it stands now.
function locateNow(runtime: Runtime, named: string | undefined): Located | undefined {
  const state = runtime.state();
  if (named === undefined || state.kind !== "ready") return undefined;
  return locate(state.workspace, named);
}

// The URL's thread in the workspace on screen, or null.
function activeIn(ws: Workspace | null, named: string | undefined): Located | null {
  if (ws === null || named === undefined) return null;
  return locate(ws, named) ?? null;
}

// The shell the frame reads: the document with the URL's thread visited, its tabs, where "/"
// goes, the unread count, and the verbs.
function shellOf(parts: Parts): Shell {
  const { runtime, ready, saved, active, visitKey, go, lastShown, href, asks, session } = parts;
  const { snoozing, setSnoozing, sharePermissions, setSharePermissions } = asks;
  const shareClient = shareClientFor(runtime, session);
  const { workspace, source } = ready;
  const doc = active === null ? saved : visit(saved, active);
  const byId = new Map(workspace.threads.map((thread) => [thread.id, thread] as const));
  return {
    source,
    workspace,
    doc,
    active,
    visitKey,
    tabs: doc.tabs.flatMap((id) => byId.get(id) ?? []),
    resumeTo: resume(doc, workspace, lastShown),
    unread: unreadCount(doc, workspace),
    snoozing,
    sharePermissions,
    ...verbs(
      { runtime, workspace, active, go, href, setSnoozing, setSharePermissions, shareClient },
      doc,
    ),
  };
}

// Which thread the snooze card and the share permissions dialog are open for, if either.
function useAsks(): Asks {
  const [snoozing, setSnoozing] = useState<ThreadId | null>(null);
  const [sharePermissions, setSharePermissions] = useState<ThreadId | null>(null);
  return useMemo(
    () => ({ snoozing, setSnoozing, sharePermissions, setSharePermissions }),
    [snoozing, sharePermissions],
  );
}

// The address, or the one it is on its way to: a navigation in flight counts at once, so a tab
// switch shows in the same frame as the click rather than when the router has finished its own
// asynchronous steps. The router later commits that same location, key and all.
function useShownLocation(): Location {
  const pending = useNavigation().location; // → Location | undefined
  const current = useLocation();
  return pending ?? current;
}

// Goes to a thread, or home, keeping the scenario. It navigates with flushSync, so a tab switch
// shows the tab in the same frame as the click, never a transition later.
function useGo(): Go {
  const navigate = useNavigate();
  const { pathTo, hrefTo } = usePaths();
  return useCallback(
    (to: ThreadId | null) => {
      void navigate(to === null ? hrefTo("/") : pathTo(to), { flushSync: true });
    },
    [navigate, pathTo, hrefTo],
  );
}

/**
 * A thread's address as a whole URL, its scenario kept: what Copy thread URL puts on the
 * clipboard (ADR-126), and what the share dialog shows.
 */
export function useHref(): (id: ThreadId) => string {
  const { pathTo } = usePaths();
  return useCallback((id: ThreadId) => new URL(pathTo(id), window.location.href).href, [pathTo]);
}

// The main thread last on screen in this visit, which "/" resumes while its tab is open.
function useLastShown(active: Located | null): ThreadId | null {
  const [lastShown, setLastShown] = useState<ThreadId | null>(null);
  if (active !== null && active.main !== lastShown) setLastShown(active.main);
  return lastShown;
}

// Keeps the runtime's document in step with the page: the canonical one whenever it differs
// (nothing saved yet, or a thread gone), and a visit each time the address names a new thread
// or the workspace first arrives. Only those visit: a state push must not re-add a tab closed
// a moment ago while the address still names it on its way to the neighbour.
function useKeepShell(
  runtime: Runtime | null,
  ws: Workspace | null,
  saved: ShellState | null,
  named: string | undefined,
): void {
  useEffect(() => {
    const stale = unsaved(saved, ws);
    if (runtime !== null && stale !== null) {
      inBackground(runtime.saveShell(stale), "Keeping your tabs");
    }
  }, [runtime, ws, saved]);

  const isReady = ws !== null;
  useEffect(() => {
    if (runtime === null || !isReady) return;
    const at = locateNow(runtime, named);
    if (at !== undefined) edit(runtime, at, (current) => visit(current, at));
  }, [runtime, isReady, named]);
}

/**
 * Provides the shell to the frame and the routes: the document with the URL's thread visited
 * in render, so what shows never waits for the save, and the verbs that change it. A tab
 * appears once per thread, and a child's main turns to its canvas.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const state = useRuntimeState();
  const runtime = useStartedRuntime();
  const shown = useShownLocation();
  const { threadIdOf } = usePaths();
  const named = threadIdOf(shown.pathname); // → the address's thread id, or undefined
  const go = useGo();
  const ws = state.kind === "ready" ? state.workspace : null;
  const saved = useMemo(() => (ws === null ? null : parseShell(ws.shell, ws)), [ws]);
  const active = useMemo(() => activeIn(ws, named), [ws, named]);
  const lastShown = useLastShown(active);
  const href = useHref();
  const asks = useAsks();
  const session = useSession();
  useKeepShell(runtime, ws, saved, named);

  const shell = useMemo(
    () =>
      state.kind === "ready" && runtime !== null && saved !== null
        ? shellOf({
            runtime,
            ready: state,
            saved,
            active,
            visitKey: shown.key,
            go,
            lastShown,
            href,
            asks,
            session,
          })
        : null,
    [state, runtime, saved, active, shown.key, go, lastShown, href, asks, session],
  );
  return <ShellContext value={shell}>{children}</ShellContext>;
}

/** The shell, or null while the runtime is starting or broken. */
export function useShell(): Shell | null {
  return useContext(ShellContext);
}
