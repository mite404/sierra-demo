import { profitCard, type ThreadMessage } from "@yaklabs/catalog/thread";
import type { Faults, Opened } from "./agentLoop";
import { fixedMint, type Mint } from "./mint";
import type { ScenarioName } from "./protocol";
import { openSqliteStore } from "./sqliteStore";
import { seedThread, type Store } from "./store";
import { DEMO_PROJECT, PROFIT } from "./v2Plan";
import {
  threadLane,
  type Lane,
  type Place,
  type ProjectId,
  type ShellState,
  type ThreadId,
} from "./workspace";

// What a fixture writes with: the store's own calls, and the mint that names what it writes.
type Writer = { store: Store; mint: Mint };
// A scenario: what its store holds, and where it fails or stalls.
type Scenario = { faults: Faults; fill?: (write: Writer) => void };
// One thread a fixture writes; times are minutes before the scenario's clock.
type ThreadFixture = {
  place: Place;
  title: string;
  messages?: ThreadMessage[];
  created: number;
  updated?: number;
};
type Pane = "thread" | "browser" | "canvas";

// Every scenario's clock stops here: the Monday after the week the seed cards show.
const CLOCK = new Date("2026-09-21T15:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60;
// The simulated browser's pages (the page's registry uses .example hosts, RFC 2606).
const START_PAGE = "https://start.example/";
const RADAR_PAGE = "https://weather.example/radar";
// A 60-character word with no break in it, for the layouts that must wrap or clip one.
const LONG_WORD = "Supplierinvoicereconciliationacrossthenorthernwarehouseslist";

const two = (n: number) => String(n).padStart(2, "0");
const ago = (minutes: number) => new Date(CLOCK.getTime() - minutes * MINUTE);
const main = (projectId: ProjectId): Place => ({ kind: "main", projectId });
const child = (parentId: ThreadId): Place => ({ kind: "child", parentId });

// A user's turn and an agent's, `minutes` before the clock, timed as the mint writes (UTC).
function userSays(write: Writer, id: string, text: string, minutes: number): ThreadMessage {
  return { id, role: "user", text, time: write.mint.turnTime(ago(minutes)) };
}

function agentSays(write: Writer, id: string, text: string, minutes: number): ThreadMessage {
  return { id, role: "agent", text, time: write.mint.turnTime(ago(minutes)) };
}

function addProject(write: Writer, name: string, created: number): ProjectId {
  const id = write.mint.project();
  write.store.addProject({ id, name, createdAt: ago(created).toISOString() });
  return id;
}

function addThread(write: Writer, fixture: ThreadFixture): ThreadId {
  const { place, title, messages = [], created, updated = created } = fixture;
  const id = write.mint.thread();
  const [createdAt, updatedAt] = [ago(created).toISOString(), ago(updated).toISOString()];
  write.store.addThread({ id, title, place, createdAt, updatedAt, draft: "", messages });
  return id;
}

function notify(write: Writer, n: number, threadId: ThreadId, text: string, minutes: number) {
  const at = ago(minutes).toISOString();
  write.store.addNotification({ id: `n-${two(n)}`, threadId, text, at });
}

function profitCardLane(write: Writer): Lane {
  const card = { v: 1, kind: "interactive", payload: profitCard } as const;
  const title = profitCard.props.title;
  return { id: write.mint.lane(), width: null, collapsed: false, kind: "card", card, title };
}

// A tab's view as the page's shell keeps it: which pane, the split, and the browser's history.
function view(pane: Pane, back: string[] = [], current = START_PAGE) {
  return { pane, split: 52, browser: { back, current, forward: [] } };
}

function shell(tabs: ThreadId[], views: [ThreadId, ReturnType<typeof view>][]): ShellState {
  return { version: 1, tabs, views: Object.fromEntries(views), read: [] };
}

// The profit thread with two children, one closed, and a card open beside the other.
function fillProfit(write: Writer, projectId: ProjectId): ThreadId {
  const { title, messages } = seedThread("profit");
  const profit = addThread(write, {
    place: main(projectId),
    title,
    messages,
    created: 2 * DAY,
    updated: 80,
  });
  const why = "More orders. Baskets on Saturday were about the size of any other day's.";
  const saturday = addThread(write, {
    place: child(profit),
    title: "Saturday leads at every level",
    messages: [
      userSays(
        write,
        "u1",
        "> Saturday leads at every level\n\nMore orders, or bigger baskets?",
        80,
      ),
      agentSays(write, "a1", why, 80),
    ],
    created: 80,
  });
  addThread(write, {
    place: child(profit),
    title: "Why is Tuesday quiet?",
    messages: [userSays(write, "u1", "Why is Tuesday the quietest day?", 70)],
    created: 70,
  });
  write.store.arrange(profit, [profitCardLane(write), threadLane(saturday)]);
  return profit;
}

// Two projects: Demo store with the profit thread and a Refund audit that waits on the user,
// and Service desk with the trend thread. Two tabs, one on the canvas and one on the browser.
function fillDemo(write: Writer): void {
  const store = addProject(write, "Demo store", 3 * DAY);
  const desk = addProject(write, "Service desk", 2 * DAY);
  const profit = fillProfit(write, store);
  const ask = "Two refunds have no order number, so I can't match them. Should I list them?";
  const refunds = addThread(write, {
    place: main(store),
    title: "Refund audit",
    messages: [
      userSays(write, "u1", "Check last week's refunds against their orders.", 30),
      agentSays(write, "a1", ask, 30),
    ],
    created: DAY,
    updated: 30,
  });
  const trendSeed = seedThread("trend");
  const trend = addThread(write, {
    place: main(desk),
    title: trendSeed.title,
    messages: trendSeed.messages,
    created: 2 * DAY - 60,
    updated: 45,
  });
  const radar = view("browser", [START_PAGE], RADAR_PAGE);
  write.store.saveShell(
    shell(
      [profit, trend],
      [
        [profit, view("canvas")],
        [trend, radar],
      ],
    ),
  );
  notify(write, 1, refunds, "Refund audit needs you: two refunds have no order number.", 30);
  notify(write, 2, trend, "Service desk weekly review is ready.", 45);
}

// A thread of `count` turns, a user question and the agent's answer by turns, a minute apart.
function manyTurns(write: Writer, count: number): ThreadMessage[] {
  return Array.from({ length: count }, (_, i) => {
    const n = Math.floor(i / 2) + 1;
    return i % 2 === 0
      ? userSays(write, `u${n}`, `How did week ${n} compare with the week before it?`, count - i)
      : agentSays(
          write,
          `a${n}`,
          `Week ${n} ran close to the week before, with the weekend carrying it.`,
          count - i,
        );
  });
}

// Region `n`, from 1: a project with an 80-character name, and its main thread with another.
function addRegion(write: Writer, n: number, messages: ThreadMessage[]): ThreadId {
  const name =
    n === 12
      ? `${LONG_WORD} for the month close`
      : `Region ${two(n)}: supplier invoices matched to deliveries across the northern warehouse`;
  const projectId = addProject(write, name, (13 - n) * DAY);
  const created = (13 - n) * DAY - 60;
  return addThread(write, {
    place: main(projectId),
    title: `Week ${two(n)} review: supplier invoices checked against deliveries in northern stores.`,
    messages,
    created,
    updated: messages.length > 0 ? 1 : created,
  });
}

// The pane the long scenario's tabs show, in turn.
function paneFor(tab: number): Pane {
  switch (tab % 3) {
    case 0:
      return "thread";
    case 1:
      return "browser";
    default:
      return "canvas";
  }
}

// Twelve projects and twelve tabs, 80-character names, one 60-character word, a main with nine
// children, a 120-turn thread, and twelve notifications.
function fillLong(write: Writer): void {
  const first = addRegion(write, 1, manyTurns(write, 120));
  const mains = [first, ...Array.from({ length: 11 }, (_, i) => addRegion(write, i + 2, []))];
  const children = Array.from({ length: 9 }, (_, i) =>
    addThread(write, {
      place: child(first),
      title: `Lane ${two(i + 1)}: why supplier invoices and deliveries disagree at the northern warehouse`,
      created: 300 - i * 10,
    }),
  );
  write.store.arrange(
    first,
    children.slice(0, 6).map((id) => threadLane(id)),
  );
  write.store.saveShell(
    shell(
      mains,
      mains.map((id, i) => [id, view(paneFor(i))]),
    ),
  );
  for (const [i, id] of mains.entries()) {
    const text = `Region ${two(i + 1)}: the weekly close is ready for review.`;
    notify(write, i + 1, id, text, 5 * (i + 1));
  }
}

// Each scenario by name (ADR-096): its fixtures, and the faults it meets. Thread-fails fails
// every open the page asks for, and the page never asks for a thread the snapshot counts no
// turns in, so a thread started there shows its welcome and fails on its first send instead.
const SCENARIOS: Record<ScenarioName, Scenario> = {
  demo: { faults: {}, fill: fillDemo },
  empty: { faults: {} },
  long: { faults: {}, fill: fillLong },
  loading: { faults: { start: "hold" } },
  failure: { faults: { start: { fail: "This scenario fails to start, on purpose." } } },
  "thread-fails": {
    faults: {
      open: { fail: "This thread could not be opened. The scenario fails every open." },
      send: { fail: "This reply could not be sent. The scenario fails every send." },
    },
    fill: fillDemo,
  },
};

/**
 * Gives a device store what every device held before the Live Playground: the Demo store
 * project and its `profit` main thread, the catalog's profit thread, with no lanes. A dev build
 * asks for it for the browser levers, which need a thread with a card on a store that survives a
 * reload. A store that already holds the thread is left alone, so running it again changes
 * nothing.
 * @throws When the store refuses the project or the thread.
 */
export function seedDemoStore(store: Store, at: string): void {
  const { projects, threads } = store.workspace();
  if (threads.some((thread) => thread.id === PROFIT)) return;
  if (!projects.some((project) => project.id === DEMO_PROJECT.id))
    store.addProject({ ...DEMO_PROJECT, createdAt: at });
  const { title, messages } = seedThread("profit");
  const place = main(DEMO_PROJECT.id);
  store.addThread({ id: PROFIT, title, place, createdAt: at, updatedAt: at, draft: "", messages });
}

/**
 * Opens a scenario (ADR-096) in a fresh in-memory store: its fixtures written through the
 * store's own calls, so they cannot hold what the schema forbids, with a mint that counts ids
 * and a stopped clock, so every load is the same. It never touches the device's database.
 */
export async function openScenario(name: ScenarioName): Promise<Opened> {
  const store = await openSqliteStore({ kind: "memory" });
  const mint = fixedMint(CLOCK);
  const { faults, fill } = SCENARIOS[name];
  fill?.({ store, mint });
  return { store, source: { kind: "scenario", name }, mint, faults };
}
