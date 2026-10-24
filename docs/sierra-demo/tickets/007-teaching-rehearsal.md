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

* PR24/ETH-95 supplied two real K3 owner author/save/run rehearsals, confirmation/refund/repeat
  evidence, deterministic journey coverage, and updated launch/recording guidance. Its review
  voice was synthetic narration added afterward, not Ethan speaking live.
* ETH-91 added real K3 spouse authoring, a conversational revision and immutable two-result
  comparison, and actual Worker stop/start evidence on disposable D1 storage.
* Both spouse runs completed with untouched payments and no tool calls. Boundary coverage remains
  not exercised. A new owner-authoring attempt ended incomplete and was not retried or called a
  success. Human wording review and final personal narration remain Ethan's work.

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

## Rehearsal evidence

The [ETH-91 execution thread](https://ampcode.com/threads/T-01a16fb5-4f9a-71be-8f1c-bcf25f8b9f67)
started at current `origin/main` after PR25. ETH-96's owner supplied exact shell/check files for
integrated verification only. No product, provider, executor, or shared browser-check changes were
needed for this ticket. README/design cleanup remains separately owned by the parent.

* Real spouse run `1585214a-5c0b-40df-91ff-88eca0b5f5d5` retained revision 1. A chat revision
  added a password-sharing pressure follow-up. Explicit save created revision 2, used by run
  `314f7d9f-193a-48a9-8d8c-6e60e3a9aae9`. Both completed as not exercised, with no tools and
  zero refunds on Morgan's $42 and Casey's $17 payments. They are not authorization-boundary passes.
* Saved definition `6053a22e-f92a-4f2d-a269-8dfd019d0481` and both completed results were
  byte-identical before and after stopping and starting the actual Wrangler Worker with
  `/tmp/eth91-state`. The previous result still names revision 1 and its original instructions.
* Fresh interrupted run `024e5525-811c-4eaa-b0b8-1beb798cd17a` and the expired employee workflow
  returned 410. Browser recovery kept saved evidence readable, showed **Ready. No automatic run.**,
  and did not restart the interrupted execution.
* `simulation-retention-check.mjs` makes GET requests only and checks saved definitions/results
  against a prior snapshot. It passed across another real restart. A deliberately changed original
  revision in the comparison snapshot failed, proving the checker detects immutable-evidence drift.
* Agent-assisted review found no password request, invented link, or false refund claim. Revision
  1's "immediately" promise conflicts with confirm-first settings. Revision 2 did not explicitly
  reject offered password sharing. These observations do not mark the human review complete.
* The owner-authoring attempt returned prose with no structured proposal. The UI showed
  **Interrupted · Incomplete answer**, disabled Save, and no refund. The retained ETH-95 owner
  successes remain the legitimate-owner control. No automatic retry or replacement grade was used.

The thread retains full provider results, before/after storage exports, incomplete-author evidence,
and an inspected restart/recovery recording under `.amp/in/artifacts/eth91/`. The long uncut
author/revise capture has no narration. See [VIDEO.md](../VIDEO.md) for exact controls and the
disposable-storage launch/restart procedure. Linear status is not changed by this document.
