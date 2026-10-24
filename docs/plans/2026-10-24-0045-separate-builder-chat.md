---
linear: ETH-94
github: 18
filed: 2026-10-24
---
# Separate friendly builder chat from simulation execution

## Status

- **Goal**: Use normal streamed prose and ask-user choices when building the custom agent.
- **Initial priority**: P1
- **Effort**: Medium
- **Risk**: MEDIUM
- **Category**: feature
- **Planned at**: commit `22cb4063c90af36b3d46693d18a81ffe3389a84f`, 2026-10-24

## Why this matters

Agent building is an interactive human conversation. Automated simulation execution is an
LLM-oriented evaluation loop. Sharing the customer adapter conflates those contracts.

## Current state

- Parser restoration (#20) and the workspace (#21) merged before integration began.
- Builder and fixture authoring now use a separate validated human event contract and adapter.
- The first workflow turn invokes `ask_user`, with choices in the existing card above the composer.
- Streamed and restored replies reuse the catalog Markdown emitter and parser.
- Automated customer execution retains its separate machine-oriented event contract.

## Approach

Give builder/authoring streams their own validated event contract and adapter. Reuse the restored
Markdown parser/emitter for human prose, including reload. Keep automated customer events separate.
Use the existing ask-user schema and catalog card for preference collection, not a new popup system.
Migrate both interactive callers in the same PR; do not leave a compatibility mode in the customer
adapter. Preserve server-owned sessions and explicit accept/save boundaries.

## Scope

- In: gateway builder/authoring contracts, model transport, workflow tools, NDJSON typing,
  `builder-agent.ts`, customer adapter removal of builder branches, and both UI caller migrations.
- In: required builder questions, answer/resume, restored formatting, cancellation, and tests.
- Out: layout redesign, which must already be merged from the workspace ticket.
- Out: parsing machine simulation events as human builder prose or changing executor safeguards.
- Out: new SDKs, SQLite restoration, auth changes, and deployment.

## Steps

1. Start only after parser restoration and the scenario workspace have merged into main.
2. Adapt the existing preliminary split, retaining strict event validation at stream boundaries.
3. For the refund request, invoke validated ask-user questions for response style and confirmation
   policy. Render choices above the composer and resume the same server-owned conversation.
4. Switch setup and scenario-author chat to the builder adapter. Parse restored human messages and
   preserve question state. Keep manual customer testing on the customer adapter.
5. Flush partial prose on normal completion, cancellation, and transport failure without false
   completion. Retain explicit acceptance, frozen settings, and stale-response isolation.

## Test plan

- Reproduce the exact refund request in the browser before and after the change.
- Add focused public-adapter tests for formatting, split chunks, questions, answers, cancellation,
  invalid events, and restored-versus-streamed output. Test constrained initial tool choice.
- Run gateway tests and typecheck, web tests and typecheck, formatting, lint, and build.
- Verify a live provider returns actual ask-user events and inspect the resulting card and prose.

## Done when

* Building an agent uses formatted streaming chat and real ask-user cards above the composer.
* Answers, refresh, cancellation, and acceptance preserve the correct session and required context.
* Automated simulation execution remains a separate machine-oriented protocol.
* Both callers migrate together and the full UI compiles without compatibility branches.
* One child thread owns one green, reviewed PR with live browser evidence.

## Notes

Integration started from merged `origin/main`, not the parent's unpublished local `main`.
The preserved transfer supplied preliminary gateway/adapter work, not replacement UI/parser files.
The deterministic UI harness now emits real builder question events. ETH-95 owns its full journey
extension. Tall questions scroll within the setup thread so narrow screens retain every choice.

Verification includes focused adapter and invalid-question/forced-tool-choice tests, the full unit
suite, typecheck, lint, formatting and build. The complete deterministic browser regression covers
question/reply reload, narrow choice submission, acceptance modal, saved simulations, pinned layout,
cancellation, errors and executor payment invariants. Live Kimi K3 also emitted an actual `ask_user`
question and a reviewed warm/confirm proposal; fixture prose is not live-provider evidence.

The parent coordinates merging after CI. Do not merge this PR in the implementation thread.
