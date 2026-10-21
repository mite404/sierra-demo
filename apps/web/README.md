# web

The web version of the app (ADR-083): a React Router single-page app, built by Vite into
static files, that renders the catalog's thread with the profit card and its stepped slider.
The agent loop and the conversation store run in a Web Worker from `@yaklabs/runtime`
(ADR-076); the model sits behind `apps/gateway` (ADR-085).

## Routes

| Path                       | What it shows                                                        | Sign-in  |
| -------------------------- | -------------------------------------------------------------------- | -------- |
| `/`                        | The last tab shown, else a blank Live Playground thread              | required |
| `/t/:threadId`             | That thread's tab: a main beside its canvas, or a child's lane in it | required |
| `/lab`                     | The evaluation workbench: fixtures through the same validation       | required |
| `/playground`              | Redirects to `/t/playground`, the Live Playground's thread           | required |
| `/demo/weekly-brief`       | Redirects to `/t/demo-<script>` (`?script=`, else the brief)         | required |
| `/demo/weekly-brief/t/:id` | Redirects to `/t/:id`                                                | required |
| `/share.html`              | One shared card from the link's fragment (ADR-064)                   | public   |
| `/verify-ui-tooling`       | The design tooling page: what `verify-ui-drift` is for (ADR-160)     | public   |
| `/callback`                | Where WorkOS sends visitors back; the provider finishes sign-in      | public   |

Any signed-in route takes `?scenario=` (below), and every link inside the app keeps it. The
redirects keep only `?splash=`.

A fresh device starts with the Live Playground project and its one empty thread, open on the
thread layout, so the first visit lands on the welcome. On the device's data the scripted Demo
plays beside it: a Demo project whose three threads (`/t/demo-brief`, `/t/demo-interrupted`,
`/t/demo-returned`) play their scenarios in memory, with Play, 2x and Restart in a bar under the
title bar while one of them is on screen. Nothing of the Demo is kept; a reload starts it over.

## The window

The app draws itself as a desktop window (ADR-094): rounded on the page's ground, full-bleed
below 768px. The title bar runs its whole width: decorative traffic lights, the sidebar toggle,
the open threads as tabs with "New thread", then the data marker (where threads are kept), the
layout switch (Thread, Browser, Canvas), the bell and the account, which holds the title bar's look.
Below
it the sidebar (shadcn's `sidebar-16` pattern) opens to Kay, Documentation, Lab and the project
tree, and collapses to a 56px rail of places. A project row folds its main threads, a main's
count ("^ 2") folds its children, and the "+" starts a main in that project.

Every tab stays mounted once visited, inert and unpainted while hidden, so a reply, a draft and
the scroll survive a switch; closing the tab is what unmounts it (`src/shell/deck.tsx`). A tab
is a resizable pair: the main thread, then the browser or the canvas beside it, or the thread
alone. The tabs, each tab's layout and split, the browser's history and what has been read make
up the shell state (`src/shell/state.ts`), which the runtime keeps with the workspace.

On the canvas, drag a highlight out of the thread to start a child thread with the highlight
quoted in its compose box, or carry a card by its header to see it large in a lane of its own.
While a carry is over the canvas the whole pane shows it, and an ink marker stands in the gap it
would land in; open space always remains at the end of the row. The gap after a lane drags the
lane's width, a lane's title bar drags the lane to another place in the row (Escape puts it
back), and arrow keys on the gap resize the lane, with Shift moving it. A click on a thread's
title renames it. Lanes, their order and their widths live in the workspace through the
runtime's `arrange`, so thread and card lanes alike come back after a reload. The geometry is
`src/canvas.ts`, the surface `src/components/canvas.tsx`.

## Scenarios

`?scenario=<name>` runs the app on a deterministic mock store in memory instead of the
browser's own, and the data marker says which. The names are `demo` (two projects with threads,
lanes and notifications), `empty`, `long` (twelve projects and tabs, long names, a main with
nine children, a 120-turn thread), `loading` (a start that never finishes), `failure` (a start
that fails) and `thread-fails` (every open and send fails). An unknown name is refused with the
list of the valid ones.

A dev build can also seed the device itself, for the browser levers that need a thread with a
card on a store that survives a reload: with `localStorage["kay.seed"] = "demo-store"` set
before the page loads, the worker adds the Demo store and its `profit` thread ("Last week's
sales", at `/t/profit`) beside the Live Playground. A production build ignores the key.

"Required" applies only when the build has sign-in turned on (below).

## Settings

Copy `.env.example` to `.env` and set what the build should do. Vite exposes every `VITE_`
variable to the browser, so nothing here is secret.

| Variable                   | Values               | Meaning                                              |
| -------------------------- | -------------------- | ---------------------------------------------------- |
| `VITE_AGENT`               | `lab` (default), `gateway` | Who answers: the scripted stand-in, or a model   |
| `VITE_GATEWAY_URL`         | an origin, or empty  | Empty means the Worker that serves the site (ADR-086)|
| `VITE_AUTH`                | `none` (default), `workos` | Whether visitors sign in through AuthKit         |
| `VITE_WORKOS_CLIENT_ID`    | the WorkOS client id | Needed with `workos`                                 |
| `VITE_WORKOS_REDIRECT_URI` | a URL                | Needed with `workos`; must be registered in WorkOS   |
| `VITE_DEMO`                | `on` (default), `off` | Whether the scripted Demo plays beside the device's threads |

`src/env.ts` parses them once into a shape with no half-set states, so a contradiction fails
at start rather than on the first sign-in.

## WorkOS

The WorkOS environment needs the callback registered as a redirect URI and the site's origin
as a CORS origin, both under User Management. For local work these are
`http://localhost:5173/callback` and `http://localhost:5173`. On localhost AuthKit runs in
dev mode and keeps tokens in `localStorage`; elsewhere it uses its cookie-based refresh.

## Run

```sh
pnpm dev:web                 # from the repo root, http://localhost:5173
pnpm --filter web typecheck  # React Router typegen, then tsc
pnpm --filter web test       # the env parser
pnpm --filter web build      # build/client, served by the gateway Worker as static assets
```

## Styling

`src/index.css` loads shadcn's globals from `@yaklabs/ui` and Kay's `tokens.css` in a
`catalog` cascade layer between Tailwind's preflight and its utilities, so the catalog keeps
its element styles while a class on a shadcn primitive still wins (ADR-082). Where the catalog
styles a bare `button` or `a`, the components layer puts preflight back for any element shadcn
renders (it carries a `data-slot`), so a shadcn control shows only its own classes. The theme is
the root's `data-theme`, light or dark (Umbralkai, ADR-162): `src/theme.ts` sets it before React
loads from the account menu's choice, or from the system's when the visitor has none, and the
root's `color-scheme` follows it. The design tooling page holds it on light while open.

## Prove it in a browser

Three scripts drive the app in headless Chromium and exit 1 on any failed step, with screenshots
and a `results.json` in the output directory (`.artifacts/web/<stamp>/` by default).

```sh
rm -rf apps/web/node_modules/.vite              # optional: start from a cold Vite cache
pnpm dev:web                                    # in one terminal
node apps/web/scripts/web-check.mjs             # card, slider, reply, chip, reload, routes
node apps/web/scripts/auth-check.mjs --base http://127.0.0.1:5174   # against a WorkOS-mode server
node apps/web/scripts/workspace-check.mjs       # P1-P12: carry, canvas, sidebar, tabs, window
```

`web-check.mjs` proves the vertical slice: the profit card renders, the slider reaches Net profit,
the reply names that view, the sent message carries the chip, and every turn survives a reload
from SQLite in the browser's private file system. `auth-check.mjs` proves the sign-in gate: a
signed-out visit leaves for WorkOS with the registered callback and the wanted path in `state`,
while `/share.html` and `/callback` stay public. `workspace-check.mjs` measures the projects,
sub-threads, shell and carry contract, each check in its own browser context; its P8 reads
Storybook on port 6106. The last results and screenshots sit in `docs/trail/evidence/`.
