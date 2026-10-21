# @yaklabs/runtime

The slice's stand-in for Kay's daemon (ADR-076). A Web Worker owns the agent loop and the store;
the page talks to it only through messages, and both directions are checked with zod on arrival
(ADR-086). Threads live in SQLite in the browser's private file system (OPFS), so they never leave
the device (ADR-075, ADR-081). Mock scenarios run on a store in memory and never touch it
(ADR-096).

```mermaid
sequenceDiagram
  participant P as Page
  participant R as runtime.ts (page side)
  participant W as Worker (agentLoop)
  participant S as SQLite
  P->>R: runtime.arrange(mainId, lanes)
  R-->>P: state() shows the new lanes at once
  R->>W: arrange { requestId, mainId, lanes, base }
  W->>S: keep lanes added since base, replace the rest (one transaction)
  W-->>R: state { source, workspace, replying }
  W-->>R: done { requestId }
  R-->>P: state() is the worker's again; the promise settles
```

## Starting it from an app

```ts
import { locate, startRuntime } from "@yaklabs/runtime";

// Once per page. "lab" runs the catalog's scripted stand-in; "gateway" calls the model.
const runtime = startRuntime({
  agent: { kind: "gateway", baseUrl: window.location.origin },
  data: { kind: "device", legacy: { hidden, order } }, // or { kind: "scenario", name: "demo" }
});

// useSyncExternalStore(runtime.subscribe, runtime.state) in React.
const state = runtime.state(); // starting → ready { source, workspace, replying }, or broken
if (state.kind === "ready") {
  const place = locate(state.workspace, "profit"); // → { main, focus } | undefined
}
const messages = await runtime.open(threadId); // one thread's turns
const agent = runtime.agent(threadId, { getAccessToken }); // AuthKit's (ADR-084)
```

`baseUrl` must be absolute: the worker resolves it, and the gateway sits on the page's own origin
under `/api` (ADR-086). `runtime.dispose()` stops the worker and fails whatever still waits.

The consuming app's Vite config needs these lines. This package's own `vite.config.ts` has the
same settings for its tests:

```ts
export default defineConfig({
  optimizeDeps: {
    // Required: sqlite-wasm loads sqlite3.wasm from beside its own module, and pre-bundling
    // would move the module away from it.
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: { format: "es" },
});
```

The `opfs-sahpool` storage mode needs no cross-origin isolation headers, so no COOP or COEP setup
is needed. ADR-081 has the page ask the browser to keep the data with
`navigator.storage.persist()`; that call is the app's to make, because Firefox shows a prompt.

## The workspace

`src/workspace.ts` is pure and the page imports it. Its types derive from its zod schemas, so the
wire check and the page's types cannot drift.

- Ids are branded: `ProjectId`, `ThreadId`, `LaneId`. Only the worker mints project and thread
  ids; the page mints card lane ids with `newCardLaneId()`. A thread lane's id is always
  `l-<threadId>`.
- A thread's `place` is `{ kind: "main", projectId }` or `{ kind: "child", parentId }`, one level
  deep, and never changes.
- `lanes` maps each main thread to its canvas, left to right. A closed lane is an absent lane: the
  child stays in the sidebar, and `reopenLane` appends it again.
- `shell` is the page's own JSON, kept whole and never read by the runtime; `null` until the page
  saves one.

The page's helpers are total and never throw: `sidebarTree`, `locate`, `latestMain`, `lanesOf`,
and the lane edits `insertLane`, `moveLane`, `closeLane`, `reopenLane` and `resizeLane`. Each edit
is idempotent, and its result is what the page passes to `arrange`. `titleFor` and `quoteFor`
turn a dropped highlight into a child's title and opening draft.

## The handle

`startRuntime` returns one observable state and the verbs that change it.

- `state()` is `starting` (with the source once the worker's `opening` arrives), `held` while
  another tab has the device's database, `ready`, or `broken` for good. It is the same object
  until something changes.
- `create` resolves to the new id once `state()` already lists it, because the worker pushes the
  state before it answers.
- `rename`, `arrange` and `saveShell` show in `state()` at once. The edit drops when its answer
  comes: by then the worker's state holds the write, or the write was refused and the promise
  rejects, so a refusal rolls itself back.
- `arrange` sends `base`, the main's lane ids as `state()` showed them when it was called. The
  worker keeps any lane added since (a child whose `create` was still in flight) beside its
  neighbour, so an arrange computed from a stale `state()` never closes it. The page's overlay
  merges the same way (`mergeLanes` in `src/workspace.ts`).
- A malformed notice, a worker that fails to load, a `broken` notice or `dispose()` breaks the
  runtime: every call still waiting fails, and so does every later one.

## The protocol

`src/protocol.ts` holds the zod schemas; it stays private to the package. The catalog's shapes
(`AgentEvent`, `CardAttachment`, `SharedCard`) are typed against the catalog's own types, so a
field the catalog adds as required, or retypes, fails to compile here. `threadMessageSchema` is
held equal to `ThreadMessage` in both directions by `protocol.test.ts`, and the reply seam's
schemas (`replyChunkSchema`, `blockSchema`, `workSchema` and the rest, in the catalog's
`reply.ts` and `prose.ts`) to their types by `reply.schemas.test.ts`, because a field a schema
lacks is silently dropped from every turn the store reads back.

| Command (page to worker)                            | Answered with                      |
| --------------------------------------------------- | ---------------------------------- |
| `init { agent, data }`                              | `opening`, then `state`            |
| `open { requestId, threadId }`                      | `opened { requestId, messages }`   |
| `create { requestId, item }`                        | `state`, then `created { id }`     |
| `rename { requestId, target, name }`                | `state`, then `done`               |
| `arrange { requestId, mainId, lanes, base }`        | `state`, then `done`               |
| `saveShell { requestId, shell }`                    | `state`, then `done`               |
| `send { requestId, threadId, event, accessToken? }` | `state`, `chunk`s, `state`, `done` |
| `abort { requestId }`                               | nothing; the reply stops           |

- Any request can answer `failed { requestId, reason }` instead, and only that request fails.
- `broken { reason }` is for what no request caused: a failed start, or a command so malformed it
  names no request.
- `opening { source }` goes out before a scenario opens, so a scenario that fails to load still
  names itself. On the device it goes out once the store has opened and its storage is known.
- `held` goes out on the device when another tab has the database; `opening` follows once that
  tab lets go.
- `state { source, workspace, replying }` is pushed after `init` and after every write, a reply's
  start and end included, and skipped when its serialized form equals the last one pushed.
- `chunk { requestId, chunk }` carries one `ReplyChunk` as the agent yielded it: words, or an
  event around them (ADR-147). The page's `Agent` yields it on as it came, so the thread panel
  folds a worker's reply exactly as it folds an in-memory agent's.
- One `Map<requestId, sink>` in the page routes every answer.

## The worker's contract

- `init` on the device waits for the database's lock, then opens `yaklabs` in OPFS, migrating it
  with the v1 canvas keys the page sent. Only a refused file system (`StorageUnavailableError`)
  falls back to memory, with a `console.warn`. A file that opened but cannot be read or migrated
  (say, a version newer than this build) is closed and breaks the start with its reason, so the
  page offers Try again rather than a fresh starter over threads that are hidden but intact. An
  empty device store gets the Demo store project and its `profit` thread from the catalog's
  seed. A second `init` does nothing.
- `send` saves the user's turn first, so a failed reply never loses what the user sent, and spends
  the thread's draft. A `message` becomes a user turn with its `attachments` and its `files` as
  `{ id, label }`, an `answer` becomes a user turn with its text and the `question` it answered
  (the wording of the question the last reply asked, when the catalog's check would dock it), and
  `question-rejected` adds no user turn (ADR-040).
- Each chunk the agent yields is folded into the agent's turn with the catalog's `applyChunk` and
  posted as a `chunk`; a `failure` event ends the turn, and nothing the agent says after it is
  read. The turn is saved when the stream ends, complete, or when an `abort` stops it, cancelled
  with its running steps. It keeps the fold's `blocks`, `work`, `ended`, `failure` and `asks`, so
  `open` answers the reply as it was shown. A turn that showed nothing is not saved, and a stream
  that throws saves no turn and answers `failed`.
- New turns take `u<n>` and `a<n>` ids, one past the highest number each role already uses, so
  the seeds' u1/a1, u2/a2 pairing carries on.
- Every new id and instant comes from the `Mint` (`src/mint.ts`): random ids and local turn times
  on the device, counted ids (`t-001`) and a stopped clock with UTC turn times in a scenario.
- The lab agent is `createLabAgent()` from `@yaklabs/catalog/labAgent`. The live agent
  (`src/playgroundAgent.ts`, ADR-155) is the model with tools behind the gateway. It keeps
  nothing between replies: it reads the thread's turns, leaves out the user turn the worker just
  saved (the event carries it), projects them into a request with `planRequest`, posts it to
  `/api/playground` with `Authorization: Bearer <token>`, and folds the NDJSON events into the
  seam's chunks with `receive`, so the thread shows Work details, cards, limitations and the
  question dock. Every failure is a terminal `failure` in plain words from one copy table
  (`src/playgroundCopy.ts`), never a status or a body; only Stop ends a reply quietly.

`planRequest(history, event)` (`src/playgroundRequest.ts`, pure) is the whole memory of a live
thread. User turns open exchanges and the reply after one settles it; its words, cards (by id,
else position), done steps, limitations and a short end's cause become the exchange; a docked
question pairs with its answer by position, and a later message after an open question is a
`say`, which the gateway reads as a skip. An attempt that showed nothing is dropped, so Try again
sends the identical request. The newest 49 exchanges are kept, and the whole request is checked
with the gateway's request schema before it is sent.

`receive(state, event)` (`src/playgroundReply.ts`, pure) reads protocol 2: a replayed `seq` is
ignored, a gap ends the reply cut off, and a `start` of another version ends it naming the
mismatch. Text streams through a Markdown emitter (`src/markdownEmitter.ts`) that yields closed
lines as blocks and, inside the open line, the words up to the last space before anything still
unclosed, so nothing shown is taken back and the whole block lands exactly as
`parseQuietProse` (`src/markdown.ts`) reads it. A limit or a stopped upstream ends the reply with
its line as a terminal failure, running steps cancelled first.

Only one worker at a time can hold a database's OPFS pool, and sqlite-wasm answers a failed
install by deleting the whole pool (ADR-118). So a device worker first takes the Web Lock
`yaklabs-database` and keeps it for its life: a second worker (a second tab, say) posts `held` and
waits in line, then opens the same file once the first lets go. The store also holds a file inside
the pool's own directory for as long as its worker lives, so the installer's clean-up can never
delete the pool. Only a browser that refuses the file system, or has no Web Locks, falls back to
memory. The page clears the v1 canvas keys only after a `state` from `{ device, opfs }`, so a
memory fallback never loses them.

## The store

`src/store.ts` is the contract and `src/sqliteStore.ts` the one adapter: SQLite through the
`opfs-sahpool` VFS (only inside a Worker), or `:memory:` for scenarios, tests and the fallback.
Its calls are synchronous, as SQLite's are, so a read-modify-write never interleaves with
another, and each write is one transaction.

`src/schema.ts` owns the schema and its migrations, one step per `user_version`. Each step runs in
one transaction that bumps the version only after `foreign_key_check` finds nothing, so a crash
rolls the step back and the next open reruns it. Foreign keys are off during a step, since the
pragma does nothing inside a transaction.

- 0 → 1 is the v1 schema: `conversations`, `messages`, and `messages_fts`, an external-content
  FTS5 table kept in step by triggers.
- 1 → 2 rebuilds `conversations` with `created_at`, `project_id`, `parent_id` and `draft`, and
  `check ((project_id is null) <> (parent_id is null))`, then adds `projects`,
  `lanes (main_id, seq, id, thread_id, card_json, title, width)`, `shell` and `notifications`.
  Triggers hold what a check cannot: depth one (a child's parent is a main that already
  exists, so never itself), fixed places, and a thread lane on its own main.
  `planV2(rows, legacy)` is the step's whole policy: `profit` becomes the Demo store's main and
  every other conversation its child; the children the v1 canvas did not hide become its lanes,
  in its order, then oldest first.

Search takes every word of the query as a prefix, ignoring case and accents, and finds threads
with a message that holds them all, newest first.

## Scenarios

`src/scenarios.ts` is imported by the worker only when a scenario is asked for. Each one fills a
fresh `:memory:` store through the store's own calls, so a fixture cannot hold what the schema
forbids, and always answers with the lab agent. Loading one twice gives byte-identical state.

| Scenario       | What it holds                                                              |
| -------------- | -------------------------------------------------------------------------- |
| `demo`         | Demo store (profit with two children, one closed, and a card lane; Refund  |
|                | audit) and Service desk (trend). Two tabs, canvas and browser. Two notices |
| `empty`        | Nothing                                                                    |
| `long`         | 12 projects with 80-character names, one 60-character word, a main with 9  |
|                | children, a 120-turn thread, 12 tabs, 12 notifications                     |
| `loading`      | Holds after `opening`, forever                                             |
| `failure`      | Breaks at start, with its reason                                           |
| `thread-fails` | The demo, with every `open` and `send` failing                             |

The demo's tabs browse `https://start.example/` and `https://weather.example/radar`, the page's
simulated pages.

## Tests

```sh
pnpm --filter @yaklabs/runtime test        # both projects
pnpm --filter @yaklabs/runtime typecheck
```

- `unit` runs in node: the workspace helpers, the mint, the protocol, the schema and `planV2`, the
  store in `:memory:`, the scenarios, the Markdown emitter, the live agent's fold and request
  projection, the live agent against the gateway's real playground route and its test kit,
  through the agent loop, and the agent loop, faults included.
- `browser` runs in headless Chromium through `@vitest/browser-playwright`: the store in real OPFS
  across workers, Ethan's v1 database migrated, rerun and recovered from a crash inside the step
  (through `src/sqliteStore.testWorker.ts`, since OPFS's fast mode exists only in a Worker), and
  the full handle through `startRuntime` on the device and in scenarios.

`tsconfig.json` turns `noUncheckedIndexedAccess` off because the catalog's sources compile inside
this program and do not pass it yet. This package's own files do: check with
`npx tsc --noEmit --noUncheckedIndexedAccess true` and look only at `src/` lines.
