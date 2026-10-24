---
linear: ETH-95
github: 19
filed: 2026-10-24
---
# Prove the five-minute agent-to-simulation journey

## Status

- **Goal**: Make the complete vertical slice repeatable and ready for a short recording.
- **Initial priority**: P1
- **Effort**: Small
- **Risk**: MEDIUM
- **Category**: feature
- **Planned at**: commit `22cb4063c90af36b3d46693d18a81ffe3389a84f`, 2026-10-24

## Why this matters

Individually working panels do not prove a coherent demo. A non-technical viewer must follow one
iteration of agent building, understand a test scenario, and inspect a real simulation result.

## Current state

- Existing browser harnesses exercise manual simulation and conversational scenario authoring.
- They do not yet prove the new locked first-use state, modal transition, and separated chat flow.
- Older recording guidance emphasizes manual testing and always-visible JSON.

## Approach

Extend the existing browser harness rather than introduce another test framework. Keep deterministic
behavior checks separate from a real-provider rehearsal. Update the recording outline to the latest
three-part journey and record elapsed time honestly. Do not fake model latency or label replay live.

## Scope

- In: existing simulation browser harnesses, focused contract regressions where missing,
  `docs/sierra-demo/VIDEO.md`, and necessary launch/readme guidance.
- In: inspected screenshots and a reviewable recording of the real vertical slice.
- Out: new product features, unrelated refactoring, real payment integrations, and deployment.

## Steps

1. Start after the builder integration PR merges. Fetch the latest main in this ticket's child orb.
2. Extend the existing browser check to cover a fresh visit, locked controls, real choice cards,
   one workflow revision, explicit acceptance, first-scenario modal, review/save, and explicit run.
3. Verify reload, modal dismissal, active-run locks, and new-agent reset do not bypass
   prerequisites.
4. Rehearse with the live provider and synthetic identities. Show actual business results and keep
   technical evidence available. Time a realistic narrated path shorter than five minutes.
5. Update the recording script and retain only final user-reviewable visual artifacts.

## Test plan

- Run the extended deterministic browser harness against the actual app and API.
- Run existing authorization and owner controls, including exact refund and duplicate prevention.
- Run a separate live provider rehearsal; report latency or instability rather than concealing it.
- Inspect screenshots for locked first-use, ask-user, modal, saved scenario, and final run states.
- Inspect the interaction clip and run applicable workspace/CI checks.

## Done when

* A runnable regression catches bypassing setup or breaking the complete author/save/run journey.
* A real-provider rehearsal demonstrates one agent iteration and a simulation within five minutes.
* Documentation matches the shipped UI and explains synthetic data and truthful result semantics.
* One child thread owns one green, reviewed PR; the final evidence is directly reviewable.

## Notes

Blocked by the builder integration ticket, which itself follows parser and workspace work.
Video artifacts are not code assertions. Record deterministic results and live observations apart.
The parent coordinates merging after CI. Use vanilla Git, poteto-mode, and ponytail full.
