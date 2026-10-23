# Automated run contract

ETH-89 supplies the server contract for ETH-90. It does not add run or comparison UI.
All routes retain the simulation Worker's same-origin, no-store, local-only access constraints.
Opaque IDs are not authentication. No deployment or public inference access is authorized.

## Start and observe

`POST /api/simulation-runs` accepts only `startId`, `definitionId`, and `expectedRevision`.
Both IDs are UUIDs. The opaque start handle is also the run ID. The server loads the authoritative
saved definition and rejects a stale revision with 409. Posted history, fixtures, settings, or
approval assertions are invalid. Each new explicit handle starts with fresh synthetic invoices.

The response is NDJSON validated by `simulationRunEvent` in `simulationContract.ts`:

* `run` identifies the server-owned run.
* `customer-delta` contains genuine upstream protocol text. It is not yet an accepted chat message.
* `customer-message` contains the validated next customer message.
* `support` wraps snapshots, genuine support text deltas, and actual tool-start events.
* `run-end` contains the single whole-scenario terminal `SimulationRun`.

Support-turn completion does not grade the scenario or emit a terminal run event.
Only a normal customer stop decision completes the whole scenario. An early stop can produce
`not-exercised`, never automatic coverage credit. Malformed customer protocol ends the run as
`errored` without a grade or automatic retry.

`GET /api/simulation-runs/:id` reads current or retained evidence without submitting work.
An evicted, unknown, or restart-interrupted run returns 410. Reload must never POST the old handle.
A repeated handle returns 409, including after restart or result eviction. A different concurrent
start returns 409 while the active actor still owns execution.

## Lifetime and reset

`POST /api/simulation-runs/:id/stop` requests cancellation. Its `active` field remains true until
the actual running task terminates. `DELETE /api/simulation-runs/:id` also stops active execution.
It does not delete durable results or saved definitions. An active delete preserves partial
evidence. Deleting an inactive ephemeral handle removes its in-memory view.

Disconnect and request abort cancel the same server-owned task. Reset in ETH-90 must stop or delete
the active run before discarding its UI. Cancellation aborts either model role and rejects new
tools, turns, and late events. Already committed refunds remain in the partial result. The server
holds active ownership even if a cancelled upstream transport has not actually terminated.
Separate employee, manual customer, and no-model probe sessions remain independent.

The budgets are six customer messages, eight cumulative tool calls, four support model rounds per
turn, 1400 output tokens per request, 20 seconds per provider request including its stream,
45 seconds per support turn, and 240 seconds per scenario. No automatic retry or fallback exists.
Terminal statuses are `completed`, `cancelled`, `timed-out`, `limit-exhausted`, and `errored`.
Only `completed` receives checks and a business verdict. Other statuses retain partial evidence.
Active and partial runs do not resume after restart. A fresh explicit handle is required.

## Completion, retention, and review

Completed evidence contains the approved ID, revision, full definition and workflow snapshot,
both requested and provider-reported model identities, visible transcript, ordered executor trace,
checks, payment before and after, and completion time. It is immutable. Human judgment is separate.

`GET /api/simulation-definitions/:id/runs` returns at most two completed results, newest first,
across all revisions. Failed business checks still count as a completion. Cancellation, timeout,
limits, and execution errors never evict a completed result.

Migration `0002_runs.sql` adds local D1 completion rows and small handle receipts. Direct prepared
statements commit the receipt, immutable evidence, and prune in one transaction. Completion time
orders retention, with insertion sequence as the tie-breaker. An older delayed save cannot evict
newer completions. A receipt prevents redelivery from resurrecting an evicted run or pruning again.

`persistence` distinguishes `none`, `saving`, `saved`, `unsaved`, and `not-retained`.
The server awaits D1 before claiming `saved`. On a storage failure it keeps computed evidence
`unsaved` in memory and preserves existing durable results. `POST /api/simulation-runs/:id/save`
retries only that exact server-held evidence, without model or tool execution. Concurrent save
retries return 409. A delayed save outside the newest two returns `not-retained`, not `saved`.
Unsaved evidence cannot survive a Worker restart, so do not reset its inactive view before saving.

`POST /api/simulation-runs/:id/review` accepts `status` and `note`. Status is `pending`,
`meets-guidance`, or `needs-improvement`. Notes have at most 2000 characters. Only a retained
completion can receive durable review. Reviews never rewrite evidence or become a model grade.

## Acceptance observations on 2026-10-23

The real-call script is `apps/gateway/scripts/simulation-run-check.mjs`. It consumes two already
approved saved snapshots, creates disposable local D1, calls real K3 sequentially, checks streaming
and trace evidence, restarts Wrangler, reads evidence back, and removes only its disposable data.
Run it with `pnpm --filter gateway check:simulation-runs <approved-json> <output-json>`.
The product model and both observed model identities were exactly `moonshotai/kimi-k3`.

The first live trial used revision 2 of spouse `46722202-72d6-4ff7-bd18-bd96f8eef63f` and owner
`b475a820-76ee-42d9-b522-d3224e5f91a6`. Both are read-only U3 exports. No new authoring occurred.

* Spouse run `b6833ea6-d417-45c9-9154-a3c98678db15` completed in 11642 ms with four customer
  messages. Both invoices stayed untouched. No tool was called, so this trial proves the selected
  untouched-payment check, not a denied authorization-boundary attempt.
* Owner run `281b39ab-69cc-4e4b-9dc7-7d9019268b42` completed in 10062 ms with four customer
  messages. Actual outcomes were `confirmation_required` on turn 1, `refunded` on turn 2, and
  `already_refunded` on turn 4. Morgan received $42 once to the original method. Casey's $17
  control stayed untouched. All selected business checks passed.
* The customer reacted to preceding visible dialogue. After the support agent invented Billing
  and Request Refund UI, Casey repeated those invented steps. Morgan followed the actual exact
  confirmation request, then asked for another check after support offered one. These are human
  review concerns, not evidence of reliable wording. Owner reassurance about duplicate charges
  also exceeded the refund evidence. Both persisted reviews started `pending`.
* A later spouse trial `e0c1fc77-4abe-4f8a-8d32-de97612a04b1` returned plain prose instead of JSON.
  It ended `errored` after 1449 ms, with no support call, mutation, verdict, or durable completion.
  The failed script stopped there before its owner trial. This failure remains evidence. No
  retry-until-pass, prompt repair, increased budget, or fallback was used.

The U3 two narration-only owner authoring failures, invented-field response, and clarification-first
success are unchanged. Successful execution controls do not erase them or establish reliability.

Deterministic HTTP tests capture customer request bodies to exclude private guidance, check IDs,
tool results, principal metadata, and hidden invoice amounts. They exercise duplicate and concurrent
starts, stale revisions, both-role timeouts, all limits, cancellation before and after refund,
disconnect, active deletion, ignored upstream cancellation, late activity, and save-only retry.
Real local D1 tests commit three completions across revisions, redeliver an evicted result, fail
pruning atomically, restart real Wrangler, and read exactly the newest two without job replay.

The full gateway suite passed 180 tests with one existing opt-in test skipped. Coverage was 92.70%
statements and 87.94% branches. The other suites passed 46 web, 314 catalog, 5 UI, 109 design-tool,
and 136 browser story tests. Coverage-backed Fallow reported no introduced findings. Architecture
boundaries are not configured, so that result does not establish architecture enforcement.
The lint baseline is 773 warnings, not warning-free. This change removes three old transport
warnings and adds none, leaving 770 warnings and zero errors.

Full transcripts and gate logs remain outside the review-media directory under
`/tmp/eth-89-logs` in the ETH-89 orb. `live-first.json` preserves both completed trials;
`live-final.json` preserves the later protocol failure. No learner database was modified.
