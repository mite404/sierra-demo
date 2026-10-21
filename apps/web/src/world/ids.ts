import { threadIdSchema, type ProjectId, type ThreadId } from "@yaklabs/runtime";
import { z } from "zod";

// The runtime package keeps its project schema private; this is the same zod brand.
const projectIdSchema = z.string().min(1).brand<"ProjectId">();

// Every id the Demo makes starts here, so none is ever one the device's worker minted.
const PREFIX = "demo";

/**
 * The only place the Demo mints an id. The ids its world declares are the same on every load
 * (`demo-brief`, `demo-brief-workload`), so an address stays good across a reload and a
 * Restart; what the visitor makes counts up (`demo-new-t1`).
 */
export const ids = {
  /** The Demo's own project. */
  project: projectIdSchema.parse(PREFIX),
  /** A scripted main thread, named by its script: `demo-<script id>`. */
  show: (scriptId: string): ThreadId => threadIdSchema.parse(`${PREFIX}-${scriptId}`),
  /** A child a scripted main's work spawns, by the script's name for it: `<main>-<local>`. */
  child: (main: ThreadId, local: string): ThreadId => threadIdSchema.parse(`${main}-${local}`),
  /** The `n`th thread the visitor makes in the Demo. */
  freshThread: (n: number): ThreadId => threadIdSchema.parse(`${PREFIX}-new-t${n}`),
  /** The `n`th project the visitor makes in the Demo. */
  freshProject: (n: number): ProjectId => projectIdSchema.parse(`${PREFIX}-new-p${n}`),
  /** The `n`th note the Demo leaves for the bell. */
  note: (n: number): string => `${PREFIX}-note-${n}`,
};
