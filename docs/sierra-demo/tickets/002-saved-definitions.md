---
linear: ETH-86
github: 3
filed: 2026-10-23
---
# Save approved simulation definitions locally

## Status

* **Goal**: U2. Save bounded, reviewed test definitions that survive a local Worker restart.
* **Initial priority**: P1
* **Effort**: Medium
* **Risk**: HIGH
* **Category**: feature
* **Planned at**: commit `6d27052e87a85d59257da30901e9ffee0c9185eb`, 2026-10-23

## Why this matters

A learner needs a reusable test, not just a transcript. Its accepted settings must remain known
after the configuration chat expires, without trusting browser history or model assertions.

## Current state

* `simulationContract.ts` supports only workflow tone/approval and fixed customer selections.
* `simulationWorkflow.ts` and `simulationWorker.ts` keep acceptance and sessions in memory.
* `wrangler.simulation.jsonc` has no simulation database. Browser storage contains opaque handles.

## Approach

* Add strict draft/saved-definition contracts and shared finite check metadata. Saving a completed
  server-held proposal through an explicit human action creates an approved immutable revision.
* Use simulation-only local D1 and prepared statements. Snapshot accepted workflow settings from
  the server, not a posted config object. D1 avoids a new ORM or Durable Object routing.
* Separate saved records from temporary sessions. Do not build unused result persistence yet.

## Scope

* In: `simulationContract.ts`, `simulationWorker.ts`, proposed `simulationStorage.ts`, a local SQL
  migration, simulation Wrangler configuration, and gateway startup scripts.
* In: create/list/read/revise saved definitions and proposal validation needed by U3.
* Out: arbitrary checks, caller-supplied invoice state/identity, remote databases, login, auto-run,
  actor execution, result tables, deletion UI, and deployments. These do not serve saved
  definitions.

## Steps

* Read parent R1-R3/R5/R8 and KTD2-KTD5. Define name, named customer, bounded instructions,
  supported
  checks, human guidance, server-resolved workflow snapshot, stable ID, revision, and timestamps.
* Validate compatible customer/check/policy combinations and reject security/executor fields.
* Keep approval server-held. Validate proposal completion and expected revision on explicit save.
* Expose validated server-held draft creation independently of K3 authoring. U3 later supplies the
  conversational proposals. On edit, inherit the saved workflow snapshot without a live employee
  session. A different workflow requires a newly accepted configuration and a new simulation.
* Add direct D1 storage and simulation-only routes with optimistic revision checks.
* Apply local migrations before startup using the same stable ignored persistence directory.
* Keep saved-list/read operations available independently of missing keys or expired role sessions.
* Preserve same-origin/no-store guards, loopback binding, access-controlled portals, and server-only
  secrets on every new route. Scenario IDs are not authentication.

## Test plan

* Extend HTTP tests for valid save/list/read, forged approval/settings, unsupported check IDs,
  incompatible selections, stale revisions, concurrent saves, and reset racing with save.
* Prove saved workflow snapshots remain usable after original workflow-session loss.
* Run real Wrangler with disposable local D1, apply migrations twice, save a definition, restart,
  and read the same revision. Use the same directory and no remote database provisioning.
* Verify failed migrations/storage writes are explicit and do not silently reseed saved records.

## Done when

* A valid server-held proposal becomes an approved definition only after explicit human save.
* Definitions retain immutable revisions and authoritative workflow snapshots across process
  restart.
* Unknown checks, forged authority/settings, and incompatible combinations are rejected before work.
* Concurrent or stale saves cannot overwrite a newer revision or revive a cleared proposal.
* Session Reset/New workflow does not delete the saved library. Missing keys do not hide it.
* Real local D1 restart proof and relevant gateway tests/typechecks/lint pass before U3 starts.

## Notes

Risk is HIGH because saving crosses the approval boundary. Depends on U1, ticket
`001-kimi-k3.md`. Follow the parent plan. One Amp Medium thread in a Small orb uses `poteto-mode`
and vanilla Git. Implementation may run alongside U1 from the common `origin/main` base in a
separate orb. U2 owns contracts, Worker routes and their tests, storage, migrations, simulation
Wrangler config, and startup scripts. Verify storage with controlled external model transport.
U1 owns initial planning-document delivery. Rebase onto verified U1 in `origin/main` and rerun
combined checks before integrating U2. The Linear dependency records this integration order.
Meet every ticket goal and integrate its PR before U3 starts. Persistence covers the same local
directory, not orb replacement.
