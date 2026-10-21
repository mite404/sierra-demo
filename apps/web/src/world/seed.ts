import type { ProjectId, Workspace } from "@yaklabs/runtime";
import { recast, type Slice } from "./edits";
import { openingOf } from "./opening";
import type { ThreadSpec, WorldSpec } from "./spec";
import { instantAt, type Seed } from "./stage";

// A declared show, the project it sits in, and the instant its main was made.
type Placed = { project: ProjectId; at: string; show: ThreadSpec };

// Every declared show with the instant its main is made: declaration order is sidebar order,
// which lists the newest first, so the first declared is made last and is its project's entry.
function placedOf(spec: WorldSpec): Placed[] {
  const shows = spec.projects.flatMap((project) =>
    project.threads.map((show) => ({ project: project.id, show })),
  );
  const last = spec.projects.length + shows.length; // → instants 0..projects-1 are the projects'
  return shows.map(({ project, show }, rank) => ({ project, show, at: instantAt(last - rank) }));
}

// The workspace a world opens on: its projects oldest first in declaration order, then each
// show's slice; the overlay keeps no shell document.
function seedFrom(spec: WorldSpec, slices: Slice[]): Seed {
  const projects = spec.projects.map((project, rank) => ({
    id: project.id,
    name: project.name,
    createdAt: instantAt(rank),
  }));
  const empty: Workspace = {
    projects,
    threads: [],
    lanes: {},
    shell: null,
    notifications: [],
    shares: [],
  };
  const workspace = slices.reduce((ws, slice) => recast(slice)(ws), empty);
  const transcripts = new Map(slices.flatMap((slice) => [...slice.transcripts]));
  return { workspace, transcripts, minted: spec.projects.length + slices.length };
}

/**
 * What a world opens on at `now`: its shows placed, and the stage's seed of their slices.
 * @throws When a show's opening names a child its script does not.
 */
export function seedOf(spec: WorldSpec, now: number): { placed: Placed[]; seed: Seed } {
  const placed = placedOf(spec);
  const slices = placed.map(({ show, project, at }) => openingOf(show.script, project, at, now));
  return { placed, seed: seedFrom(spec, slices) };
}
