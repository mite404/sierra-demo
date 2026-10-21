---
name: verify-storybook-component
description: >-
  Prove a UI component change in yaklabs by driving its Storybook stories in a real browser.
  Launches a private Storybook for the catalog package, lists the stories a change can affect, renders
  them with screenshots and ARIA trees, and runs the story test suite (render, play functions,
  axe). Use after editing anything in packages/catalog/src or apps/storybook/.storybook, before claiming a
  component works, and when asked to verify, screenshot, or QA a component.
---

# Verify Storybook

The only surface in scope is the Storybook for `packages/catalog/`, hosted by `apps/storybook/`
(React 19, Vite 8, Storybook 10). The web app in `apps/web/` renders the same components on its
routes (the thread, the workbench at `/lab`, the share page at `/share.html`); those routes are not
driven here, their components are covered through stories.

A story is the unit of proof. Every component a user sees renders through at least one story, and
`pnpm test` renders all of them in headless Chromium. This skill adds what the suite cannot tell
you: which stories your change reaches, what they look like, and whether an interaction you care
about actually works.

## Gate: what is already proven without a browser session

Run these first. They are cheap, and nothing below re-proves them.

| Tier | Command (from repo root) | Runs in |
| --- | --- | --- |
| Format | `pnpm format:check` | CI; pre-commit formats staged files via Lefthook |
| Markdown wrap at 100 columns | `node scripts/wrap-md.js <file.md>` | pre-commit (staged `.md`) |
| Lint, incl. jsx-a11y and type-aware rules | `pnpm lint` | CI; pre-commit lints staged files |
| Types | `pnpm typecheck` | CI |
| Unit tests (69, node) | `pnpm test:unit` | CI |
| Story tests: every story renders, play functions pass, axe finds no violations | `pnpm test:stories` | CI |
| Storybook builds | `pnpm build-storybook` | CI |
| New dead code, complexity, duplication in changed files | `pnpm fallow audit --base HEAD` (this commit) or `pnpm fallow audit --base origin/main` (this branch) | CI uses the PR base |

- `oxlint` runs type-aware (`options.typeAware` plus the `oxlint-tsgolint` package), but it does not
  fold in `tsc` diagnostics, so `typecheck` is a separate tier, not a redundant one.
- `fallow audit` fails only on findings the change introduces. The full `pnpm fallow` report
  exits 1 today on an inherited health backlog (large or complex functions in `ChatThreadPanel`,
  `DictationModal` and others). That backlog is not a gate; do not "fix" the gate by baselining it.
- There is no visual-regression tier. Axe checks contrast and semantics, not layout. Pixels are
  proven only by the screenshots this skill captures and a human or agent comparing them.

## Launch

```bash
.agents/skills/verify-storybook-component/scripts/control-storybook.sh launch
```

Ready when it prints `storybook: ready at http://127.0.0.1:6106/`. It clears Storybook's build
cache first, so every run serves the sources as they are now; a server left over from an earlier
session once served the catalog as it was then, and a before/after comparison compared the old code
with itself. It starts
`storybook dev` on port 6106 (not 6006, so a human's `pnpm storybook` is untouched), refuses to
start if a previous run's pid is alive or the port is taken, and waits for `/index.json` to list
this repo's stories. For a second concurrent run, set both `VERIFY_RUN_ID=<name>` and
`VERIFY_PORT=<free port>`; state lives in `/tmp/yaklabs-storybook-verify-<run id>/`.

## Doctor

```bash
.agents/skills/verify-storybook-component/scripts/control-storybook.sh doctor
```

`storybook doctor: OK` with `stories: 40` (or the current count) means the pid is ours, the port is
ours, and the index contains `foundations-button--default`. Run it whenever a page looks stale,
blank, or unfamiliar. A 200 from someone else's Storybook fails the content check.

## Bound the change

`packages/catalog/src/` is flat, so a directory does not bound a change; the import graph does. List
every story a change can reach:

```bash
node .agents/skills/verify-storybook-component/scripts/affected-stories.mjs --since main
node .agents/skills/verify-storybook-component/scripts/affected-stories.mjs packages/catalog/src/Menu.tsx
```

It follows fallow's impact closure, so editing `Menu.tsx` lists 32 stories (every card has a share
menu), not the 3 in `Menu.stories.tsx`. Edits to `.storybook/`, `tokens.css` or `primitives.css`
list every story. That list, together with the feature map, is the coverage set. Proving one
convenient story when the list names thirty is a sample, and reporting it as verified is wrong.

## Drive

Three harnesses, for three jobs.

**Render proof for many stories** (screenshot, ARIA tree, console errors):

```bash
node .agents/skills/verify-storybook-component/scripts/shoot.mjs \
  $(node .agents/skills/verify-storybook-component/scripts/affected-stories.mjs --since main)
```

Each story prints `PASS <id>` or `FAIL <id>` with the reason, then the paths of
`<id>.png` and `<id>.aria.yml`. FAIL means the story threw, logged `console.error`, showed
Storybook's error overlay, or rendered nothing. Pass `--width 420` for the narrow layouts and
`--theme dark` to shoot under `data-theme="dark"` (ADR-090); shoot both when a change touches
tokens. Shots are taken under reduced motion, so a chart's grow and the waveform's sweep never
land mid-frame: two runs of the same code are byte-identical, and a byte difference is a change.

**Interaction proof** (click, type, open, close): encode it as a `play` function in the story, then
run `pnpm test:stories`. A play function is proof that reruns in CI forever; a manual click is
proof once. Use `storybook/test`:

```tsx
import { expect, userEvent, within } from "storybook/test";

export const ShareMenuOpens: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Share this card" }));
    await expect(canvas.getByRole("menuitem", { name: "Copy public link" })).toBeVisible();
  },
};
```

**Controls proof** (every knob in the Controls panel does something):

```bash
node .agents/skills/verify-storybook-component/scripts/audit-controls.mjs [story-id...]
```

It moves every visible control on every story (or the ones named) and checks that the story's
DOM and pixels change; it exits 1 on a `DEAD` control. Run it after adding a story or a prop,
and before claiming the Storybook is ready to show anyone: an agent wrote these stories, and
Storybook infers a control for every prop, so a control's presence proves nothing. Keep only
controls a viewer can turn and see; hide the rest with `table: { disable: true }` (which drops
the row; `control: false` leaves an empty one). Give every kept control an explicit starting
value, or it shows as an empty radio or a "Set boolean" button. A control whose effect needs a
click or a drag is declared on its story as
`parameters: { controlsAudit: { onInteraction: ["placement"] } }` and printed as
`CHECK BY HAND`: open the menu or drag the card, and see it. `VERIFY_CHROMIUM=<path>` points it at
a local Chromium when Playwright's own build is missing.

To explore before writing the play function, drive a story's standalone page in a browser tool:
`http://127.0.0.1:6106/iframe.html?id=<story-id>&viewMode=story`. In Claude Code use the
`mcp__chrome-devtools__*` or `mcp__mcp-server-playwright__*` tools; in Cursor use
`cursor-ide-browser`.

Handles: use ARIA roles and accessible names, which the feature files list per story (for example
`button "Share this card"`, `textbox "Message"`, `dialog "Listening 0:00"`). Never use CSS classes,
nth-child, or coordinates; the stories render the same components in several layouts.

## Evidence

- Artifacts go to `.artifacts/verify-storybook-component/<timestamp>/` at the repo root
  (gitignored).
  `shoot.mjs` writes there by default; pass `--out` to group a before/after pair.
- AGENTS.md requires a screenshot before and after when you touch a component. Run `shoot.mjs`
  on the affected stories before editing (`--out
  .artifacts/verify-storybook-component/<task>/before`) and
  again after (`.../after`), then compare each pair. Report every visual difference and whether it
  was intended.
- Proof is the user path: the story renders the real component with real props and fixtures. The
  one production boundary this surface mocks is the agent, `labAgent` stands in for a model and is
  the only acceptable stand-in. Do not stub a component, a hook, or `fetch` inside the component
  under test to make a story pass.
- An interaction proof names the action and the end state (`clicked "Share this card", menu
  "Share this card" lists "Copy public link" and "Open public page"`), not just a final screenshot.
- Browser APIs the headless run cannot grant (microphone, screen capture, clipboard permission)
  are unreachable here. Report them as verified-unreachable with the reason; do not report the
  simulated story as proof of the live path.

## Cleanup

```bash
.agents/skills/verify-storybook-component/scripts/control-storybook.sh stop
```

It kills only the pid this run recorded. Never `pkill storybook` or `killall node`: the user may
have their own Storybook and dev servers open. Evidence in `.artifacts/verify-storybook-component/`
survives
cleanup; confirm the files are still there before reporting.

## Feature map

[`features/README.md`](features/README.md) indexes the user-facing features with their stories,
entry points, handles, and gotchas. The map, not convenience, defines what a change must cover.
Keep it current with `/maintain-verification-skill` when stories or components change.
