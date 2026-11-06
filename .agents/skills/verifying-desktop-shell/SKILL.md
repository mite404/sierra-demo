---
name: verifying-desktop-shell
description: >-
  Checks Sierra's simulation authoring, explicit creation, run evidence, and window geometry.
  Use after changing authoring, the simulation sidebar, run results, or shell layout.
---

# Verify the simulation flow and desktop shell

Check the running app through Playwright, real HTTP routes, the executor, and disposable D1.
Control only external model transport. Preserve learner records in the live lesson service.

## Run

From the repository root, build the no-login lesson and start the acceptance server:

```sh
VITE_AUTH=none pnpm --filter web build
amp orb service start shell-qa --port 8790 --command 'node apps/web/scripts/simulation-ui-server.mjs'
curl --retry 15 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:8790/__qa
PLAYWRIGHT_CHROMIUM="$(ls -d "$HOME"/.agent-browser/browsers/chrome-*/chrome | sort -V | tail -1)" \
  node apps/web/scripts/simulation-runs-check.mjs \
  --out /tmp/simulation-flow-captures --logs /tmp/simulation-flow-logs
```

Restart an existing `shell-qa` service before each journey. Its fresh disposable database is
required by the empty-library assertions. Outside an orb, run the server in a separate foreground
terminal. Omit `PLAYWRIGHT_CHROMIUM` when using the repository's installed Playwright Chromium.

Require exit zero and `PASS single author chat, empty library, progressive/retracted/restored
expectations`. CI runs this same journey with source-mapped coverage in
`.github/workflows/ci.yml`. Inspect the viewport captures for empty authoring, partial expectations,
the creation summary, saved-but-unrun state, results, execution JSON, narrow dark layout, and
recovery. Put only captures selected for user review in `.amp/in/artifacts/`.

## Properties and covered code

Requirements come from `docs/sierra-demo/PLAN.md` and `docs/plans/simulations-plan.md`.

- `simulation-author-chat.tsx`, `AuthorChat`, and `simulation-definition.tsx`, `ProposalReview`:
  insufficient details create no proposal or sidebar record. Validated expectations appear,
  retract, restore without model replay, and clear after error or cancellation. The complete
  summary blurs and disables the same chat, receives keyboard focus, and saves nothing on Escape
  or Revise. Only Create simulation persists. A second proposal preserves the first saved record.
- `simulation-authoring.tsx` and `simulation-library.tsx`: actual saved stories appear under
  Subscription refunds. Play is disabled before creation. Configured green dots never substitute
  for completed passing run evidence. Passing rows show a circular check to the right of the name.
- `simulation-run-view.tsx`, `simulation-run-state.ts`, and `simulation-run-evidence.tsx`:
  owner execution records confirmation, one $50.00 refund, and duplicate rejection while the
  control invoice stays unchanged. Dismissing results never opens a contact popup. Frozen JSON
  shows two-place decimal dollars derived from stored integer cents, including Casey's $17.00
  control payment. Fresh reruns start untouched; reload, restart, and save-only retry do
  not replay models.
  Error, timeout, cancellation, turn limit, and unexercised checks never earn passing icons.
- `simulationAuthor.ts`, `simulationAuthorModel.ts`, `simulationContract.ts`, `simulationWorker.ts`,
  and `simulationWorkflow.ts` in `apps/gateway/src/`: the real lesson-source, progressive authoring,
  explicit draft save, run, and persistence routes remain in the journey. The deterministic model
  transport lives only in `apps/web/scripts/simulation-ui-server.mjs`.
- `simulation-lab.tsx`, `SimulationLab`, and `simulation.css`:
  `apps/web/scripts/simulation-shell-check.mjs` measures real browser rectangles. The frame keeps
  16px desktop insets, 44px chrome, one visible main, internal scrolling, and reachable controls.
  Keyboard scrolling preserves the pinned summary. Legacy routes redirect to the lesson.

Component paths above are under `apps/web/src/components/` unless otherwise stated. The executable
journey is `apps/web/scripts/simulation-runs-check.mjs`.

## Bounds and assumptions

This is bounded executable verification, not formal proof of the whole app. Playwright checks the
actual React and Worker code rather than a parallel state-machine model. No verifier is configured
for arbitrary React events, generated language, or CSS.

`verifyShellSizes` enumerates all 40 combinations of ten widths, two heights, and two themes for
empty authoring and saved-but-unrun states. Widths are 390, 767, 768, 769, 799, 800, 801, 1024,
1280, and 1440px. Heights are 720 and 900px. Creation actions are checked at five widths in both
themes at 720px height. Results bounds use those five widths. Other journey transitions use
1280 × 720px; a completed dark layout uses 390 × 844px.

The two controlled stories cover owner-confirm-repeat and another person's request without tool
attempts. The latter must remain `not-exercised`, not an authorization-tool pass. Model wording,
all possible event interleavings, concurrent tabs, arbitrary content and viewports, Safari, touch,
and production infrastructure are excluded. For exhaustive bounded executor authorization,
consent, and idempotency checks, run `.agents/skills/verifying-refund-safety/SKILL.md` too.

Verified with Node 26.12.1, pnpm 10.33.0, locked Playwright 1.63.0, and Chromium 157.0.8103.38.

## Prove a regression is caught

Temporarily change the **Revise in chat** button in `ProposalReview` from `onClick={onRevise}` to
`onClick={onCreate}`. Rebuild, restart the disposable server, and run the journey. Require failure
at `Revise returns to authoring without saving a simulation`, with one saved definition instead
of an empty array. Restore only that handler, rebuild, restart, and require the full journey to
pass again. Keep unrelated working changes intact. If a live lesson shares the build directory,
stop it while testing the mutation and restart it only after restoring the correct build.

This mutation was observed failing on 2026-11-06, followed by a restored full pass. It establishes
sensitivity of explicit creation, not every property above. The previous shell-height mutation
changed `.simulation-lab` from `height: 100%` to `height: 100dvh` and failed at `The lesson uses
frame height, not viewport height`. Repeat that mutation when changing the height contract.

The contact-popup removal and circular-icon assertions also failed against their previous UI on
2026-11-06, then passed after removing the popup and rendering the trailing circle-check.

A failure is a product counterexample unless the test assumptions disagree with an intentional
product change. Inspect the HTTP evidence and failing screenshot before changing assertions.

## Keep in sync

The last committed base inspected is `4a20530893252583b74e734460af687b710dd4a5`. This record also
covers the uncommitted two-simulation implementation verified on 2026-11-06. Review the covered
source and journey diff together, rerun the check, and advance the sync commit only when the
coverage still describes that revision. Use `/maintain-formal-verification-skill` after changes
that skipped verification.
