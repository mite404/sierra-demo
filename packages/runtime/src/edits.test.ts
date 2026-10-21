import { describe, expect, it } from "vitest";
import { marked, removed } from "./edits";
import { projectIdSchema, threadIdSchema, type ThreadSummary, type Workspace } from "./workspace";

const t = (id: string) => threadIdSchema.parse(id);
const at = (minute: number) => `2026-09-28T10:${String(minute).padStart(2, "0")}:00.000Z`;

function thread(id: string, parent?: string): ThreadSummary {
  return {
    id: t(id),
    title: id,
    place:
      parent === undefined
        ? { kind: "main", projectId: projectIdSchema.parse("p") }
        : { kind: "child", parentId: t(parent) },
    createdAt: at(0),
    updatedAt: at(0),
    preview: "",
    turnCount: 0,
    draft: "",
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
  };
}

// A main with a child, another main, a note on the child and a share of the main.
const ws: Workspace = {
  projects: [{ id: projectIdSchema.parse("p"), name: "P", createdAt: at(0) }],
  threads: [thread("main"), thread("kid", "main"), thread("other")],
  lanes: { [t("main")]: [], [t("other")]: [] },
  shell: null,
  notifications: [{ id: "n1", threadId: t("kid"), text: "Done", at: at(1) }],
  shares: [
    {
      id: "s1",
      threadId: t("main"),
      link: "https://kay.example/share.html#t=s1.k",
      revokeToken: "r",
      createdAt: at(1),
      expiresAt: at(59),
    },
  ],
};

describe("marked shows a mark before the worker confirms it", () => {
  it("pins the one thread it names", () => {
    const after = marked(t("other"), { pinned: true }, at(5))(ws);
    expect(after.threads.map((each) => each.pinnedAt)).toEqual([null, null, at(5)]);
  });

  it("leaves the workspace alone for a mark the worker will refuse", () => {
    expect(marked(t("other"), { snoozedUntil: at(1) }, at(5))(ws)).toBe(ws);
  });

  it("puts a snooze's note first in the bell, on its thread at the mark's time", () => {
    const note = { id: "n2", text: "Snoozed “other”" };
    const after = marked(t("other"), { snoozedUntil: at(30) }, at(5), note)(ws);
    expect(after.notifications).toEqual([
      { id: "n2", threadId: t("other"), text: "Snoozed “other”", at: at(5) },
      ...ws.notifications,
    ]);
  });

  it("shows no note for a snooze the worker will refuse", () => {
    const note = { id: "n2", text: "Snoozed “other”" };
    expect(marked(t("other"), { snoozedUntil: at(1) }, at(5), note)(ws)).toBe(ws);
  });
});

describe("removed hides a delete before the worker confirms it", () => {
  it("drops the thread, its children, and the notes and shares that name them", () => {
    const after = removed(t("main"))(ws);
    expect(after.threads.map((each) => each.id)).toEqual(["other"]);
    expect(after.notifications).toEqual([]);
    expect(after.shares).toEqual([]);
  });

  it("drops a child alone", () => {
    expect(removed(t("kid"))(ws).threads.map((each) => each.id)).toEqual(["main", "other"]);
  });
});
