---
linear: ETH-90
github: 7
filed: 2026-10-23
---
# Run simulations and explain their results

## Status

* **Goal**: U6. Let learners run, inspect, review, rerun, and compare saved simulations without JSON
  literacy.
* **Initial priority**: P1
* **Effort**: Medium
* **Risk**: MEDIUM
* **Category**: feature
* **Planned at**: commit `6d27052e87a85d59257da30901e9ffee0c9185eb`, 2026-10-23

## Why this matters

Non-technical learners need to connect a conversation to observable payment effects. Raw JSON alone
does not explain whether a test checked the intended behavior or merely sounded convincing.

## Current state

* Manual tests show fixed goals and raw expanded JSON in `simulation-evidence.tsx`.
* U3 supplies saved definitions. U5 supplies automated run/stop/read and durable latest-two results.
* There are no automated run controls, readable before/after payment rows, or result comparison.

## Approach

* Add Run simulation, running-only Stop, and Run again to the selected saved-test view.
* Present expected/actual business checks, payment before/after, and human review beside the actual
  role-labeled transcript. Keep expanded tool JSON as supporting evidence.
* Compare only Previous and Latest completed results for the selected test. Avoid a dashboard,
  score aggregate, replay runner, or manual data-entry inspection form.

## Scope

* In: `simulation-lab.tsx`, customer/evidence views, API/adapter/state/persistence modules, and CSS.
* In: reviewed definition/settings display, real run controls, partial/error recovery, latest-two
  comparison, human-review controls and note, and clearer terminology/probe scope labels.
* Out: broad UI redesign, a general history dashboard, automatic semantic grades, and global data
  reset.

## Steps

* Read parent R2/R6-R9 and learner controls. Preserve existing manual mode and isolated tool probes.
* Show genuine customer/support streaming and actual tool events. Do not grade intermediate turns.
* Show dollars and unchanged-control evidence, supported check explanations, and human review
  status.
* Save Meets guidance / Needs improvement with an optional note per completed run, independently of
  business results. Show Pending review by default, never a machine-assigned language pass.
* Make Previous/Latest labels include revision, accepted settings, actual models, and completion
  time.
  Warn when revisions/settings differ; do not imply a controlled same-version comparison.
* Restore by reading handles/results without resubmission. Reject stale events after stop/reset/view
  changes. Missing active sessions do not hide the independently saved library or completed results.

## Test plan

* Browser-test author → save → run → inspect → review → rerun → compare using real
  server evidence.
* Cover empty library, running stream, completed pass/fail/not-exercised, cancelled/timeout/error,
  unsaved-result storage error, one/two results, changed revisions, and missing active sessions.
* Verify keyboard labels/focus, desktop and narrow layouts, and no expansion required for evidence.
* Inspect labeled screenshots and a moving-pointer interaction recording with neighboring controls.
  Run relevant web/gateway tests, both typechecks, and lint.

## Done when

* A learner runs saved tests, sees both speakers, and explicitly stops or reruns with fresh state.
* Expected/actual checks and readable payment changes explain the assessment without requiring JSON.
* Boundary coverage, business outcomes, incomplete execution, and human review remain distinct.
* Previous/Latest show retained immutable evidence and expose differences in revision/settings.
* Refresh, reset, and late events cannot replay refunds or attach old evidence to a new run.
* Manual customer tests and separately labeled corrected/vulnerable no-model probes still work.
* Checks and inspected desktop/narrow screenshots/recording pass before U7 starts.

## Notes

Risk is MEDIUM. Depends on U5, ticket `005-automated-customer.md`. Follow the parent plan. One Amp
Medium thread in a Small orb uses `poteto-mode` and vanilla Git. Start from verified `origin/main`.
Meet every goal and integrate its PR before U7. Read `docs/design-pillars.md` before visual edits.
Use existing tokens/components and new-component shadcn rules; do not invent another design
language.
