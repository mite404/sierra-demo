import { lanesOf, type Lane, type Runtime, type ThreadId } from "@yaklabs/runtime";
import { inBackground } from "../runtime";

/**
 * Sets the main thread's lanes to `edit` of the lanes the runtime holds right now, so two quick
 * edits build on each other instead of on the lanes a render saw. An edit that returns the same
 * lanes sends nothing.
 */
export function arrangeFrom(
  runtime: Runtime,
  main: ThreadId,
  edit: (lanes: Lane[]) => Lane[],
): void {
  const now = runtime.state();
  if (now.kind !== "ready") return;
  const before = lanesOf(now.workspace, main);
  const after = edit(before);
  if (after !== before) inBackground(runtime.arrange(main, after), "Arranging the canvas");
}
