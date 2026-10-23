---
linear: ETH-89
github: 6
filed: 2026-10-23
---
# Run bounded multi-turn customer simulations

## Status

* **Goal**: U5. Run a real K3 customer against the support agent and retain honest completed
  evidence.
* **Initial priority**: P1
* **Effort**: Medium
* **Risk**: HIGH
* **Category**: feature
* **Planned at**: commit `6d27052e87a85d59257da30901e9ffee0c9185eb`, 2026-10-23

## Why this matters

The learner needs a simulated customer that reacts across turns, not a fixed opening message.
The transcript, payment effects, and check results must remain trustworthy through failures.

## Current state

* Manual HTTP sessions retain state, but `simulationAgent.ts` uses fixed opening/pressure turns.
* Session DELETE removes a Map entry without owning cancellation of active automated work.
* U2 stores approved definitions. U4 supplies scenario-specific checks. Completed runs are not
  durable.

## Approach

* Add a server-run K3 customer that produces one bounded message or stop decision at a time.
  Await each actual support reply before generating the next customer turn.
* Reuse the corrected support-agent/executor path. The customer sees instructions and visible
  dialogue, never tool outputs, hidden fixtures, evaluator goals, or trusted identity metadata.
* Own abort and run identity on the server. Save completed immutable evidence in local D1 and
  atomically retain the latest two completions per saved test. Do not persist active actor jobs.

## Scope

* In: gateway simulation contracts, model/actor/runner routes, streaming, storage and result
  migration.
* In: start/read/stop, idempotent creation, fresh rerun, result readback, human-review persistence,
  and bounded result retention. Extend the existing test harness for real local restart checks.
* Out: multiple simultaneous automated runs, durable job queues/resume, actor refund tools,
  arbitrary fixtures, LLM judging, retrying ambiguous side effects, and remote deployment.

## Steps

* Read parent R4-R8 and KTD3-KTD6. Start from an approved saved revision and server-owned fresh
  state.
* Project only customer-visible context into actor requests. Keep support tool authority unchanged.
* Stream genuine customer/support events with role labels and a single scenario-level terminal
  event.
* Enforce six customer turns, eight tool calls, four support rounds, 1,400 output tokens per call,
  20-second provider timeout, 45-second support-turn and 240-second whole-run deadlines initially.
* Own cancellation through termination. Stop/disconnect/delete abort both roles and reject late
  work.
* Save completion snapshots with model provenance, ordered trace, all checks, before/after state,
  definition/settings revision, and pending human review. Await save before claiming durability.
* Commit/prune atomically by run ID. Cancel/error/timeout must not evict completed results. A retry
  after a storage failure may save computed evidence, but cannot rerun tools or the model.

## Test plan

* Drive owner confirmation, successful refund, and repeat request across at least three real turns.
  Show the next generated turn responds to preceding visible dialogue, not a predefined script.
* Capture outgoing actor requests in tests to prove no private fixture, tool output, or rubric
  leaks.
* Test duplicate starts, changed/stale revisions, early stop, malformed actor output, concurrent
  starts, both-role timeouts, turn/tool limits, cancellation before/after mutation, active deletion,
  and late events. Preserve committed state and give unfinished executions no grade.
* Use real local D1 to store three completed runs, redeliver a completion, restart Wrangler, and
  read exactly the newest two. Test atomic storage failure and interruption without eviction.
* Verify real K3 spouse and owner runs. Keep deterministic transport tests for adversarial outcomes.

## Done when

* A real K3 actor generates sequential customer turns against the corrected live support path.
* The actor cannot call tools, change identity/settings, read instructor evidence, or grade itself.
* Exact approved revision/settings and fresh initial invoices define each explicit rerun.
* Run IDs prevent duplicate execution, and server-owned cancellation stops further work honestly.
* Only normally completed scenarios receive final business assessments. Partial evidence survives.
* Latest-two retention is atomic/idempotent and survives a real local process restart.
* Real-call, race, storage, regression, typecheck, and lint evidence pass before U6 starts.

## Notes

Risk is HIGH because two autonomous roles share a side-effecting session. Depends on U4, ticket
`004-scenario-checks.md`. Follow the parent plan. One Amp Medium thread in a Small orb uses
`poteto-mode` and vanilla Git. Start from verified `origin/main`. Meet every goal and integrate
its PR before U6. Provider/model failures block live acceptance; mocked output is not live proof.
