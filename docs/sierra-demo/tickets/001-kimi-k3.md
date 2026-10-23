---
linear: ETH-85
github: 2
filed: 2026-10-23
---
# Use Kimi K3 for the live refund lesson

## Status

* **Goal**: U1. Prove real Kimi K3 streaming and tool use through the existing OpenRouter client.
* **Initial priority**: P1
* **Effort**: Small
* **Risk**: MEDIUM
* **Category**: feature
* **Planned at**: commit `6d27052e87a85d59257da30901e9ffee0c9185eb`, 2026-10-23

## Why this matters

The learner must test real agent behavior with the requested model. A model label or a scripted
response cannot establish that the lesson actually calls Kimi K3.

## Current state

* `apps/gateway/src/simulationModel.ts` selects `moonshotai/kimi-k2.6` for the existing roles.
* OpenRouter lists `moonshotai/kimi-k3`. This orb has the server-side OpenRouter key, but no K3
  inference or transport compatibility check has run during planning.
* Existing limits are four support rounds, 1,400 output tokens, and a 20-second request timeout.

## Approach

* Change the shared product model to K3 and keep the existing streaming/tool transport. Make only
  provider-request changes demonstrated necessary by a real smoke test.
* Reject silent K2.6 fallback or fake live replies. If K3 is unavailable, preserve the error and
  block dependent work rather than weakening the acceptance gate.

## Scope

* In: `simulationModel.ts`, its focused tests, model provenance, and affected launch/model docs.
* In: the existing workflow and customer paths needed to verify the shared model change.
* Out: authoring, persistence, another SDK, new dependencies, deployment, and credential rotation.

## Steps

* Read the parent plan's R4-R5, KTD1, and verification contract before changing the client.
* Select the exact K3 identifier. Preserve server-only credentials and honest upstream errors.
* Exercise workflow proposal and a real authorized customer tool call with genuine text deltas.
* Record returned model provenance, tool evidence, and any necessary request-format change.

## Test plan

* Run focused gateway tests, gateway/web typechecks, and lint.
* Verify real upstream streaming and tools with the existing live browser harness or a narrow
  runtime check. Use synthetic data only and keep full redacted logs outside chat.
* Exercise rejected/missing credentials and interrupted output. Neither may receive a pass.

## Done when

* Workflow and customer requests actually use `moonshotai/kimi-k3` with no silent fallback.
* Real workflow text streams, and an authorized tool-using turn records a genuine refund result.
* Missing credentials, rejected provider requests, and interruptions remain explicit errors.
* API keys never appear in browser assets, output logs, persisted data, or screenshots.
* Relevant checks pass and real-call evidence identifies the requested model before U2 integrates.

## Notes

Risk is MEDIUM because K3 request compatibility is not yet proven. No predecessor. Follow
`docs/plans/2026-10-23-0042-feat-conversational-simulations-plan.md`. One Amp Medium thread in a
Small
orb uses `poteto-mode` and vanilla Git. Meet every goal, verify its PR, and integrate before U2
integrates. U2 may implement concurrently in its own orb. U1 owns model transport, focused model
tests, model-facing launch notes, and initial delivery of the planning documents. U2 owns contracts,
Worker routes and their tests, storage, migrations, simulation Wrangler config, and startup scripts.
The thread's Medium implementation model is separate from the product's Kimi K3 model.
