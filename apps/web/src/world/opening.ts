import type { ThreadMessage } from "@yaklabs/catalog/thread";
import {
  inSidebarOrder,
  openChildLane,
  type Lane,
  type ProjectId,
  type ThreadId,
} from "@yaklabs/runtime";
import { openedRun } from "../demo/replies";
import type { Script } from "../demo/script";
import { summary, touched, type Slice } from "./edits";
import { ids } from "./ids";
import type { ChildOf } from "./spec";

// The children an opened run made, as workspace threads under `main`, with their lanes in the
// sidebar's order: newest first, so top to bottom there is left to right on the canvas.
function openedChildren(
  main: ThreadId,
  children: Map<ChildOf, ThreadMessage[]>,
  at: string,
): Pick<Slice, "threads" | "lanes"> {
  const place = { kind: "child", parentId: main } as const;
  const made = [...children].map(([child, turns]) =>
    touched(turns, at)(summary({ id: child.id, title: child.title, place, draft: "", at })),
  );
  const order = inSidebarOrder(made).map((thread) => thread.id); // → as the sidebar lists them
  const lanes = made.reduce<Lane[]>((each, thread) => openChildLane(each, thread.id, order), []);
  return { threads: made, lanes };
}

/**
 * The slice a script opens on at `now`: its main in `project`, made at `at`, empty, or holding
 * the run its opening records with each child that run made.
 * @throws When the opening names a child the script does not.
 */
export function openingOf(script: Script, project: ProjectId, at: string, now: number): Slice {
  const main = ids.show(script.id);
  const place = { kind: "main", projectId: project } as const;
  const bare = summary({ id: main, title: script.thread, place, draft: "", at });
  if (script.opening === undefined)
    return { main, threads: [bare], transcripts: new Map([[main, []]]), lanes: [] };
  const run = openedRun(script, script.opening, now);
  const children = openedChildren(main, run.children, at);
  const transcripts = new Map<ThreadId, ThreadMessage[]>([[main, run.main]]);
  for (const [child, turns] of run.children) transcripts.set(child.id, turns);
  return {
    main,
    threads: [touched(run.main, at)(bare), ...children.threads],
    transcripts,
    lanes: children.lanes,
  };
}
