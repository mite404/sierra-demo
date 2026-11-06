---
linear: ETH-98
github: 33
filed: 2026-11-06
---
# Build two learner-authored refund simulations

## Status

* **Goal**: Turn business expectations into two runnable customer stories in one authoring flow.
* **Initial priority**: P1
* **Effort**: Medium
* **Risk**: MEDIUM
* **Category**: feature
* **Planned at**: commit `4a20530`, 2026-11-06

## Why this matters

The demo currently starts with preference selection and prewritten edge cases. That gives the
learner answers instead of teaching them to describe business expectations and test customer
stories. Individual expectations belong inside a simulation, not as separate sidebar entries.

## Current state

* `simulationWorkflow.ts` prescribes four preference combinations before separate authoring.
* `simulationAuthorModel.ts` holds complete proposals but has no validated partial expectations.
* The library has Play and saved summaries, but includes canned scenario examples and no green
  run-check icon. Creation uses separate setup, invitation, and review steps.

## Approach

Reuse the existing author, draft, save, and run contracts. Start directly in authoring with a
server-owned refund lesson configuration. Reveal each validated expectation once supported by
learner input. End authoring with a summary popup over the blurred chat. Create simulation is the
single explicit approval/save action that adds a sidebar row. Keep green configured dots distinct
from green checks earned by completed runs. This avoids a second builder or preseeded stories.

## Scope

* In: simulation author/source/progress contracts, Worker routes, web authoring/library/run UI,
  existing regression scripts, general PLAN.md, feature-specific simulations-plan.md, and guidance.
* Out: real contact/sign-in/payment APIs, because this teaches expected behavior with synthetic
  data.
* Out: arbitrary checks, new storage tables, dependency additions, and unrelated cleanup. Existing
  saved work and immutable run evidence must remain intact.
* Out: public deployment and automatic PR publication. Deliver a locally verified testable portal.

## Steps

* Start from updated main. Clarify the general plan versus feature implementation plan.
* Add a strict server-owned lesson source and validated progressive expected-check state.
* Replace separate setup with one authoring chat and a completed-authoring summary popup.
* Make Create simulation the only action that persists the reviewed draft and renders its row.
* Group Account owner asks and Someone else asks under Subscription refunds. Keep Play above them.
* Add configured green bullets and truthful circular run checks to the right of simulation names.

## Test plan

* Extend Worker and existing browser tests for progressive expectations, correction, restoration,
  popup blur/focus, explicit creation, trailing circular checks, both stories, and no contact popup.
* Run unit tests, typecheck, lint, format, build, and the real refund safety regressions.
* Inspect real K3 authoring and runs, desktop/narrow screenshots, and an interaction recording.

## Done when

* One opening chat collects enough detail before proposing a complete simulation.
* Green expected-behavior bullets appear progressively and remain distinct from passing evidence.
* The summary popup blurs authoring. Only Create simulation creates the sidebar record.
* Both customer stories can be selected and run. A green run check requires completed passing data.
* Duplicate rejection stays in the conversation and results, with no contact popup or API call.
* Tests and inspected visual evidence support the testable portal, with live limitations reported.

## Notes

Risk: MEDIUM. Shared gateway/web contracts and authoring recovery must change together. The fixed
lesson uses warm replies and owner confirmation. Human wording review is not an automated grade.
Implement [simulations-plan.md](../../plans/simulations-plan.md); PLAN.md retains general scope.
