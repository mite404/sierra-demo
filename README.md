# Sierra Agent QA Lab

Independent educational demo for one authorization lesson. The agent guides the customer toward
an authorized path; the tool prevents unauthorized actions regardless of what the agent says.
All accounts and payments are synthetic. This sample is not affiliated with Sierra and does not
integrate the Sierra SDK.

## Run the lesson

Use Node 22 or newer and the pinned pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
amp orb services ensure
```

In an Amp orb, the second command builds the SPA, starts the local training Worker, and returns
an access-controlled preview URL. No Cloudflare login, WorkOS account, or payment service is needed.
Outside an orb, use this foreground command instead:

```sh
VITE_AUTH=none pnpm --filter web build && pnpm --filter gateway dev:simulation
```

Open the loopback address Wrangler prints. Keep this training Worker local. Public deployment,
public model access, and changes to YakLabs infrastructure are outside this sample's scope.

Start as an employee: describe the refund workflow in chat, answer the live model's focused choices,
iterate on the streamed proposal, then click **Accept workflow**. Simulations stay disabled until
acceptance opens the first-test-scenario invitation. Describe a scenario in the separate authoring
chat, review the instructions and expected behavior, then explicitly save and run it. The automated
customer and support agent converse while the saved scenario stays pinned above the conversation.
When execution ends, an outcomes popover opens over a 2px-blurred, read-only transcript. Its
**Simulation complete** title means execution finished, not that every check passed. Read the actual
goal statuses. Click **View conversation**, **Close**, or press Escape to reveal the clear history.
**View results** reopens the outcomes without rerunning anything. Open **Business checks and
execution JSON** below the transcript to inspect payment evidence. Helpful wording remains a
separate human review. Desktop web is the only scenario device.

Supported agent settings are brief/warm replies and immediate/confirm-first refunds. Accepted
settings apply to the executor; ownership and duplicate safeguards cannot be edited. Select a saved
scenario using its sidebar row. Its approved definition selects Casey or Morgan; there is no
separate customer-fixture selector or manual customer screen. Examples only seed authoring drafts.
Builder, scenario authoring, and automated customer dialogue are separate.

Corrected and vulnerable probe endpoints remain available for backend regression checks on separate
fresh invoices. There is no in-app probe control. A scripted probe is never a live conversation.

## Enable the live agent

Supply a demo-only `OPENROUTER_API_KEY` through the Amp project's Secrets settings, then run
`amp orb restart-processes`. Wrangler's simulation config allowlists that server-side secret from
the orb environment. For a non-orb launch, put the same binding in the ignored
`apps/gateway/.dev.vars` file. Never put the key in a `VITE_` variable or commit it.

The chats use the existing Anthropic-format OpenRouter client and
`moonshotai/kimi-k3`, with no model fallback. Each call allows 1,400 output tokens and 20 seconds,
with at most four rounds per customer turn, eight tool calls per run, and a 45-second turn deadline.
Automated runs are limited to named fixtures, six customer turns, and 240 seconds overall.
Missing credentials and upstream failures produce **Execution error**, never a passing verdict.
Live replies vary. A reply that describes a refund without calling the tool does not change payments
or prove success. Inspect the actual tool result and payment state, not the agent's claim.

Refresh/reopen in the same browser restores existing authoring and workflow sessions without
resubmission. Local storage contains only opaque handles and navigation. Interrupted replies do not
resubmit or stay running. The demo keeps one workflow, with no back-to-workflow or new-workflow
navigation. Builder sessions last 24 hours after the last turn, with at most 24 sessions, and
**do not survive a Worker/service restart**. Missing sessions show explicit recovery instead of
invented history. Saved definitions and the latest two completed results per test persist in local
D1 across restarts with the same storage directory. Old results retain their exact revision and
settings. An interrupted run never resumes automatically. Use the same portal origin and browser.

The fixture represents a trusted session, not a login implementation. Casey has no delegated
access to Morgan's account. Morgan owns an eligible $42.00 invoice; Casey's unrelated invoice is
$17.00. The executor chooses the full invoice amount and original payment method, not the model.
Corrected authorization happens before account lookup or disclosure. A second refund is a no-op.

## Verify and record

The smallest regression command exercises the real executor and the HTTP agent loop, with only
the external model transport controlled in automated tests:

```sh
pnpm --filter gateway exec vitest run src/simulation.test.ts src/simulationWorker.test.ts
```

For the complete deterministic journey, build the SPA and run the disposable acceptance server:

```sh
VITE_AUTH=none pnpm --filter web build
node apps/web/scripts/simulation-ui-server.mjs
```

In another terminal, run `node apps/web/scripts/simulation-runs-check.mjs`. Only the external model
transport is controlled. HTTP, the executor, and disposable D1 are real; the page labels this
transport as not live K3. The check covers choice-card answer/resume, revision, acceptance,
author/save/run, pinned content, reload/reset, locks, payment evidence, and incomplete results.
If Chromium is not installed, set `PLAYWRIGHT_CHROMIUM` to an installed Chrome executable.

Rehearse the complete real-provider journey separately using
[VIDEO.md](docs/sierra-demo/VIDEO.md). It spends model credit and must retain actual latency and
results. The guide also covers a GET-only retention check around an actual Worker restart. Do not
rebuild the SPA under a running Wrangler process; restart the simulation service after rebuilding
static assets.

Money and permission checks are deterministic. A refusal without a tool attempt leaves boundary
coverage not exercised. Use executor regressions to prove enforcement. The human rubric reviews
useful guidance, private-data disclosure, and unsupported claims; it is not an automated judge.

Use [the five-minute recording outline](docs/sierra-demo/VIDEO.md) to rehearse. Ethan records the
final narrated application video. No authored reply or backend probe is labeled as a live agent, and
this sample has no replay mode.

## Inherited source

This repository is an independent copy of `mite404/yaklabs`, imported at
`da1073ca8ec29e08070ef312f204db118b08d662`. It retains the original package names, aesthetic, source
notices, and unused subsystems. `THIRD_PARTY_NOTICES.md` records third-party notices. The lesson's
scope is [PLAN.md](docs/sierra-demo/PLAN.md). Inherited product plans, research, and ADRs have been
removed; shared design guidance and source attribution remain.

## Layout

A pnpm workspace run by Turborepo, laid out the way Better-T-Stack scaffolds it (`bts.jsonc`
keeps the scaffold's metadata for `pnpm dlx create-better-t-stack@latest add`):

- `apps/web`: the React Router single-page app, built to static files.
- `apps/storybook`: hosts Storybook and the story tests; the stories themselves live beside their
  components in the catalog.
- `apps/gateway`: the local simulation Worker, with a Hono API, streamed model replies,
  synthetic refund execution, local D1 records, and the web build as static files. Its dedicated
  simulation entry does not require WorkOS or use the inherited production gateway.
- `packages/runtime`: the NDJSON line reader used by the simulation client.
- `packages/catalog`: the data-view catalog, `@yaklabs/catalog`: components, stories, schemas
  and tests in one place, so they cannot drift apart.
- `packages/ui`: shadcn/ui primitives, `@yaklabs/ui`, themed by the shared catalog tokens.
- `packages/config`: the shared TypeScript base config.
- `tools/verify-ui-drift`: internal only. The team's UI drift check: it screenshots the
  foundation stories on three engines in both themes and compares them with the approved
  references in `tools/verify-ui-drift/baselines/` (see its README).

`apps/` ships, `packages/` is shared between them, and `tools/` exists only for the team.

## Inherited development commands

```sh
pnpm install
pnpm dev:web          # the app at http://localhost:5173
pnpm storybook        # the catalog at http://localhost:6006
pnpm test             # unit tests in node, story tests in headless Chromium
pnpm typecheck
pnpm lint && pnpm format:check
pnpm build            # apps/web/build/client, a static site
pnpm build-storybook  # apps/storybook/storybook-static
```

## Checks

Lefthook runs on every commit and touches only staged files: Oxlint, Oxfmt, and a 100-column wrap
for markdown. After a pull or a branch switch it runs `pnpm install` when the lockfile moved past
what `node_modules` holds, so a branch that adds a package never leaves the dev server failing to
resolve it. CI (`.github/workflows/ci.yml`) runs the rest on every pull request: format, lint,
types, the fallow audit against the base branch, unit and story tests, and both builds. Its
`design-verification` job runs `pnpm verify-ui-drift run` and fails on UI drift from the approved
references or on an axe violation. Only a person can approve a new reference, locally.

To prove a component change in a real browser while you work on it, use the
`verify-storybook-component` skill under `.agents/skills/`.
