import type { LegacyCanvas } from "./protocol";
import {
  projectIdSchema,
  threadIdSchema,
  threadLane,
  type Lane,
  type Place,
  type Project,
  type ThreadId,
} from "./workspace";

// The policy of the 1 → 2 step as a calculation: the rows a v1 database becomes, with no
// database in sight. `schema.ts` writes them.

/** A v1 conversation as the 1 → 2 step reads it. */
export type V1Row = { id: ThreadId; updatedAt: string };

/** The v2 rows a v1 database becomes: the whole policy of the 1 → 2 step, as data. */
export type V2Plan = {
  projects: Project[];
  threads: { id: ThreadId; createdAt: string; place: Place }[]; // mains before their children
  lanes: { mainId: ThreadId; lanes: Lane[] }[];
};

/** The project a v1 database's conversations join. */
export const DEMO_PROJECT = { id: projectIdSchema.parse("demo-store"), name: "Demo store" };
/** The main thread a v1 database's `profit` conversation becomes. */
export const PROFIT = threadIdSchema.parse("profit");

// Oldest first; the id breaks ties so the order never depends on insertion.
function byUpdated(a: V1Row, b: V1Row): number {
  return a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id);
}

// The rows in the saved order, with any it does not name after them in their own order.
function sortByOrder(rows: V1Row[], order: string[]): V1Row[] {
  const rank = new Map(order.map((id, index) => [id, index])); // → id → position
  const named = rows
    .filter((row) => rank.has(row.id))
    .toSorted((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...named, ...rows.filter((row) => !rank.has(row.id))];
}

/**
 * The v2 rows a v1 database becomes. With a `profit` conversation, it is the main thread of a
 * "Demo store" project and every other conversation is its child; the children the v1 canvas
 * did not hide become its lanes, in the v1 canvas's order, then oldest first. Without
 * `profit`, every conversation is a main of that project, with no lanes. No rows, no plan.
 */
export function planV2(rows: V1Row[], legacy: LegacyCanvas | undefined): V2Plan {
  const oldest = rows.toSorted(byUpdated);
  const first = oldest.at(0);
  if (first === undefined) return { projects: [], threads: [], lanes: [] };
  const project: Project = { ...DEMO_PROJECT, createdAt: first.updatedAt };
  const main: Place = { kind: "main", projectId: project.id };
  const profit = oldest.find((row) => row.id === PROFIT);
  if (profit === undefined) {
    const threads = oldest.map((row) => ({ id: row.id, createdAt: row.updatedAt, place: main }));
    return { projects: [project], threads, lanes: [] };
  }
  const children = oldest.filter((row) => row !== profit);
  const hidden = new Set(legacy?.hidden);
  const shown = sortByOrder(
    children.filter((row) => !hidden.has(row.id)),
    legacy?.order ?? [],
  );
  const child: Place = { kind: "child", parentId: PROFIT };
  return {
    projects: [project],
    threads: [
      { id: PROFIT, createdAt: profit.updatedAt, place: main },
      ...children.map((row) => ({ id: row.id, createdAt: row.updatedAt, place: child })),
    ],
    lanes: [{ mainId: PROFIT, lanes: shown.map((row) => threadLane(row.id)) }],
  };
}
