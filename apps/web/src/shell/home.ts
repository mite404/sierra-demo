import {
  STARTER,
  type ProjectId,
  type ThreadId,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";

/**
 * Where a new thread goes when nothing names a project: the Live Playground, which the live
 * model answers (ADR-156), rather than whichever project the sidebar lists first, which may be
 * the scripted Demo's; undefined on a source with no Live Playground (a scenario).
 */
export function liveProjectOf(ws: Workspace): ProjectId | undefined {
  return ws.projects.find((project) => project.id === STARTER.project.id)?.id;
}

// A Live Playground main with nothing in it yet, and in sight: not archived or snoozed.
const isBlankLive = (thread: ThreadSummary): boolean =>
  thread.place.kind === "main" &&
  thread.place.projectId === STARTER.project.id &&
  thread.turnCount === 0 &&
  thread.archivedAt === null &&
  thread.snoozedUntil === null;

/**
 * The thread Home opens on, a first visit's page (Ethan): a blank Live Playground main, so its
 * welcome shows and whatever is typed there goes to the live model. The starter first, else the
 * newest made; undefined when the Live Playground has no blank main.
 */
export function blankHomeOf(ws: Workspace): ThreadId | undefined {
  const blank = ws.threads.filter(isBlankLive); // → ThreadSummary[]
  const starter = blank.find((thread) => thread.id === STARTER.thread.id);
  const newest = blank.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).at(0);
  return (starter ?? newest)?.id;
}

/** Where "/" takes the page: to a thread, to a new thread in a project, or nowhere. */
export type HomeTarget =
  | { kind: "go"; to: ThreadId }
  | { kind: "start"; in: ProjectId }
  | { kind: "none" };

/**
 * Where "/" takes the page. A plain visit resumes the tab last on screen (`resume`); Home's
 * request, or a visit with nothing to resume, opens a first visit's page instead: the Live
 * Playground's blank main, else a new one there. Home on a source with no Live Playground
 * resumes; with nothing to resume either, it is nowhere ("Nothing open").
 */
export function homeTarget(ws: Workspace, resumeTo: ThreadId | null, asked: boolean): HomeTarget {
  if (!asked && resumeTo !== null) return { kind: "go", to: resumeTo };
  const blank = blankHomeOf(ws);
  if (blank !== undefined) return { kind: "go", to: blank };
  const live = liveProjectOf(ws);
  if (live !== undefined) return { kind: "start", in: live };
  return resumeTo === null ? { kind: "none" } : { kind: "go", to: resumeTo };
}
