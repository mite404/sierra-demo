import type { ProjectId, ThreadId } from "@yaklabs/runtime";
import type { Script } from "../demo/script";
import { ids } from "./ids";

/**
 * Who answers a thread of the overlay: its script (`S` is the `Script` as declared, the running
 * `Show` once the world is up), or the lab stand-in for every thread the spec does not name.
 * A thread is exactly one, and a new kind stops the build at every match over it.
 */
export type Seat<S> = { kind: "scripted"; script: S } | { kind: "lab" };

// One thread a world opens with: a scripted one, since the stand-in's are never declared.
export type ThreadSpec = Extract<Seat<Script>, { kind: "scripted" }>;

// One project a world opens with, its threads in sidebar order; the first is its entry.
export type ProjectSpec = {
  id: ProjectId;
  name: string;
  threads: readonly [ThreadSpec, ...ThreadSpec[]];
};

/** A world as data: its projects in sidebar order, each with its threads. */
export type WorldSpec = { projects: readonly ProjectSpec[] };

/** A child thread a script names: its workspace id, the script's name for it, and its words. */
export type ChildOf = { id: ThreadId; local: string; title: string; request: string };

// The children a script's steps name, in its replies and in the run it opens on.
function namedChildren(script: Script): string[] {
  const played = script.beats.flatMap((beat) =>
    beat.kind === "reply"
      ? beat.events.flatMap(({ chunk }) =>
          typeof chunk !== "string" && chunk.kind === "step" && chunk.step.threadId !== undefined
            ? [chunk.step.threadId]
            : [],
        )
      : [],
  );
  const opened = (script.opening?.turns ?? []).flatMap((turn) =>
    turn.role === "agent"
      ? (turn.work?.steps ?? []).flatMap((step) =>
          step.threadId === undefined ? [] : [step.threadId],
        )
      : [],
  );
  return [...played, ...opened];
}

// Every id a spec declares: its projects, its mains and their children, repeats kept.
function declaredIds(spec: WorldSpec): string[] {
  return spec.projects.flatMap((project) => [
    project.id,
    ...project.threads.flatMap(({ script }) => {
      const main = ids.show(script.id);
      return [main, ...Object.keys(script.children).map((local) => ids.child(main, local))];
    }),
  ]);
}

/** A scripted thread for a project's list. */
export function show(script: Script): ThreadSpec {
  return { kind: "scripted", script };
}

/**
 * The child `script` names `local`, with its workspace id.
 * @throws When the script declares no such child.
 */
export function childOf(script: Script, local: string): ChildOf {
  const named = new Map(Object.entries(script.children)).get(local);
  if (named === undefined) throw new Error(`The script names no child "${local}"`);
  return { id: ids.child(ids.show(script.id), local), local, ...named };
}

/** Every script a world plays, in sidebar order. */
export function scriptsOf(spec: WorldSpec): Script[] {
  return spec.projects.flatMap((project) => project.threads.map(({ script }) => script));
}

/**
 * The spec, once it is proved whole: no id is declared twice, and no script's step names a
 * child the script does not declare. Called where a world is written down, so a bad scenario
 * fails the page's first load and the first test, never a visitor's Play.
 * @throws On a duplicate id, or a step naming an undeclared child.
 */
export function worldOf(spec: WorldSpec): WorldSpec {
  const seen = new Set<string>();
  for (const id of declaredIds(spec)) {
    if (seen.has(id)) throw new Error(`The world declares "${id}" twice`);
    seen.add(id);
  }
  for (const script of scriptsOf(spec))
    for (const local of namedChildren(script)) childOf(script, local);
  return spec;
}
