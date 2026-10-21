---
name: create-verification-skill
description: "Generate a project-local verification skill that drives your app the way a user does
— any language, framework, or platform. Use for /create-verification-skill, \"make a control skill
for this repo\", or when a project has no scripted way to prove UI/CLI/service behavior."
---

# Create a verification skill

Every serious project needs a scripted way to drive the real app and prove behavior: launch it,
exercise a feature the way a user would, and capture evidence. This skill generates that as a
project-local skill (`.agents/skills/verify-<app>/`) tailored to the repo. You write the generator's
output for the next agent, not for a human: it will be read cold, mid-task, by an agent that has
never seen the app.

## 1. Interview the repo, not the user

Answer these from the codebase and only ask the user what you cannot observe:

- **Surface:** what does a user actually touch? A web UI, a CLI/TUI, a desktop app, an API, a mobile
  app, a library? A repo can have several; pick the primary one and note the rest.
- **Run:** how does the app start locally? Prefer the repo's own documented dev command (package
  scripts, Makefile, README quickstart). Note ports, env vars, seed data, auth.
- **Drive:** how can an agent interact with it programmatically? Existing harnesses first —
  Playwright/Cypress specs, expect scripts, PTY helpers, curl-able endpoints, a debug port. Only
  then pick a generic recipe: browser/CDP for web and Electron, a tmux/PTY harness for CLI/TUI,
  plain HTTP for services.
- **Observe:** what evidence can be captured? Screenshots, terminal transcripts, response bodies,
  logs, exit codes, DB state.
- **Bound:** given a change, can you compute what it affects? If a feature owns a directory, the
  coverage set falls out of the file tree. If features are branches inside shared files, say so in
  the generated skill: an unbounded coverage set means the map will be a sample, and a sample
  reported as a sweep is a lie.
- **Cheap layers:** what do the formatter, type checker, linter, and changed-code analyzer already
  prove without a running instance, and where does each of them run? A generated skill that
  re-proves those spends a live session on work already done. This one has enough traps to be its
  own step; see [Map the mechanical tiers](#2-map-the-mechanical-tiers-before-you-script-anything).
- **Isolate:** can two instances run side by side (ports, data dirs, profiles)? If not, say so in
  the generated skill: refusing to double-drive a shared instance beats corrupting the user's
  session.

If the checkout doesn't build or start as-is, fix that first (or report it precisely) before
generating; a skill written against a broken base teaches wrong steps. When an irrelevant missing
asset blocks startup (a static dir the API never serves, a sample config), the generated skill may
create it, clearly marked as verification scaffolding, and remove it in cleanup.

## 2. Map the mechanical tiers before you script anything

Driving the app is the expensive half of verification. The cheap half is everything a tool proves
with no instance running: formatter, type checker, linter, test suite, and a changed-code analyzer
such as `fallow audit`. Before generating anything, write down every tier this repo has, its exact
command, and where it runs. There are only three answers to "where": wired into a hook, wired into
CI, or not running anywhere.

Identify the toolchain before naming commands, because two stacks own the same jobs under different names. `eslint.config.js` (or `.eslintrc*`) beside `.prettierrc` is an ESLint/Prettier repo: lint, format, and `tsc --noEmit` are three separate tiers. `.oxlintrc.json` beside `.oxfmtrc.json` (or `oxlint.config.ts` / `oxfmt.config.ts`) is an OXC repo, and the tier map is a different shape:

- `oxlint` owns lint, `oxfmt` owns format. Rules are namespaced `typescript/no-floating-promises`, not `@typescript-eslint/...`, and the schema follows ESLint v8 eslintrc rather than flat config, so an ESLint config cannot be read across.
- Type-aware rules need `options.typeAware: true` in the ROOT config AND the `oxlint-tsgolint` package. Without the package the run aborts with `Failed to find tsgolint executable`, so a config that reads as strict may be enforcing nothing. Check the dependency, not the flag.
- `options.typeCheck: true` folds `tsc` diagnostics into the lint run, collapsing two tiers into one. Where a repo sets it, a separate `tsc --noEmit` is a redundant tier rather than a missing one. The generated skill should say which, because "there is no typecheck step" is wrong here in a way that reads correct.
- Both linters can run during a migration. Then ownership per rule is the question: `eslint-plugin-oxlint` reads `.oxlintrc.json` and disables the overlapping ESLint rules. If it is not wired, rules are either double-reported or, worse, switched off in ESLint and never picked up by oxlint.

The two toolchains also differ in how much a config can be trusted by reading it. oxlint REJECTS an unknown rule name (`Rule 'x' not found in plugin 'typescript'`), so running it once validates the config. oxfmt SILENTLY ACCEPTS unknown option keys, so a typo'd format option does nothing and never says so. Run each once regardless; the reading is not the check. A validated teaching-strict starting pair, with the measurements behind its severities, is in [`references/oxc-config-example/`](references/oxc-config-example/).

Then check the three things that both agents and humans get wrong about a tier:

- **Is it green right now?** Run it. A check that fails on arrival is not a layer, it is noise the
  reader learns to scroll past, and the first thing they do is drop it from the gate. If it is red
  for reasons outside the change in hand, either fix it or scope it out deliberately, and have the
  generated skill name the excluded population and the reason. "`tsc` is clean except `convex/`,
  which is a sketch of a backend we consume and never redeploy" is a boundary a reader can act on. A
  bare green checkmark over a suppressed failure is not.
- **Does a tier the reader assumes exists actually exist?** This is the invisible one. "Lint and
  types are handled in CI" makes a thin pre-commit hook look deliberate rather than incomplete, and
  nothing in the repo contradicts it until someone checks for the workflow file and finds none.
  Verify by reading config, not by reading intent. When a tier is missing, the generated skill says
  so outright in one line, because a gap the reader does not see gets filled with an assumption.
- **Does it answer the question its position implies?** One analyzer returns different verdicts from
  different base refs, and the base is usually invisible in the command. `fallow audit --base HEAD`
  asks "does this commit introduce a finding?" `fallow audit --base "$(git merge-base @{upstream}
  HEAD)"` asks "does this branch?" Put the branch-wide question at commit time and every commit
  after the first re-reports the whole branch's backlog, so the gate starts blocking work unrelated
  to the edit in hand and gets routed around with `--no-verify` inside a day. The generated skill
  names the base ref, not just the tool.

Whatever the mechanical tiers prove, the generated skill does not re-prove by driving the app. State
that boundary by listing the tiers and their commands, so a reader deciding whether to launch an
instance can see what is already covered and what only a live run can catch.

## 3. Generate the skill

Write `.agents/skills/verify-<app>/SKILL.md` with YAML frontmatter (`name: verify-<app>` and a
`description` that names the app, the surface, and when to reach for it — without frontmatter the
skill never registers) and these sections, each grounded in what the interview actually found (no
placeholders left):

- **Launch:** the exact command that starts the app for verification, and how to tell it's ready (a
  log line, a port answering, a prompt). Include teardown. For a short-lived CLI or TUI there is no
  server to keep alive: launch means build the binary (or install deps) once, then start each drive
  in its own isolated PTY or tmux session.
- **Doctor:** one read-only check that answers "is this instance worth driving?" — process up,
  right version/build, port owned by us, auth valid. An agent runs this first whenever anything
  looks off.
- **Gate:** the mechanical tiers from step 2, each as a copy-pasteable command with its base ref,
  grouped by where it runs, plus a one-line statement of any tier that does not exist here. This is
  what the reader runs before spending a session on a live instance, and it is what stops them
  re-proving by hand what a type checker already settled. Documenting a missing tier is this
  skill's job; wiring one is not. Point the user at `/setup-pre-commit` to install the hook, and
  check first that it matches the toolchain: a Prettier-shaped installer will happily add a
  second formatter to an OXC repo and win, because lint-staged is what actually runs.
- **Drive:** the harness recipe with real selectors/commands from this repo, not examples. Prefer
  stable handles (ARIA labels, data attributes, prompt strings, route paths) over coordinates and
  tab order.
- **Evidence:** what to capture for a proof and where it goes. State the proof standards: exercise
  the real user path, not internal setters or test-only endpoints; capture the action and the
  resulting state, not just the final screen; verify side effects (files written, rows inserted,
  messages sent) alongside what's visible; mocks only where a production boundary already isolates
  the external system. When the safe path is a dry-run or test mode, verify what it actually skips
  by observing (files, network, git refs) rather than trusting its name: some dry-runs still touch
  the network or open a browser.
- **Cleanup:** how to tear down instances the run created. Never kill by process name; kill what you
  started. Cleanup removes instances and scratch state, never the evidence: proof artifacts survive
  the teardown, in a location the skill names.
- **Helpers:** any script the skill ships is executable and its invocation is shown in the skill
  body. A helper the reader has to reverse-engineer is not a helper. For a repo whose app is a
  long-running server, start from
  [`references/control-server.sh.example`](references/control-server.sh.example) rather than writing
  process handling from scratch: it already refuses to double-launch, refuses a busy port, asserts
  on page content rather than a bare 200, and kills only the pid it recorded. Fill its CONFIG block,
  keep the four `..` in `ROOT` intact, and delete what the repo does not need.

## 4. Seed the feature map

Create `.agents/skills/verify-<app>/features/README.md` plus one file per user-facing feature you
can identify (aim for the top 3-5 to start, from routes, commands, menus, or docs). Follow the shape
in [`references/feature-map-example/`](references/feature-map-example/), with a README index and one
file per feature. Each file answers, from the user's point of view: what the feature is, how to
reach it, how to drive it with the harness, and what observable end state proves it works. The four
H2s are `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, and `Gotchas`.
The map is the repo's maintained verification source; a proof that drives one convenient entry point
is incomplete when the map lists others.

## 5. Write against how the reader will actually fail

The agent that runs this skill optimizes for what fits in its context: it copies the nearest working
pattern, edits the file already open, takes the shortest path that exits zero, avoids deleting code
whose callers it cannot see, and follows the literal request even when that breaks an invariant.
Those are not carelessness; they are predictable, and each one produces a specific hollow proof:

- **Shortest path that exits zero** produces a command whose success is unrelated to the claim.
  `grep -o … > proof.txt && echo PASS` prints PASS on zero matches. Make the generated skill
  assert on content, not on exit status, and name the string that must appear.
- **Edit the file already open** produces a proof of the one entry point that happened to be on
  screen. This is what the feature map's entry-point list is for; say in the skill body that the
  map, not convenience, defines the coverage set.
- **Follow the literal request** produces a mock on the near side of the boundary because the
  boundary was harder. State the boundary by name in the Evidence section rather than stating the
  rule abstractly.
- **Copy the nearest pattern** produces selectors and ports lifted from whatever example was
  closest. Every command in the generated skill must be one that was actually run in this repo.

A rule the reader understands the failure mode of survives paraphrase. A bare prohibition gets
dropped the first time it is inconvenient.

## 6. Prove the generated skill before handing it over

Run its own instructions end to end once: launch, doctor, drive ONE mapped feature (one is enough;
the map exists so later runs can cover the rest), capture evidence, clean up. After cleanup, confirm
the evidence still exists at the named location — a cleanup that eats the proof fails this step.
Fix what fails, and run the generated cleanup after every failed iteration too, so broken attempts
don't strand processes and ports. A generated skill that was never executed is a draft, not a
deliverable.

## 7. Expose it to every harness

The skill lives in `.agents/skills/verify-<app>/` — harness-neutral, one canonical copy. Each
harness scans its own directory, so symlink rather than copy; two copies drift the first time
`/maintain-verification-skill` updates one:

```bash
for h in .claude .cursor; do
  [ -d "$h" ] && mkdir -p "$h/skills" && ln -sfn ../../.agents/skills/verify-<app> "$h/skills/verify-<app>"
done
```

Helper scripts locate the repo root by walking a fixed number of `..` from `$0`.
`.agents/skills/<name>/scripts/`, `.cursor/skills/<name>/scripts/`, and
`.claude/skills/<name>/scripts/` all sit at the same depth, so the same walk resolves through
any of them. Prove it: run launch and doctor through a symlinked path, not just the real one.

Reference the skill's own helpers by their `.agents/` path in the skill body, so the text names
the canonical location rather than one harness's view of it.

Where the skill names a browser harness, name every host: `cursor-ide-browser` in Cursor,
`mcp__chrome-devtools__*` in Claude Code.

Confirm all three paths are ignored before finishing — the skill records ports, debug routes,
and local env details, and `.agents/` is an ordinary tracked directory in most repos:

```bash
git check-ignore -v .agents/skills/verify-<app>/SKILL.md .cursor/skills/verify-<app> .claude/skills/verify-<app>
```

A global rule in `~/.config/git/ignore` covers `**/.agents/skills/verify-*` plus the two
symlink paths. If `check-ignore` prints nothing, that rule is missing on this machine — add it
there rather than in a per-repo `.gitignore`, so the next generated skill is covered without
anyone remembering.

## 8. Offer the maintenance loop

Point the user at `/maintain-verification-skill` for keeping the map honest as the app changes.
Suggest a cadence only if they ask.
