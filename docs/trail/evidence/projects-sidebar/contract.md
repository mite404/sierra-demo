# Contract: projects, sub-threads, the shell, persistence, scenarios and the carry

The synthesis of two architect arenas (core base: candidate D; shell base: candidate A) with grafts
recorded in the trail log, in git history at `docs/trail/projects-sidebar.tsv`. Every package
worker builds against this file.
Names in `code` are the contract; bodies are theirs. ADR-091 to ADR-096 carry the decisions.

## Build order and planned breakage

1. Three package workers run in parallel, each in its own worktree:
   - **runtime** owns `packages/runtime/**`.
   - **catalog** owns `packages/catalog/**` and `apps/storybook/**`.
   - **ui** owns `packages/ui/**` and is the only worker allowed to touch `pnpm-lock.yaml`.
2. One web integrator then owns `apps/web/**` on top of all three.
3. Planned breakage: after the runtime worker, `apps/web` no longer typechecks against the new
   `Runtime`. That is expected until the integrator lands. No worker edits a package it does not
   own. The catalog keeps `CARD_DRAG_TYPE`, `startCardDrag` and `cardFromDrop` exported until the
   integrator deletes them together with their last caller in `apps/web/src/canvas.ts`.

## Domain (runtime, `packages/runtime/src/workspace.ts`, pure, importable by the page)

```ts
type ProjectId, ThreadId, LaneId  // zod-branded strings, parsed at the protocol boundary
type Project = { id: ProjectId; name: string; createdAt: string };
type Place = { kind: "main"; projectId: ProjectId } | { kind: "child"; parentId: ThreadId };
type ThreadSummary = {
  id: ThreadId; title: string; place: Place;
  createdAt: string; updatedAt: string;
  preview: string;  // the latest message on one line, as today's toSummary
  draft: string;    // the opening draft a dropped highlight left; "" once the first turn is sent
};
type Lane = { id: LaneId; width: number | null } & (
  | { kind: "thread"; threadId: ThreadId }  // id is always `l-${threadId}`
  | { kind: "card"; card: SharedCard; title: string }
);
type Notification = { id: string; threadId: ThreadId; text: string; at: string };
type Workspace = {
  projects: Project[];                     // oldest first
  threads: ThreadSummary[];                // no messages, ever
  lanes: Record<ThreadId, Lane[]>;         // keyed by main thread, left to right
  shell: ShellState | null;                // null until the page first saves one
  notifications: Notification[];           // fixtures only for now; the device has none
};
```

Invariants, each held twice (types, then SQLite checks and triggers):

- A thread is a main or a child, never both, and never changes place.
- A child's parent is a main (depth one). A child's project is its parent's.
- A thread lane lives on its parent's canvas, at most once. A closed lane is an absent lane: the
  child stays in the sidebar, and opening it appends its lane again.
- Card lanes persist like thread lanes. Widths persist (null means the default column).

Pure helpers the page uses (all total, no throws):

- `sidebarTree(ws)` returns projects oldest first, mains newest created first, and children in
  lane order, then the closed children oldest first.
- `locate(ws, id)` returns `{ main, focus: ThreadId | null } | undefined` for a main or a child id.
- `latestMain(ws)` returns the main with the newest activity in it or its children.
- `lanesOf(ws, mainId)`, `insertLane(lanes, at, lane)`, `moveLane(lanes, id, to)`,
  `closeLane(lanes, id)`, `reopenLane(lanes, threadId)`, `resizeLane(lanes, id, width)`.
  Each is an idempotent list edit; its result is what the page passes to `arrange`.
- `titleFor` and `quoteFor` move here from `apps/web/src/canvas.ts`. The integrator deletes the
  web copies.

## Runtime handle (`packages/runtime/src/runtime.ts`, the page's only door)

```ts
type Source =
  | { kind: "device"; storage: "opfs" | "memory" }
  | { kind: "scenario"; name: ScenarioName };
type RuntimeState =
  | { kind: "starting"; source: Source | null }      // source arrives with the worker's `opening`
  | { kind: "held"; source: null }                  // another tab has the database (ADR-118)
  | { kind: "ready"; source: Source; workspace: Workspace; replying: ThreadId[] }
  | { kind: "broken"; source: Source | null; reason: string };
type NewItem =
  | { kind: "project"; name: string }               // resolves to ProjectId
  | { kind: "main"; projectId: ProjectId; title?: string }  // "New thread" when omitted
  | { kind: "child"; parentId: ThreadId; at: number; title: string; draft: string };
type Runtime = {
  subscribe(listener: () => void): () => void;       // useSyncExternalStore
  state(): RuntimeState;                             // same object until something changes
  open(id: ThreadId): Promise<ThreadMessage[]>;      // one thread's messages
  create(item: NewItem): Promise<string>;            // the new id, after `state` lists it
  rename(target: { kind: "project" | "thread"; id: string }, name: string): Promise<void>;
  arrange(mainId: ThreadId, lanes: Lane[]): Promise<void>;
  saveShell(shell: ShellState): Promise<void>;
  agent(id: ThreadId, session?: Session): Agent;     // ADR-041, unchanged in shape
  dispose(): void;
};
function startRuntime(config: {
  agent: AgentSpec;
  data: { kind: "device"; legacy?: LegacyCanvas } | { kind: "scenario"; name: ScenarioName };
}): Runtime;
```

- `rename`, `arrange` and `saveShell` apply to the local snapshot at once, then send. The next
  `state` push is the truth and replaces the overlay, so a refused write rolls back by itself.
- `create` needs no overlay. The worker pushes `state` before it answers, so the id already
  resolves in `state()` when the promise settles.
- The worker mints every id through `Mint` (`project()`, `thread()`, `lane()`, `now()`). On the
  device, ids are random and time is real. In a scenario, ids come from a counter and the clock
  is fixed.
- The page mints card-lane ids with `newCardLaneId()` from `workspace.ts` (random, `c-...`).

## Protocol (zod, both directions, ADR-076/086)

- Commands:
  - `init { agent, data }`
  - `open { requestId, threadId }`
  - `create { requestId, item }`
  - `rename { requestId, target, name }`
  - `arrange { requestId, mainId, lanes, base }`: `base` is the lane ids the page edited from,
    and the worker keeps any lane added since (a three-way merge), so an arrange sent while a
    child is being created cannot close the new child's lane
  - `saveShell { requestId, shell }`
  - `send { requestId, threadId, event, accessToken? }`
  - `abort { requestId }`
- Notices:
  - `opening { source }` is posted before any `state`: at once for a scenario, and on the device
    once the storage kind (OPFS or memory) is known. A held start still shows its source. A
    migration or version error ends the start in `broken` with its reason, never in memory.
  - `held` (amended by ADR-118): a device worker whose Web Lock another tab has waits, and the
    page shows "Your threads are open in another tab" until the lock is granted. A second tab
    never falls back to memory; memory is only for a browser without the file system or locks.
  - `state { source, workspace, replying }` is posted after init and after every write (reply
    start and end included). It is skipped when the serialized form equals the last push.
  - Per-request answers: `opened { requestId, messages }`, `created { requestId, id }`,
    `done { requestId }`, `failed { requestId, reason }` and `chunk { requestId, text }`.
  - `broken { reason }` is only for what no request caused.
- Ordering: a write's `state` is posted before its `done` or `created`.
- Correlation is one `Map<requestId, sink>`. The ad hoc correlation goes: `list`, `listed`,
  `ready`, the FIFO list queue, the opens map and the non-fatal `failAll`. `open`'s `seed` goes
  too.

## Store (`packages/runtime/src/sqliteStore.ts`, the one adapter)

- The memory store goes. The OPFS fallback, scenarios and node tests use SQLite `:memory:`.
- Schema v2 rebuilds `conversations`, keeping the name:
  - Columns: `created_at`, `project_id`, `parent_id` and `draft`, with
    `check ((project_id is null) <> (parent_id is null))`.
- Tables:
  - `projects`
  - `lanes (main_id, seq, id, thread_id, card_json, title, width)`, with a thread-or-card check
    and a trigger tying a thread lane to its parent
  - `shell (id integer primary key check (id = 1), json)`
  - `notifications (id, thread_id, text, at)`
- `messages` and FTS5 do not change. Triggers enforce depth one, fixed places and lanes on their
  own main.
- Migrations are steps indexed by `user_version`. Each step runs in one transaction that also
  bumps the version. `foreign_keys` is toggled outside it, and `foreign_key_check` runs before
  commit.
  - 0 → 1 is the v1 DDL.
  - 1 → 2 is `planV2(rows, legacy)` (pure), then a rebuild.
- `planV2`:
  - With a `profit` row, it creates project `{ id: "demo-store", name: "Demo store" }` with
    `profit` as its main. Every other conversation becomes a child of `profit`.
  - Lanes are the children not in `legacy.hidden`, in `legacy.order` then oldest first. Ids are
    `l-<threadId>`.
  - Without `profit`, every conversation becomes a main of that project, with no lanes. With no
    rows, the plan is empty.
- The starter converges at init on the device only. With no conversations it creates "Demo store"
  and the `profit` main from `threads.profit`, as the page does today.
- Legacy keys: the page reads `kay.canvas.hidden` and `kay.canvas.order` and sends them in
  `init.data.legacy`. Only the 1 → 2 step reads them. The page clears them only after a `state`
  whose source is `{ device, opfs }`, never from a memory fallback.

## Scenarios (`packages/runtime/src/scenarios.ts`, loaded by dynamic import in the worker)

- Names: `demo`, `empty`, `long`, `loading`, `failure`, `thread-fails`.
- Each scenario is loaded into a fresh `:memory:` store through the store's own write path, so a
  fixture cannot express a state the schema forbids.
- The clock is fixed and ids come from a counter. Turn times are formatted in UTC.
- A scenario always uses the lab agent. It never opens OPFS.
- Faults are data:
  - `start: "hold" | { fail }`. `loading` holds after `opening` forever; `failure` fails.
  - `open` and `send` can be `{ fail }` (`thread-fails`).
- Content:

| Scenario | What it holds |
| --- | --- |
| `demo` | Two projects. "Demo store" has the profit main (two children, one closed, a card lane) and "Refund audit". "Service desk" has the trend main. Tabs for two mains, one on canvas, one on browser. Two notifications. |
| `empty` | Nothing. |
| `long` | 12 projects, 80-character names, one unbroken 60-character word, a main with 9 children, a 120-turn thread, 12 tabs, 12 notifications. |

## Shell state (the page is its only writer; stored whole by `saveShell`)

```ts
type PaneKind = "thread" | "browser" | "canvas";
type BrowserState = { back: PageAddress[]; current: PageAddress; forward: PageAddress[] };
type View = { pane: PaneKind; split: number /* 28..80, default 52 */; browser: BrowserState };
type ShellState = {
  version: 1;
  tabs: ThreadId[];                 // open main threads, left to right, each once
  views: Record<ThreadId, View>;    // outlive their tab: a reopened thread comes back the same
  read: string[];                   // notification ids seen
};
```

- The runtime stores `ShellState` as opaque JSON. The page parses it with zod (`apps/web/src/
  shell/state.ts`) and falls back to `firstRun` when it is malformed, and prunes ids that no
  longer exist.
- `PageAddress` is branded and made only by `parseAddress` (graft from shell B). One boundary
  parse serves both the address field and the page registry, with round-trip tests.

## Carry (`packages/catalog/src/carry.ts`, exported as `@yaklabs/catalog/carry`)

```ts
type Carried = { kind: "card"; card: SharedCard; title: string } | { kind: "text"; text: string };
type CarryPoint = { x: number; y: number };
type CarryTarget = {
  over(carried: Carried, at: CarryPoint): boolean;  // false refuses it
  leave(): void;                                    // pointer left, landed elsewhere, cancelled
  drop(carried: Carried, at: CarryPoint): void;
};
function acceptCarry(element: Element, target: CarryTarget): () => void;
function useCarryTarget(ref: RefObject<HTMLElement | null>, target: CarryTarget): void;
function armCarry(down: PointerEvent, source: {
  carried: Carried; lift?: HTMLElement; picture?: () => HTMLElement;
}): void;
function stepCarry(state: CarryState, input: CarryInput): [CarryState, CarryEffect[]]; // pure
const LIFT_PX = 6;
```

- Targets are found by `elementFromPoint` and then the nearest registered ancestor. The ghost has
  `pointer-events: none`.
- From the lift until the end, `html[data-carrying]` holds `cursor: grabbing` on everything.
- Escape, `pointercancel`, window blur and lost capture all cancel: the target gets `leave`, and
  nothing drops.
- `armCarry` claims its press (`stopPropagation`), so the innermost handle wins: a card header
  inside a lane carries the card and never lifts the lane.
- `CardHeader` arms a carry. The card is the picture and the source dims through `data-lifted`.
- `grabbable.ts` arms a text carry on a press over a ready highlight, with a one-line quote chip
  as the picture, and cancels any native `dragstart` inside the thread.
- The lab agent answers a plain message with a short scripted line instead of staying silent.

## UI (`packages/ui`)

- Install with `shadcn add`: `sidebar collapsible tabs toggle-group avatar badge`, plus their
  registry dependencies.
- Map `--sidebar*` onto Kay's tokens in `globals.css`, and add their `--color-sidebar*` theme
  entries.
- Drop any `.dark` block the CLI writes, since the tokens already flip under `data-theme`.
- `SidebarMenuSkeleton` takes a fixed width, so screenshots never vary.

## Web (the integrator)

- **Frame.** The app is a window inside the viewport: a rounded 12px frame on a desk of its own
  (`--desk`) with a 16px margin, full-bleed below 768px (ADR-111, amending the 8px first built).
- **Title bar, left to right.** Decorative traffic lights, then the sidebar toggle, then
  `TabStrip`. At the right end: the layout switch, Collapse all, and the bell in the corner
  (ADR-123 dropped the data marker that once sat first in this group; ADR-138 moved the account
  to the sidebar's foot, which is now the rail's).
- **Sidebar below 768px (ADR-121).** A drawer that pushes the whole window right, not a sheet
  over it: `dialog[data-slot="sidebar"]` named "Sidebar", 85% of the width up to 20rem. The
  pushed page is inert, and a tap on it, Escape, or an arrival anywhere closes the drawer. It is
  one labelled column (ADR-144): the places as rows, "Out of demo scope" beside those outside the
  demo, then the project tree, then the account at its foot. There is no rail below 768px.
- **Title bar below 768px (ADR-116, amended by ADR-123).** Two rows. The top row does not scroll:
  the sidebar toggle, the project's name (`[data-slot="project-name"]`), Collapse all, the bell,
  and button "Thread actions". The second row is the Layout group with its views named in words.
  The tab strip is hidden.
- **Rail and projects panel (ADR-144).** Below the title bar, `[data-slot="window-body"]` holds
  the rail, then the stage:
  - The rail (`rail.tsx`, `[data-slot="rail"]`, 56px, `--rail-width`) is drawn in every desktop
    state and never moves. A navigation landmark named "Places" holds its eight places as 40px
    squares, each naming itself in an ink pill: `KayMark` (the site's polygon), Memory, Skills,
    App store, Analytics and Automations (out of demo scope), Documentation, and Lab. The account
    sits at its foot, outside the landmark; its menu carries the theme.
  - The stage (`[data-slot="stage"]`) clips at the rail's edge (`overflow: clip` from 768px)
    and holds the panel and the workspace.
  - The projects panel is shadcn's `Sidebar collapsible="offcanvas"` (the `sidebar-16`
    pattern), a navigation landmark named "Sidebar" holding the project tree. Docked, it pushes
    the workspace and resizes from its right edge; closed, it is inert and peeks from behind the
    rail's edge over the workspace (phase `away` at rest).
- **Deck.** Every visited tab stays mounted, hidden with `inert` and
  `content-visibility: hidden`. Only closing a tab unmounts it.
- **Routes.**
  - `/` resumes the last active tab, or the latest main, or shows "Nothing open".
  - `/t/:threadId` picks the tab. A child forces its main's view to `canvas` and brings its lane
    into view.
  - `/lab` is unchanged.
  - share.html and callback render bare.
- **Accessible names the levers rely on.**
  - Title bar: `header[data-slot="title-bar"]`, button "Toggle sidebar", tablist "Open threads"
    (tab names are thread titles), button "Close <title>", button "New thread", group "Layout"
    with "Thread", "Canvas" and "Browser" (`aria-pressed`), button "Notifications". Below 768px
    the tablist is hidden and the group is the bar's second row.
  - Sidebar: group label "Projects". Project rows are buttons named by the project, with
    `aria-expanded`. Each has a "+" named "New thread in <project>". Thread rows are links named
    by the title. Main rows carry `data-thread="main"`; child rows carry `data-thread="child"`
    and show "↳".
  - Rail: navigation "Places" with links "Kay", "Documentation" and "Lab" and buttons "Memory",
    "Skills", "App store", "Analytics" and "Automations" (`aria-disabled`, described as "Coming
    soon"); button "Account" at the rail's foot, and at the drawer's below 768px.
  - Panel: navigation "Sidebar", `[data-slot="sidebar-container"]`, and its edge, separator
    "Resize the sidebar".
  - Window: `[data-slot="window"]` wraps the whole app; `[data-slot="traffic-lights"]` holds
    the three decorative dots (`aria-hidden`).
  - Project row chevron: `[data-slot="project-chevron"]` inside the row button, `opacity: 0` at
    rest while the project is open, visible on hover and whenever the project is folded.
  - Deck: each tab's workspace is `role="tabpanel"` named by its thread's title; a hidden one
    carries `inert`, so `[role="tabpanel"]:not([inert])` is the one on screen.
  - Browser: region "Browser", textbox "Address", buttons "Back", "Forward" and "Reload".
  - Canvas: region "Compose canvas", drop marker `[data-drop-marker]`.
  - States: a failed start or a failed thread shows a button "Try again"; loading rows are
    shadcn's `[data-sidebar="menu-skeleton"]` with fixed widths.
- **Defaults.** The projects panel opens docked on a window at least 1280px wide and remembers
  the visitor's choice in localStorage `kay.sidebar` ("open" is docked, "closed" leaves the rail
  alone); its width is `kay.sidebar-width`, 208 to 480px, 256 by default, never past 40% of the
  window, and the rail's 56px is added to it. Every link the app builds keeps `?scenario=`,
  so a mock visit never drifts onto device data. A new main thread opens on `thread`; the starter
  and migrated `profit` open on `canvas`, as today.
