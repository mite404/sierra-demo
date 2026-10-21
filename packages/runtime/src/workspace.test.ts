import { describe, expect, it } from "vitest";
import {
  closeLane,
  collapseLane,
  collapseLanes,
  insertLane,
  laneIdSchema,
  lanesOf,
  latestMain,
  locate,
  mergeLanes,
  moveLane,
  newCardLaneId,
  projectIdSchema,
  quoteFor,
  openChildLane,
  resizeLane,
  sidebarTree,
  threadIdSchema,
  threadLane,
  threadLaneId,
  titleFor,
  workspaceSchema,
  type Lane,
  type Place,
  type ThreadSummary,
  type Workspace,
} from "./workspace";

const t = (id: string) => threadIdSchema.parse(id);
const p = (id: string) => projectIdSchema.parse(id);
const at = (time: string) => `2026-09-21T${time}:00.000Z`;

function thread(id: string, place: Place, created: string, updated = created): ThreadSummary {
  return {
    id: t(id),
    title: id,
    place,
    createdAt: at(created),
    updatedAt: at(updated),
    preview: "",
    turnCount: 0,
    draft: "",
    pinnedAt: null,
    snoozedUntil: null,
    archivedAt: null,
  };
}

// A thread with a mark already on it: pinned, snoozed or archived at `stamp`.
function marked(base: ThreadSummary, mark: "pin" | "snooze" | "archive", stamp: string) {
  if (mark === "pin") return { ...base, pinnedAt: at(stamp) };
  if (mark === "snooze") return { ...base, snoozedUntil: at(stamp) };
  return { ...base, archivedAt: at(stamp) };
}

const main = (projectId: string): Place => ({ kind: "main", projectId: p(projectId) });
const child = (parentId: string): Place => ({ kind: "child", parentId: t(parentId) });

const card: Lane = {
  id: laneIdSchema.parse("c-1"),
  width: null,
  collapsed: false,
  kind: "card",
  card: { v: 1, kind: "catalog", payload: {} },
  title: "Card",
};

// Two projects. m1 has an open card lane and c1's lane; c2 and c3 are closed.
const ws: Workspace = {
  projects: [
    { id: p("store"), name: "Demo store", createdAt: at("09:00") },
    { id: p("desk"), name: "Service desk", createdAt: at("08:00") },
  ],
  threads: [
    thread("m1", main("store"), "09:01", "09:05"),
    thread("m2", main("store"), "09:02"),
    thread("c1", child("m1"), "09:03", "09:10"),
    thread("c2", child("m1"), "09:04"),
    thread("c3", child("m1"), "09:00"),
    thread("m3", main("desk"), "08:30", "09:20"),
  ],
  lanes: { [t("m1")]: [card, threadLane(t("c1"))], [t("m2")]: [], [t("m3")]: [] },
  shell: null,
  notifications: [],
  shares: [],
};

// The tree as ids: each project with its mains, each main followed by its children.
const rows = (of: Workspace) =>
  sidebarTree(of).map(({ project, mains }) => ({
    project: project.id,
    mains: mains.map((node) => [node.main.id, ...node.children.map((each) => each.id)]),
  }));

const lanes = ["a", "b", "c"].map((id) => threadLane(t(id)));
const ids = (list: Lane[]) => list.map((lane) => lane.id);
const lane = (threadId: string) => threadLaneId(t(threadId));

describe("sidebarTree", () => {
  it("lists projects oldest first, mains and their children newest first", () => {
    expect(rows(ws)).toEqual([
      { project: "desk", mains: [["m3"]] },
      { project: "store", mains: [["m2"], ["m1", "c2", "c1", "c3"]] },
    ]);
  });

  it("keeps each row where it is when lanes open, close or move", () => {
    const reordered = {
      ...ws,
      lanes: { ...ws.lanes, [t("m1")]: [threadLane(t("c2")), card, threadLane(t("c3"))] },
    };
    expect(rows(reordered)).toEqual(rows(ws));
  });
});

// The fixture with a pin, a snooze or an archive on some mains and children.
const withMarks = (edits: Record<string, ["pin" | "snooze" | "archive", string]>) => ({
  ...ws,
  threads: ws.threads.map((each) => {
    const edit = new Map(Object.entries(edits)).get(each.id);
    return edit === undefined ? each : marked(each, ...edit);
  }),
});
// Each project's mains, each a main's id followed by its children's.
const order = (tree: ReturnType<typeof sidebarTree>) =>
  tree.map(({ mains }) => mains.map((node) => [node.main.id, ...node.children.map((c) => c.id)]));

describe("sidebarTree with marks", () => {
  it("lifts pinned threads to the top and sinks archived ones, each group in its usual order", () => {
    const tree = sidebarTree(
      withMarks({ m1: ["archive", "09:30"], c2: ["pin", "09:31"], c3: ["archive", "09:32"] }),
    );
    expect(order(tree)).toEqual([[["m3"]], [["m2"], ["m1", "c2", "c1", "c3"]]]);
  });

  it("keeps a pinned main above a newer one, and a snoozed thread in its place", () => {
    const tree = sidebarTree(withMarks({ m1: ["pin", "09:30"], m2: ["snooze", "11:00"] }));
    expect(order(tree)).toEqual([[["m3"]], [["m1", "c2", "c1", "c3"], ["m2"]]]);
  });
});

describe("locate", () => {
  it.each([
    ["a main", "m1", { main: "m1", focus: null }],
    ["a child", "c2", { main: "m1", focus: "c2" }],
    ["an unknown id", "nope", undefined],
  ])("finds %s", (_, id, expected) => {
    expect(locate(ws, id)).toEqual(expected);
  });
});

describe("latestMain", () => {
  it("counts a child's activity as its main's", () => {
    const busier = { ...ws, threads: [...ws.threads, thread("c4", child("m1"), "09:30")] };
    expect(latestMain(ws)).toBe("m3");
    expect(latestMain(busier)).toBe("m1");
  });

  it("has nothing to open in an empty workspace", () => {
    expect(latestMain({ ...ws, threads: [] })).toBeUndefined();
  });
});

describe("lanesOf", () => {
  it("reads a main's lanes, and none for a child or an unknown id", () => {
    expect(ids(lanesOf(ws, t("m1")))).toEqual(["c-1", "l-c1"]);
    expect(lanesOf(ws, t("c1"))).toEqual([]);
    expect(lanesOf(ws, t("nope"))).toEqual([]);
  });
});

describe("lane edits are idempotent list edits", () => {
  const x = threadLane(t("x"));
  it.each<[string, (list: Lane[]) => Lane[], string[]]>([
    ["insert in the middle", (list) => insertLane(list, 1, x), ["l-a", "l-x", "l-b", "l-c"]],
    ["insert before the start", (list) => insertLane(list, -5, x), ["l-x", "l-a", "l-b", "l-c"]],
    ["insert past the end", (list) => insertLane(list, 99, x), ["l-a", "l-b", "l-c", "l-x"]],
    ["insert at NaN", (list) => insertLane(list, Number.NaN, x), ["l-a", "l-b", "l-c", "l-x"]],
    [
      "insert one it holds",
      (list) => insertLane(list, 0, threadLane(t("c"))),
      ["l-c", "l-a", "l-b"],
    ],
    ["move to the start", (list) => moveLane(list, lane("c"), 0), ["l-c", "l-a", "l-b"]],
    ["move to the end", (list) => moveLane(list, lane("a"), 2), ["l-b", "l-c", "l-a"]],
    ["move a missing lane", (list) => moveLane(list, lane("x"), 0), ["l-a", "l-b", "l-c"]],
    ["close", (list) => closeLane(list, lane("b")), ["l-a", "l-c"]],
    ["close a missing lane", (list) => closeLane(list, lane("x")), ["l-a", "l-b", "l-c"]],
    [
      "open a child the sidebar lists after the open ones",
      (list) => openChildLane(list, t("x"), [t("a"), t("b"), t("c"), t("x")]),
      ["l-a", "l-b", "l-c", "l-x"],
    ],
    [
      "open a child where the sidebar lists it among the open ones",
      (list) => openChildLane(list, t("x"), [t("a"), t("x"), t("b"), t("c")]),
      ["l-a", "l-x", "l-b", "l-c"],
    ],
    [
      "open the newest child first, as the sidebar lists it",
      (list) => openChildLane(list, t("x"), [t("x"), t("a"), t("b"), t("c")]),
      ["l-x", "l-a", "l-b", "l-c"],
    ],
    [
      "open a child the order does not name at the end",
      (list) => openChildLane(list, t("x"), []),
      ["l-a", "l-b", "l-c", "l-x"],
    ],
    [
      "keep an open child where the reader left it",
      (list) => openChildLane(list, t("a"), [t("c"), t("b"), t("a")]),
      ["l-a", "l-b", "l-c"],
    ],
  ])("%s", (_, edit, expected) => {
    const once = edit(lanes);
    expect(ids(once)).toEqual(expected);
    expect(edit(once)).toEqual(once);
  });

  it.each<[string, number | null]>([
    ["sets a width", 320],
    ["puts the default back", null],
  ])("resize %s", (_, width) => {
    const once = resizeLane(lanes, lane("b"), width);
    expect(once.map((each) => each.width)).toEqual([null, width, null]);
    expect(resizeLane(once, lane("b"), width)).toEqual(once);
  });
});

describe("collapsing lanes (ADR-133)", () => {
  it.each([
    ["collapses", true],
    ["expands", false],
  ])("%s one lane and leaves the rest", (_, collapsed) => {
    const flipped = lanes.map((each) => ({ ...each, collapsed: !collapsed }));
    const once = collapseLane(flipped, lane("b"), collapsed);
    expect(once.map((each) => each.collapsed)).toEqual([!collapsed, collapsed, !collapsed]);
    expect(collapseLane(once, lane("b"), collapsed)).toEqual(once);
    expect(collapseLane(once, lane("x"), collapsed)).toEqual(once);
  });

  it.each([
    ["collapses", true],
    ["expands", false],
  ])("%s every lane, keeping their order and widths", (_, collapsed) => {
    const mixed = collapseLane(resizeLane(lanes, lane("a"), 400), lane("c"), true);
    const once = collapseLanes(mixed, collapsed);
    expect(once.map((each) => each.collapsed)).toEqual([collapsed, collapsed, collapsed]);
    expect(ids(once)).toEqual(ids(mixed));
    expect(once.map((each) => each.width)).toEqual([400, null, null]);
    expect(collapseLanes(once, collapsed)).toEqual(once);
  });

  it("opens a new or reopened lane expanded", () => {
    expect(threadLane(t("x")).collapsed).toBe(false);
    expect(openChildLane(lanes, t("x"), []).at(-1)?.collapsed).toBe(false);
  });
});

// Thread lanes named by one space-separated line: "a x b" is l-a, l-x, l-b.
const lanesNamed = (names: string) =>
  names
    .split(" ")
    .filter((name) => name !== "")
    .map((name) => threadLane(t(name)));

describe("mergeLanes keeps what the page never saw", () => {
  it.each<[string, string, string, string, string]>([
    ["takes the page's list when nothing changed meanwhile", "a b c", "a b c", "c a", "c a"],
    ["keeps a new lane after its left neighbour", "a x b", "a b", "b a", "b a x"],
    ["keeps a new first lane before its right neighbour", "x a b", "a b", "b a", "b x a"],
    ["keeps new lanes in a row together, in order", "a x y b", "a b", "b a", "b a x y"],
    ["anchors past a neighbour the page closed", "a b x c", "a b c", "c a", "c a x"],
    ["appends a new lane whose neighbours the page closed", "a x", "a", "", "x"],
    ["never doubles a lane the page reopened", "a x", "a", "a x", "a x"],
    ["reopens a lane the canvas no longer holds", "", "a", "a", "a"],
  ])("%s", (_, current, base, page, expected) => {
    const merged = mergeLanes(lanesNamed(current), ids(lanesNamed(base)), lanesNamed(page));
    expect(merged).toEqual(lanesNamed(expected));
  });
});

describe("newCardLaneId", () => {
  it("mints a fresh card lane id each time", () => {
    const [first, second] = [newCardLaneId(), newCardLaneId()];
    expect(first).toMatch(/^c-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
  });
});

describe("workspaceSchema", () => {
  it("accepts the fixture and refuses a thread lane whose id is not l-<threadId>", () => {
    expect(workspaceSchema.parse(ws)).toEqual(ws);
    const stray = { ...threadLane(t("c1")), id: "l-c2" };
    const broken = { ...ws, lanes: { m1: [stray] } };
    expect(workspaceSchema.safeParse(broken).success).toBe(false);
  });
});

describe("titleFor", () => {
  it("keeps a short highlight whole, on one line", () => {
    expect(titleFor("Saturday leads\n  at every level")).toBe("Saturday leads at every level");
  });
  it("cuts a long highlight at a word and marks the cut", () => {
    const title = titleFor("The weekend carries the week because Saturday alone brings a third");
    expect(title).toBe("The weekend carries the week because Saturday…");
    expect(title.length).toBeLessThanOrEqual(49);
  });
});

describe("quoteFor", () => {
  it("quotes every line and leaves room to ask beneath", () => {
    expect(quoteFor("one\ntwo")).toBe("> one\n> two\n\n");
  });
});
