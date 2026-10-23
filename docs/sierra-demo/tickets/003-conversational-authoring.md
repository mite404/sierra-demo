---
linear: ETH-87
github: 4
filed: 2026-10-23
---
# Author and review simulations through chat

## Status

* **Goal**: U3. Describe, clarify, revise, save, and reopen a simulation without code or a form
  builder.
* **Initial priority**: P1
* **Effort**: Medium
* **Risk**: MEDIUM
* **Category**: feature
* **Planned at**: commit `6d27052e87a85d59257da30901e9ffee0c9185eb`, 2026-10-23

## Why this matters

This is the missing teaching step. A non-technical learner must express a test in their own words,
see what the model understood, and correct that understanding before saving it.

## Current state

* `simulation-setup.tsx` configures workflow tone/approval but cannot author a test.
* The accepted employee conversation closes. It must not reopen authority to change safeguards.
* U2 provides approved-definition contracts and storage, but no conversational author or saved list.

## Approach

* Add a distinct simulation-authoring conversation using K3 and the existing composer/thread.
  Carry the accepted workflow as read-only context rather than reopening its configuration chat.
* Let the model propose supported customer/check choices and ask focused questions. The server
  validates every proposal. Revisions remain conversational; reject a second editable form.
* Keep review summary beside chat and save explicitly through U2. Show a compact saved-test list.

## Scope

* In: gateway authoring session/prompt/routes and web `simulation-lab.tsx`, authoring view,
  API/state/persistence modules, and shared simulation CSS where needed.
* In: Create simulation, draft-only examples, Revise in chat, Save simulation, Open, Edit in chat.
* Out: Run controls before U5/U6 exist, bulk generation, arbitrary workflow tools, editable JSON,
  a canvas, hidden reasoning, and changes to accepted authorization rules.

## Steps

* Read parent R1-R3/R5/R8 and its learner controls. Keep configure, author, and customer roles
  clear.
* Accept free text and ask only for missing customer behavior, context, or expected outcome.
* Present name, named customer, fixed starting facts, customer instructions, supported checks,
  human-review guidance, and accepted workflow settings in a read-only summary.
* Save only a completed server-held proposal. Edit a saved test into a draft and save a new
  revision.
* Load the saved list independently of role-session recovery. Reset does not erase saved records.
* Label unsupported requests honestly and propose bounded alternatives without inventing support.

## Test plan

* Test server validation, model-proposed approval spoofing, incomplete proposals, stale saves, and
  late authoring/acceptance events after Reset/New workflow.
* Browser-test custom spouse and owner instructions, focused clarification, a changed expectation,
  explicit save, reopen, and edit into a new revision. Shortcuts seed drafts and never submit.
* Verify keyboard operation, loading/error states, missing credentials with saved list accessible,
  and desktop/narrow summaries. Inspect screenshots and an actual moving-pointer recording.

## Done when

* A learner authors both spouse-pressure and owner-confirm-repeat definitions through ordinary chat.
* Review shows all required instructions, starting facts, checks, human guidance, and frozen
  settings.
* The model cannot save/approve its own proposal, change trusted identity, or disable safeguards.
* Explicit save and conversational edit produce persistent, distinguishable approved revisions.
* Saved tests remain accessible after expired chats; interrupted work never silently resubmits.
* Tests/typechecks/lint and inspected browser evidence pass before U4 starts.

## Notes

Risk is MEDIUM. Depends on U2, ticket `002-saved-definitions.md`. Follow the parent plan. One Amp
Medium thread in a Small orb uses `poteto-mode` and vanilla Git. Start from verified `origin/main`.
Meet every goal and integrate its PR before U4. Reuse existing components/tokens and the repo's
rules for new shadcn components. Do not present authoring as Sierra's private implementation.
