import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { threadIdSchema, type RuntimeState, type ThreadId, type Workspace } from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { notified, summary, type Slice } from "./edits";
import { ids } from "./ids";
import { createStage, instantAt } from "./stage";

const id = (raw: string): ThreadId => threadIdSchema.parse(raw);

const [MAIN, CHILD, OTHER] = [id("demo-brief"), id("demo-brief-orders"), id("demo-other")];
const AT = instantAt(5);

const said = (text: string): ThreadMessage => ({ id: text, role: "user", text, time: AT });

// The brief's slice as it opens: its main alone, empty.
const SLICE: Slice = {
  main: MAIN,
  threads: [
    summary({
      id: MAIN,
      title: "Brief",
      place: { kind: "main", projectId: ids.project },
      draft: "",
      at: AT,
    }),
  ],
  transcripts: new Map([[MAIN, []]]),
  lanes: [],
};

// A stage holding the brief's main, a child the brief's work made, and another main.
function staged() {
  const place = { kind: "main", projectId: ids.project } as const;
  const workspace: Workspace = {
    projects: [{ id: ids.project, name: "Demo", createdAt: instantAt(0) }],
    threads: [
      ...SLICE.threads,
      summary({
        id: CHILD,
        title: "Orders",
        place: { kind: "child", parentId: MAIN },
        draft: "",
        at: AT,
      }),
      summary({ id: OTHER, title: "Other", place, draft: "", at: AT }),
    ],
    lanes: { [MAIN]: [] },
    shell: null,
    notifications: [],
    shares: [],
  };
  const transcripts = new Map([
    [MAIN, [said("brief")]],
    [CHILD, [said("orders")]],
    [OTHER, [said("other")]],
  ]);
  return createStage({ workspace, transcripts, minted: 10 });
}

function workspaceOf(state: RuntimeState): Workspace {
  if (state.kind !== "ready") throw new Error(`The stage is ${state.kind}`);
  return state.workspace;
}

describe("the stage's leases", () => {
  it("write while held, and nothing once a reset of their thread has run", () => {
    const stage = staged();
    const lease = stage.lease([MAIN]);
    lease.keep(MAIN, (turns) => [...turns, said("more")]);
    expect(stage.turnsOf(MAIN)).toHaveLength(2);
    stage.reset(SLICE);
    expect(lease.revoked()).toBe(true);
    const after = stage.state();
    lease.keep(MAIN, (turns) => [...turns, said("late")]);
    lease.hold(MAIN, (turns) => [...turns, said("late")]);
    lease.begin(MAIN);
    lease.asked(MAIN, "Which?");
    lease.commit(notified({ id: "n", threadId: MAIN, text: "late", at: AT }));
    lease.add(CHILD, [said("late")], (ws) => ({ ...ws, threads: [] }));
    expect(stage.state()).toBe(after);
    expect(stage.turnsOf(MAIN)).toEqual([]);
    expect(stage.questionOf(MAIN)).toBeUndefined();
  });

  it("are revoked for a child they wrote, and kept for a thread outside the slice", () => {
    const stage = staged();
    const onChild = stage.lease([CHILD]);
    const onOther = stage.lease([OTHER]);
    stage.reset(SLICE);
    expect(onChild.revoked()).toBe(true);
    expect(onOther.revoked()).toBe(false);
    onOther.keep(OTHER, (turns) => [...turns, said("still")]);
    expect(stage.turnsOf(OTHER).map((turn) => turn.text)).toEqual(["other", "still"]);
  });

  it("taken after a reset write again", () => {
    const stage = staged();
    stage.reset(SLICE);
    const lease = stage.lease([MAIN]);
    lease.begin(MAIN);
    expect(stage.state()).toMatchObject({ replying: [MAIN] });
  });
});

describe("the stage's reset", () => {
  it("puts the slice back, its children, their turns and reply counts gone", () => {
    const stage = staged();
    stage.lease([CHILD]).begin(CHILD);
    stage.reset(SLICE);
    const ws = workspaceOf(stage.state());
    expect(ws.threads.map((each) => each.id)).toEqual([MAIN, OTHER]);
    expect(stage.state()).toMatchObject({ replying: [] });
    expect(stage.holds(CHILD)).toBe(false);
  });

  it("leaves the same workspace when it runs twice", () => {
    const stage = staged();
    stage.reset(SLICE);
    const once = workspaceOf(stage.state());
    stage.reset(SLICE);
    expect(workspaceOf(stage.state())).toEqual(once);
  });

  it("brings a deleted main back and forgets its tomb", () => {
    const stage = staged();
    stage.bury(MAIN);
    stage.reset(SLICE);
    expect(workspaceOf(stage.state()).threads.map((each) => each.id)).toContain(MAIN);
    expect(() => {
      stage.exhume(MAIN);
    }).toThrow('There is no deleted thread "demo-brief" to restore');
  });
});

describe("the stage's delete and restore", () => {
  it("remove a thread and its children in one commit, and put them back as they were", () => {
    const stage = staged();
    stage.bury(MAIN);
    expect(workspaceOf(stage.state()).threads.map((each) => each.id)).toEqual([OTHER]);
    expect(stage.owns(MAIN)).toBe(true); // the tomb is still the stage's
    stage.exhume(MAIN);
    expect(workspaceOf(stage.state()).threads.map((each) => each.id)).toEqual([MAIN, CHILD, OTHER]);
    expect(stage.turnsOf(MAIN)).toEqual([said("brief")]);
  });

  it("refuse a thread the workspace lacks and a tomb nothing filled", () => {
    const stage = staged();
    expect(() => {
      stage.bury("demo-none");
    }).toThrow('There is no thread "demo-none" in this demo');
    expect(() => {
      stage.exhume(MAIN);
    }).toThrow('There is no deleted thread "demo-brief" to restore');
  });

  it("move neither the workspace nor a tomb once broken", () => {
    const stage = staged();
    stage.dispose("closed");
    const broken = stage.state();
    stage.bury(MAIN);
    stage.exhume(MAIN);
    expect(stage.state()).toBe(broken);
  });
});

describe("the stage's ownership", () => {
  it("owns its projects, threads and tombs, and nothing once disposed", () => {
    const stage = staged();
    expect([ids.project, MAIN, CHILD, "playground"].map((each) => stage.owns(each))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    stage.dispose("closed");
    expect(stage.owns(MAIN)).toBe(false);
  });
});
