import type { SharedCard } from "@yaklabs/catalog/share";
import { z } from "zod";
import { markOrder } from "./marks";

const idSchema = z.string().min(1);
const instantSchema = z.iso.datetime();

/** A project's id. Only the worker mints one; anything else parses it. */
export const projectIdSchema = idSchema.brand<"ProjectId">();
/** A thread's id, main or child. Only the worker mints one; anything else parses it. */
export const threadIdSchema = idSchema.brand<"ThreadId">();
/** A lane's id: `l-<threadId>` for a thread lane, `c-...` for a card lane. */
export const laneIdSchema = idSchema.brand<"LaneId">();

/** What a main thread is called until someone names it, or its first message does. */
export const NEW_THREAD = "New thread";

/**
 * What every device holds (`ensureStarter`): the Live Playground project and its one main
 * thread, with no turns and the title an untitled main gets (`storeWrites.ts`), so the first
 * visit opens on an empty thread. Their ids never change, so an address to either holds on
 * every device, and the page finds the project its live threads go in by it.
 */
export const STARTER = {
  project: { id: projectIdSchema.parse("live-playground"), name: "Live Playground" },
  thread: { id: threadIdSchema.parse("playground"), title: NEW_THREAD },
} as const;

/** A project's id, branded so it never stands in for a thread's. */
export type ProjectId = z.infer<typeof projectIdSchema>;
/** A thread's id, branded so it never stands in for a project's or a lane's. */
export type ThreadId = z.infer<typeof threadIdSchema>;
/** A lane's id on its main thread's canvas. */
export type LaneId = z.infer<typeof laneIdSchema>;

// The catalog keeps its envelope schema private, so this one is typed against the catalog's
// type: a field the catalog adds or retypes fails to compile here.
const sharedCardSchema: z.ZodType<SharedCard> = z.object({
  v: z.literal(1),
  kind: z.enum(["catalog", "interactive"]),
  payload: z.unknown(),
});

const projectSchema = z.object({
  id: projectIdSchema,
  name: z.string().min(1),
  createdAt: instantSchema,
});

// A thread is a main in a project or a child of a main, never both; its place never changes.
const placeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("main"), projectId: projectIdSchema }),
  z.object({ kind: z.literal("child"), parentId: threadIdSchema }),
]);

const threadSummarySchema = z.object({
  id: threadIdSchema,
  title: z.string(),
  place: placeSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
  preview: z.string(),
  // how many turns it holds: 0 tells the page it opens empty, with nothing to ask the worker
  turnCount: z.number().int().nonnegative(),
  draft: z.string(),
  pinnedAt: instantSchema.nullable(), // pinned threads lead their list
  snoozedUntil: instantSchema.nullable(), // when a snoozed thread wakes, in the future
  archivedAt: instantSchema.nullable(), // archived threads settle to the bottom of their list
});

/**
 * A thread made public for a while (ADR-131): the link carries its key, so it stays on the
 * device; the revoke token takes it down before it expires.
 */
export const threadShareSchema = z.object({
  id: idSchema,
  threadId: threadIdSchema,
  link: z.url(),
  revokeToken: idSchema,
  createdAt: instantSchema,
  expiresAt: instantSchema,
});

// Null width means the default column.
const widthSchema = z.number().positive().nullable();

/**
 * One lane; a thread lane's id is always `l-<threadId>`. A collapsed lane is a slim strip that
 * keeps its width for when it opens again (ADR-133).
 */
export const laneSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: laneIdSchema,
      width: widthSchema,
      collapsed: z.boolean(),
      kind: z.literal("thread"),
      threadId: threadIdSchema,
    })
    .refine((lane) => lane.id === `l-${lane.threadId}`, "A thread lane's id is l-<threadId>"),
  z.object({
    id: laneIdSchema,
    width: widthSchema,
    collapsed: z.boolean(),
    kind: z.literal("card"),
    card: sharedCardSchema,
    title: z.string(),
  }),
]);

const notificationSchema = z.object({
  id: idSchema,
  threadId: threadIdSchema,
  text: z.string(),
  at: instantSchema,
});

/** The page's shell as the runtime keeps it: a JSON object it stores whole and never reads. */
export const shellStateSchema = z.record(z.string(), z.json());

/** Everything the sidebar, the tabs and the canvases draw from. It never carries messages. */
export const workspaceSchema = z.object({
  projects: z.array(projectSchema), // oldest first
  threads: z.array(threadSummarySchema), // oldest first
  lanes: z.record(threadIdSchema, z.array(laneSchema)), // every main, left to right
  shell: shellStateSchema.nullable(), // null until the page first saves one
  notifications: z.array(notificationSchema), // newest first
  shares: z.array(threadShareSchema), // newest first
});

/** A project: a named group of main threads. */
export type Project = z.infer<typeof projectSchema>;
/** Where a thread sits: a main in a project, or a child of a main (one level deep). */
export type Place = z.infer<typeof placeSchema>;
/** One thread as the sidebar sees it; `draft` is the opening a dropped highlight left. */
export type ThreadSummary = z.infer<typeof threadSummarySchema>;
/** One column on a main thread's canvas: a child thread, or a card opened large. */
export type Lane = z.infer<typeof laneSchema>;
/** One thread made public until `expiresAt`. */
export type ThreadShare = z.infer<typeof threadShareSchema>;
/** Something for the bell. */
export type Notification = z.infer<typeof notificationSchema>;
/** The page's shell state, opaque to the runtime; the page parses it with its own schema. */
export type ShellState = z.infer<typeof shellStateSchema>;
/** The whole snapshot the worker pushes after every write. */
export type Workspace = z.infer<typeof workspaceSchema>;
/** Where an id sits: its main thread, and the child to bring into view, if it is one. */
export type Located = { main: ThreadId; focus: ThreadId | null };
/** A main thread with its children, in the order the sidebar lists them. */
export type MainNode = { main: ThreadSummary; children: ThreadSummary[] };
/** A project with its main threads, newest created first. */
export type ProjectNode = { project: Project; mains: MainNode[] };

const TITLE_LENGTH = 48;

// Oldest first; the id breaks ties so the order never depends on insertion.
function byCreated(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

// Newest first, the reverse of `byCreated`.
function newestCreated(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) {
  return byCreated(b, a);
}

// An index in 0..length; one off either end lands at that end, and NaN lands at the end.
function clampIndex(at: number, length: number): number {
  if (Number.isNaN(at)) return length;
  return Math.min(Math.max(Math.trunc(at), 0), length);
}

function parentOf(thread: ThreadSummary): ThreadId | undefined {
  return thread.place.kind === "child" ? thread.place.parentId : undefined;
}

// The newest instant among a main and its children: when anything last happened there.
function activityOf(ws: Workspace, main: ThreadSummary): string {
  return ws.threads
    .filter((thread) => parentOf(thread) === main.id)
    .reduce(
      (latest, child) => (child.updatedAt > latest ? child.updatedAt : latest),
      main.updatedAt,
    );
}

/** Twelve random hex digits: the tail of every id minted on the device. */
export function randomSuffix(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

/** The id a thread's lane always has. */
export function threadLaneId(threadId: ThreadId): LaneId {
  return laneIdSchema.parse(`l-${threadId}`);
}

/** A thread's lane at the default width, expanded. */
export function threadLane(threadId: ThreadId): Lane {
  return { id: threadLaneId(threadId), width: null, collapsed: false, kind: "thread", threadId };
}

/** A fresh id for a card lane the page opens. */
export function newCardLaneId(): LaneId {
  return laneIdSchema.parse(`c-${randomSuffix()}`);
}

/** A main thread's canvas, left to right; none for an id that is not a main. */
export function lanesOf(ws: Workspace, mainId: ThreadId): Lane[] {
  return new Map(Object.entries(ws.lanes)).get(mainId) ?? [];
}

/** `lane` placed at `at` (clamped to the ends), moved there if the list already holds it. */
export function insertLane(lanes: Lane[], at: number, lane: Lane): Lane[] {
  const rest = lanes.filter((each) => each.id !== lane.id);
  const index = clampIndex(at, rest.length);
  return [...rest.slice(0, index), lane, ...rest.slice(index)];
}

/** The lane `id` moved to `to` (clamped to the ends); the same lanes when it is not there. */
export function moveLane(lanes: Lane[], id: LaneId, to: number): Lane[] {
  const lane = lanes.find((each) => each.id === id);
  return lane === undefined ? lanes : insertLane(lanes, to, lane);
}

/** The lanes without `id`. A closed thread lane is an absent one; the child stays. */
export function closeLane(lanes: Lane[], id: LaneId): Lane[] {
  return lanes.filter((lane) => lane.id !== id);
}

/**
 * A child's lane opened at the default width where the sidebar lists the child among the open
 * children (top to bottom is left to right, Ethan): before the first open child the sidebar
 * lists after it, else at the end. A child already open stays where it is, so a lane the reader
 * moved keeps their order; the sidebar never follows the canvas (ADR-125).
 * @param order The main's children as the sidebar lists them (`childrenOf`).
 */
export function openChildLane(
  lanes: Lane[],
  threadId: ThreadId,
  order: readonly ThreadId[],
): Lane[] {
  const id = threadLaneId(threadId);
  if (lanes.some((lane) => lane.id === id)) return lanes;
  const rank = order.indexOf(threadId);
  const after = (lane: Lane) => lane.kind === "thread" && order.indexOf(lane.threadId) > rank;
  const at = rank === -1 ? -1 : lanes.findIndex((lane) => after(lane)); // → the first lane listed after it
  return insertLane(lanes, at === -1 ? lanes.length : at, threadLane(threadId));
}

// Where a lane from `current` goes in `merged`: after the nearest lane left of it that `merged`
// holds, else before the nearest such lane right of it, else at the end.
function anchorIndex(merged: Lane[], current: Lane[], index: number): number {
  const positions = current.map((lane) => merged.findIndex((each) => each.id === lane.id));
  const left = positions.slice(0, index).findLast((at) => at >= 0);
  if (left !== undefined) return left + 1;
  return positions.slice(index + 1).find((at) => at >= 0) ?? merged.length;
}

/**
 * The page's `lanes` for a main, merged with the canvas as it is now: a lane in `current` the
 * page never saw (its id in neither `base` nor `lanes`, say a child created meanwhile) stays,
 * beside the neighbour it has now; a lane in `base` that `lanes` left out stays closed.
 * @param base The lane ids the page's `lanes` were edited from.
 */
export function mergeLanes(current: Lane[], base: LaneId[], lanes: Lane[]): Lane[] {
  const seen = new Set<string>([...base, ...lanes.map((lane) => lane.id)]);
  return current.reduce(
    (merged, lane, index) =>
      seen.has(lane.id) ? merged : insertLane(merged, anchorIndex(merged, current, index), lane),
    lanes,
  );
}

/** The lane `id` at `width` px; null puts it back to the default column. */
export function resizeLane(lanes: Lane[], id: LaneId, width: number | null): Lane[] {
  return lanes.map((lane) => (lane.id === id ? { ...lane, width } : lane));
}

/** The lane `id` collapsed to its strip, or expanded again at the width it had (ADR-133). */
export function collapseLane(lanes: Lane[], id: LaneId, collapsed: boolean): Lane[] {
  return lanes.map((lane) => (lane.id === id ? { ...lane, collapsed } : lane));
}

/** Every lane collapsed to its strip, or every lane expanded, in the same order (ADR-133). */
export function collapseLanes(lanes: Lane[], collapsed: boolean): Lane[] {
  return lanes.map((lane) => ({ ...lane, collapsed }));
}

/**
 * The sidebar's tree: projects oldest first, each with its mains newest created first, and each
 * main's children newest created first too. Only creation orders it, never the canvas or
 * activity, so a row stays under the pointer that opens it (ADR-125). In each list the pinned
 * lead and the archived settle to the bottom, keeping that order among themselves; a snoozed
 * thread stays where it is (ADR-127, ADR-129).
 */
/**
 * Threads in the order the sidebar lists them, top to bottom: newest created first, ties by id
 * (ADR-125). The canvas opens a main's child lanes in this order too.
 */
export function inSidebarOrder<T extends { createdAt: string; id: string }>(threads: T[]): T[] {
  return threads.toSorted(newestCreated);
}

/** A main's children as the sidebar lists them, top to bottom (`inSidebarOrder`). */
export function childrenOf(ws: Workspace, mainId: ThreadId): ThreadSummary[] {
  return inSidebarOrder(ws.threads.filter((thread) => parentOf(thread) === mainId));
}

export function sidebarTree(ws: Workspace): ProjectNode[] {
  const children = (main: ThreadSummary): ThreadSummary[] => markOrder(childrenOf(ws, main.id));
  return ws.projects.toSorted(byCreated).map((project) => ({
    project,
    mains: markOrder(
      ws.threads
        .filter((thread) => thread.place.kind === "main" && thread.place.projectId === project.id)
        .toSorted(newestCreated),
    ).map((main) => ({ main, children: children(main) })),
  }));
}

/** The main thread an id opens, with the child to focus; undefined for an unknown id. */
export function locate(ws: Workspace, id: string): Located | undefined {
  const thread = ws.threads.find((each) => each.id === id);
  if (thread === undefined) return undefined;
  return thread.place.kind === "main"
    ? { main: thread.id, focus: null }
    : { main: thread.place.parentId, focus: thread.id };
}

/** The main thread with the newest activity in it or its children; undefined with none. */
export function latestMain(ws: Workspace): ThreadId | undefined {
  const ranked = ws.threads
    .filter((thread) => thread.place.kind === "main")
    .map((main) => ({ id: main.id, at: activityOf(ws, main) })) // → { id, at }[]
    .toSorted((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  return ranked.at(0)?.id;
}

/** A thread title from a highlight: its first line, cut at a word to fit a lane's header. */
export function titleFor(text: string): string {
  const line = text.replaceAll(/\s+/g, " ").trim();
  if (line.length <= TITLE_LENGTH) return line;
  const cut = line.slice(0, TITLE_LENGTH);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > TITLE_LENGTH / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

/** The highlight as the opening draft: quoted, with room beneath it to ask. */
export function quoteFor(text: string): string {
  const quoted = text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `${quoted}\n\n`;
}
