import {
  STARTER,
  threadIdSchema,
  type ProjectId,
  type ThreadId,
  type ThreadSummary,
  type Workspace,
} from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { blankHomeOf, homeTarget, liveProjectOf } from "./home";

// The runtime keeps its project id schema to itself; a test id is one cast.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const DEMO = "demo" as ProjectId;
const LIVE = STARTER.project.id;
const id = (raw: string): ThreadId => threadIdSchema.parse(raw);
const [BRIEF, OLDER, NEWER] = ["brief", "older", "newer"].map((raw) => id(raw));

// A main in `projectId`, made at `createdAt`, holding `turnCount` turns.
function main(
  threadId: ThreadId,
  projectId: ProjectId,
  createdAt: string,
  turnCount = 0,
): ThreadSummary {
  return {
    id: threadId,
    title: threadId,
    place: { kind: "main", projectId },
    createdAt,
    updatedAt: createdAt,
    preview: "",
    turnCount,
    draft: "",
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
  };
}

// The Demo first, as the sidebar lists it, and the Live Playground with the threads given.
function workspace(threads: ThreadSummary[], live = true): Workspace {
  const at = "2026-09-20T09:00:00.000Z";
  return {
    projects: [
      { id: DEMO, name: "Demo", createdAt: at },
      ...(live ? [{ id: LIVE, name: STARTER.project.name, createdAt: at }] : []),
    ],
    threads: [main(BRIEF, DEMO, at, 4), ...threads],
    lanes: {},
    shell: null,
    notifications: [],
    shares: [],
  };
}

const STARTED = main(STARTER.thread.id, LIVE, "2026-09-20T09:00:00.000Z");
const USED = main(STARTER.thread.id, LIVE, "2026-09-20T09:00:00.000Z", 2);
const OLDER_BLANK = main(OLDER, LIVE, "2026-09-21T09:00:00.000Z");
const NEWER_BLANK = main(NEWER, LIVE, "2026-09-22T09:00:00.000Z");

describe("liveProjectOf", () => {
  it("names the Live Playground, not the project the sidebar lists first", () => {
    expect(liveProjectOf(workspace([STARTED]))).toBe(LIVE);
  });

  it("names none on a source without one", () => {
    expect(liveProjectOf(workspace([], false))).toBeUndefined();
  });
});

describe("blankHomeOf", () => {
  it("opens on the starter while it is blank, before newer blank threads", () => {
    expect(blankHomeOf(workspace([NEWER_BLANK, STARTED]))).toBe(STARTER.thread.id);
  });

  it("opens on the newest blank thread once the starter has turns", () => {
    expect(blankHomeOf(workspace([USED, OLDER_BLANK, NEWER_BLANK]))).toBe(NEWER);
  });

  it("passes over threads with turns, archived or snoozed, and other projects' threads", () => {
    const archived = { ...OLDER_BLANK, archivedAt: "2026-09-23T09:00:00.000Z" };
    const snoozed = { ...NEWER_BLANK, snoozedUntil: "2099-01-01T09:00:00.000Z" };
    expect(blankHomeOf(workspace([USED, archived, snoozed]))).toBeUndefined();
  });
});

describe("homeTarget", () => {
  it("resumes the tab last on screen on a plain visit", () => {
    expect(homeTarget(workspace([STARTED]), BRIEF, false)).toEqual({ kind: "go", to: BRIEF });
  });

  it("opens the blank live thread for Home, whatever is open", () => {
    const to = STARTER.thread.id;
    expect(homeTarget(workspace([STARTED]), BRIEF, true)).toEqual({ kind: "go", to });
  });

  it("opens the blank live thread when nothing is open", () => {
    const to = STARTER.thread.id;
    expect(homeTarget(workspace([STARTED]), null, false)).toEqual({ kind: "go", to });
  });

  it("starts a live thread when the Live Playground has no blank one", () => {
    expect(homeTarget(workspace([USED]), null, true)).toEqual({ kind: "start", in: LIVE });
  });

  it("resumes, else shows nothing, on a source with no Live Playground", () => {
    expect(homeTarget(workspace([], false), BRIEF, true)).toEqual({ kind: "go", to: BRIEF });
    expect(homeTarget(workspace([], false), null, true)).toEqual({ kind: "none" });
  });
});
