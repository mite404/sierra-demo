import {
  threadIdSchema,
  type RuntimeState,
  type Source,
  type ThreadId,
  type Workspace,
} from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { isWorking } from "./working";

const THREAD = threadIdSchema.parse("t-1");
const OTHER = threadIdSchema.parse("t-2");

// `isWorking` reads only `replying`, never the workspace or the source, so these fixtures stay
// empty shells cast to shape.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture shell isWorking never reads
const WORKSPACE = {} as Workspace;
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture shell isWorking never reads
const SOURCE = {} as Source;

function ready(replying: ThreadId[]): RuntimeState {
  return { kind: "ready", source: SOURCE, workspace: WORKSPACE, replying };
}

describe("isWorking", () => {
  it("is true only while a thread's id sits in the runtime's live replying list", () => {
    expect(isWorking(ready([THREAD]), THREAD)).toBe(true);
    expect(isWorking(ready([OTHER]), THREAD)).toBe(false);
    expect(isWorking(ready([]), THREAD)).toBe(false);
  });

  it("is false before the runtime is ready, while held, or once broken - never a stale guess", () => {
    expect(isWorking({ kind: "starting", source: null }, THREAD)).toBe(false);
    expect(isWorking({ kind: "held", source: null }, THREAD)).toBe(false);
    expect(isWorking({ kind: "broken", source: null, reason: "worker crashed" }, THREAD)).toBe(
      false,
    );
  });
});
