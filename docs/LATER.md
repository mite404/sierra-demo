# Later

Work we agreed is worth doing but have not started, kept in one place so nothing gets lost.
Each item says what it is and what it waits on; when one starts, it moves into an ADR, and it leaves
this list when it ships.

## Waiting on Ethan

Ethan reopened the live path (ADR-146): the gateway now streams from Kimi K2.6 through
OpenRouter, with `OPENROUTER_API_KEY` set as a Worker secret. The four items below are what
stands between that and a signed-in visitor getting a reply.

- **Deploy the Worker and register its address.** The share page and the thread now ship in the
  one Cloudflare Worker (ADR-086); creating it from the repo publishes under Ethan's account, and
  its address must join WorkOS's redirect URIs and CORS origins (ADR-084).
- **Let the first deploy create the SHARES namespace.** Share thread keeps sealed threads in a KV
  namespace bound as `SHARES`, declared with no id so Wrangler 4 provisions it on the first
  deploy under Ethan's account (ADR-131); the deploy log should show it created, once.
- **Share a thread from a signed-in build.** Making a thread public needs a signed-in visitor, so
  the lab build, which has no sign-in or share server, says "This build has no share server";
  the whole path is proven only against the gateway's app run in the lever with a stand-in token.
- **Check the token issuer against a real sign-in.** The gateway accepts the two issuer forms
  WorkOS documents; only a signed-in run shows which one this environment mints.

## Design

- **Move the remaining olive to ink.** The stepped slider, dictation controls, links and the primary
  button still use `--accent` (`#515e38`); moving them to ink leaves green only on button hovers
  (ADR-055, ADR-058).
- **Show my work as numbered steps.** Adopt the numbered-circle step list from the "Application
  simulator" screenshot, which fits the legibility story (ADR-036).
- **The row follows a carried lane.** A lane dragged to the pane's edge should scroll the row along,
  and a wheel mid-drag should move the drop slot with the row; today `lane-reorder.ts` measures
  every slot once, when the lane lifts (ADR-089). A carried card or highlight measures its landing
  on every move instead, but it does not scroll the row at the edge either.
- **A project name cut 22px early.** At rest an open project's row keeps room for its hidden
  chevron (14px plus the row's 8px gap), so nothing shifts when the pointer arrives and the chevron
  fades in; a long name meets its ellipsis that much before the row's end. The chevron could
  overlay the end of the name on hover instead. Waits on Ethan's call.
- **Try again, twice.** A failed start shows Try again in the sidebar, under "Your threads could
  not be opened.", and again in the body beside the reason. The sidebar could keep only its line
  of text and leave the button to the body. Waits on Ethan's call.
- **The active tab shows less of its title.** At a tab's 112px minimum the title is cut, and the
  active tab keeps 28px on its right for its close button while an inactive one gives that room
  back until the pointer is on it, so the tab you are on shows the least of its name. Waits on a
  design call: a wider minimum for the active tab, or a close that overlays the title's end.

## Engineering

- **Replies that produce cards.** The `Agent` seam still yields text only, so today's cards come
  from the seed thread and the scenarios' fixtures, and the lab stand-in answers a plain message
  with one scripted line (ADR-104). Next: the seam carries a card chunk, the worker declares the
  catalog as a tool, validates each `tool_use` with the catalog's schemas, and loops until the
  reply ends.
- **A keyboard path onto the canvas.** The carry has none; the Create blank thread button is the
  only keyboard route, and a "send highlight to canvas" action on the selection would give it one.
  Lane widths and order do have one: arrow keys on a gap resize the lane before it, and with
  Shift they move it.
- **A name of the lane's own for a card.** A card lane already stores a `title` beside its card in
  the `lanes` table, copied from the card when it lands, but `rename` takes only a project or a
  thread, and the card's header still shows its payload's title. Renaming it needs a lane target
  for `rename` and a header that shows the lane's title.
- **A blank moment leaving a thread.** Going from a thread to the Lab, following the Kay link, or
  closing the last tab shows an empty workspace for a few frames (5 to 16 measured) while the next
  route loads. Holding the old tab on screen until the route commits would bring a just-closed tab
  back through the visit, so it needs its own design; pointing the Kay link straight at the tab it
  returns to would remove one case.
- **One bad view resets every tab.** `parseShell` falls back to the first-run document when any
  view fails its schema, and the next save writes that over the user's tabs. The known way to
  write a bad view is fixed (an address is capped by its canonical length), but the fallback
  could keep the good tabs and drop only the bad view.
- **Focus after a failed start's Try again.** A restart remounts the whole window, so the button
  that was pressed is gone and the focus goes back to the page. Restarting below the window, or
  handing the focus to the tree, would keep it.
- **Run `auth-check.mjs` again.** `apps/web/scripts/auth-check.mjs` has only been syntax-checked
  since its browser setup moved into `harness.mjs`. Running it needs a web build with WorkOS
  turned on (`VITE_AUTH=workos` and a client id).
- **Make the catalog pass `noUncheckedIndexedAccess`.** Eight index reads in `interactive.ts` and
  `thread.ts` fail it, so `packages/runtime` keeps the flag off; the catalog should pass the
  shared base config.
- **Answer 503, not 401, when WorkOS's keys cannot be fetched.** A JWKS outage currently reads as
  "sign in again".
- **Transcripts as markdown files in OPFS.** ADR-081 has conversations saved as markdown and
  indexed in SQLite; the slice stores rows only, with an FTS5 index (ADR-088).
- **Two stories that still move between runs.** The dictation stories draw a simulated waveform
  from random samples, and `ReplyFails` types during its play function, so `shoot.mjs` can catch
  them mid-frame even under reduced motion; a seeded simulated source and a wait for the play
  function to finish would make every story byte-identical between runs.
- **Memoize the interactive card's chart.** Toggling "Show my work" re-renders the whole card, so
  Recharts swaps 14 SVG groups although the data is unchanged; memoizing the chart stops that. It
  moves no pixels, so it is tidying, not a fix (ADR-073).
- **Link Storybook to Figma.** Add `@storybook/addon-designs` so each story shows its Figma frame
  (node 20:2 in file `7CUcz6R7OEjSrfMcNW6A7D`).
- **Publish Storybook to Chromatic.** A shareable URL for the component lab, with visual diffs on
  each push.
- **Automate the Figma token watcher.** It only runs when someone fires it; a GitHub Action that
  triggers when `catalog-lab/src/tokens.css` changes would keep the Figma variables in sync on its
  own.

## Integration readiness

What would let Kay's team drop the lab into their TypeScript monorepo (see
`docs/05-kay-stack-and-data.md`).

- **Stop the global CSS from leaking.** `tokens.css` styles bare elements (`footer`, `button`, `a`,
  `body`, `*`); put it in a cascade layer and scope element rules under a root class, so it can live
  inside another app.
- **React as a peer dependency of the catalog.** It is `@yaklabs/catalog` in a pnpm workspace
  with an `exports` map now (ADR-087); a package Kay's monorepo installs would list React as a
  peer instead of a dependency.
- **Platform-aware shortcuts.** Show Ctrl on Windows where the lab says ⌘, for when Kay ships
  on Windows (macOS only as of 2026-10-01).
- **Tokens in a standard format** (DTCG JSON) alongside the CSS, for theming, plugins and the Figma
  sync.
- **Catalog schemas as JSON Schema**, generated from the zod schemas, so a harness can use them as
  tool definitions.

## Interview extras

Each one starts from a design decision and carries it one layer down, into a neighbouring role's
work; pick two or three. Cut by ADR-137: the catalog MCP server, the evaluation loop, the flame
graph and `MessagePort` agent, and the Cloudflare share deploy; only the first two below stay.

- **Visual regression and accessibility checks in CI** (Design Engineer: Infrastructure, which asks
  for "state catalogs, screenshot and visual regression tests, and accessibility checks in CI").
  Playwright screenshots across the Storybook states plus axe; the chosen day-4 extra (ADR-086), and
  it contains the next one.
- **A theme that fails contrast cannot ship** (Design Engineer: Infrastructure). ADR-065 as a test
  over every text and UI pair in every theme.
- **A catalog MCP server** (Developer Experience). `list_components`, `validate_card`,
  `preview_card`, so agents building UI use the design system correctly.
- **An evaluation loop** (AI Harnesses). Run a real model against the catalog, measure how often
  cards validate and where they fail, tighten the schema, show the rate improve.
- **A flame graph and a `MessagePort` agent** (Frontend). Before and after the chart memo, and the
  `Agent` seam streaming across a worker boundary.
- **Deploy the share page on Cloudflare** (Cloud Infrastructure), Kay's own edge.
