---
linear: ETH-91
github: 8
filed: 2026-10-23
---
# Prove and script the complete teaching journey

## Status

* **Goal**: U7. Deliver a verified recording-ready lesson from conversational authoring to
  repeatable tests.
* **Initial priority**: P1
* **Effort**: Medium
* **Risk**: MEDIUM
* **Category**: feature
* **Planned at**: commit `6d27052e87a85d59257da30901e9ffee0c9185eb`, 2026-10-23

## Why this matters

The demo is complete only if a learner can repeat the method. A list of implemented components
cannot establish that the five-minute story works with real model behavior and honest evidence.

## Current state

* `docs/sierra-demo/VIDEO.md` teaches manual tests and explicitly says no conversational authoring.
* README still describes K2.6 and ephemeral-only sessions. Earlier tickets update affected facts,
  but no full authored-simulation rehearsal has run yet.
* The existing browser harness is the starting point for reproducible demonstration checks.

## Approach

* Rehearse two complementary authored tests through the finished UI with real K3. Update the
  existing launch guide, scope notes, and five-minute script from observed behavior.
* Extend the existing harness for the completed journey and capture inspected live evidence.
  Avoid a new sample app, fake guaranteed-pass recording, or separate replay product.

## Scope

* In: `apps/web/scripts/simulation-check.mjs`, focused regression checks revealed by rehearsal,
  README, `docs/sierra-demo/VIDEO.md`, and accurate scope/model/persistence references.
* In: reviewable captures and an operator-ready portal; bounded fixes necessary for this journey.
* Out: unrelated cleanup, production deployment, narrated-video editing, marketing claims of Sierra
  affiliation, and a generic agent platform. Ethan supplies final narration.

## Steps

* Read parent R1-R9 and its definition of done. Start from disposable clean lesson state.
* Author a spouse-pressure test in chat. Save, run, and distinguish safe refusal from actual denied
  tool coverage. Human-review the owner sign-in guidance without inventing a sign-in integration.
* Author an owner-confirm-repeat test. Show zero refund before confirmation, one $42 refund after,
  blocked repeat, and the unrelated $17 invoice unchanged.
* Revise one test in chat, save a new revision, rerun, and compare immutable completed evidence.
* Restart local Worker with the same directory. Reopen saved tests and two results, showing active
  session recovery without automatic replay. Keep probes visibly separate from live execution.
* Update exact UI names and narration. Explain customer instructions/context/checks in plain words.
* Record and inspect a concise real interaction clip plus representative desktop/narrow captures.

## Test plan

* Run the extended live browser harness with real K3 and the existing executor/HTTP regressions.
* Repeat the restart and storage-retention proof against disposable local state, not user records.
* Check cancellation/incomplete states and probe controls. Neither is a passing live test.
* Verify all launch commands, typechecks, lint, document links, and Markdown wrapping.
* Inspect the recording for real streamed dialogue, visible business evidence, and no secrets.

## Done when

* A clean-start learner can configure, conversationally author, review, save, run, and repeat both
  tests.
* The legitimate-owner control prevents treating blanket refusal as a correct refund agent.
* The script distinguishes agent help, executor authorization, deterministic checks, and human
  review.
* Saved definitions and two completed results survive a demonstrated Worker restart without replay.
* Exact controls, model identity, storage limits, run limits, and independent-demo claims match the
  app.
* Inspected captures/recording and passing executed checks support every stated outcome.
* The first six tickets are integrated, and this ticket's rehearsal meets every remaining goal.
  No unverified claim is presented as a passing demo.

## Notes

Risk is MEDIUM. Depends on U6, ticket `006-run-and-compare.md`. Follow the parent plan. One Amp
Medium thread in a Small orb uses `poteto-mode` and vanilla Git. Start from verified `origin/main`.
Complete the full rehearsal and report blockers honestly. Live model variability is teaching
material, not permission to replace the recording with seeded responses or a fabricated grade.
