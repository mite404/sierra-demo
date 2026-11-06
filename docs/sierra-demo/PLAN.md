# Sierra demo plan

## Purpose

Build a short, hands-on teaching demo for a Sierra Developer Relations application. Show how to
turn familiar business expectations into checks, then test them through customer stories.

This is the independent `mite404/sierra-demo` sample, not Sierra's product or SDK. It inherits
components from `mite404/yaklabs` and keeps their source notices. Existing YakLabs infrastructure,
accounts, deployments, and credentials are not demo resources.

This document owns the demo's general purpose, teaching approach, scope, and safety boundaries.
The [simulations implementation plan](../plans/simulations-plan.md) owns feature-specific flows,
UI states, contracts, implementation steps, and acceptance checks.
[VIDEO.md](VIDEO.md) owns the operator's rehearsal and recording instructions.

## Teaching approach

Start with what a business expects, in ordinary language. Let the learner supply the expectations
and customer situations. The agent asks only for missing details that affect the test. Do not
preemptively write the edge cases or answers for the learner.

Separate a general expectation from the situation used to test it. "Only the owner can access
their account" is a rule. Someone requesting their spouse's refund is one situation testing it.
"One refund per payment" and "Original payment method only" are separate expectations, not
separate customer stories.

Separate expectations so a failure explains which expectation was not met. Show what has been
configured separately from what has been run and proved. The model cannot approve its own work
or award itself a passing grade.

Keep the learner in one authoring conversation. They review the completed proposal and explicitly
create a simulation before it becomes runnable. A simulated customer then tests the support agent.
Those actors have separate histories and permissions even though the learner uses one workspace.

## Scope

Use one subscription-refund story with two starting situations. The account owner requests a
refund, and someone else requests it. The owner story can include consent and a repeat request.
The other-person story tests privacy and permission while preserving helpful owner-sign-in advice.

Use synthetic Casey and Morgan accounts and payments. The demo needs no real payment provider,
customer database, account sign-in, identity verification, or representative-contact service.
Referral guidance stays in the conversation. No contact popup or actual handoff is needed.

Use Kimi K3 through the existing OpenRouter transport for authoring and live customer/support
dialogue. Keep deterministic code checks and human wording review separate. Saved simulations
and completed evidence may persist locally. A repeated run starts with fresh synthetic state.

Keep the existing visual language and components. Sierra's screenshot guides information layout,
not a replacement brand palette. Follow [design-pillars.md](../design-pillars.md), catalog tokens,
and the repository's component rules. Keep the independent-demo and synthetic-data labels visible.

## Safety requirements

* R1. Use only synthetic identities, payments, and customer situations in this lesson.
* R2. Help unauthorized requesters understand the owner's standard sign-in path. Do not disclose
  private details, request passwords, invent verification links, or claim a refund occurred.
* R3. Complete legitimate owner refunds without allowing a second refund of the same payment.
  Refund only the invoice-derived amount to its original payment method.
* R4. Isolate each run's starting state. Preserve actual mutations and evidence on interruption.
  Keep deliberately vulnerable teaching probes separate from the corrected live path.
* R5. Derive authorization from trusted runtime identity, never chat text or model arguments.
  Check permission before private reads or writes. Claimed relationships do not grant access.
* R6. Judge business outcomes from actual tool attempts and before/after state, not narration.
  Retain explicit confirmation ordering and duplicate-refund evidence where the test requires them.
* R7. Keep completed, failed, incomplete, cancelled, and not-exercised outcomes distinct. A refusal
  without a tool attempt does not prove the executor's authorization boundary was exercised.
* R8. Require explicit creation and run actions. Never replay work automatically on refresh or
  restart. Keep saved definitions and their historical evidence tied to the correct revision.
* R9. Present this as an independent educational demo, with synthetic-data labels and no claim of
  Sierra affiliation or private implementation knowledge.
* R10. Make the lesson usable without code editing. Keep expectations, conversation, and supporting
  evidence understandable, accessible, and usable at desktop and narrow widths.
* R11. Supply a runnable preview, inspected visual evidence, executable checks, and recording
  guidance. Ethan supplies the final personal narration.

## Boundaries

Do not add unrelated stories, a generic agent builder, arbitrary check code, a canvas, scheduling,
bulk evaluations, voice, login, or deployment. Do not introduce a model judge for this lesson.
Human judgment assesses helpfulness; executable assertions assess money and permissions.

Keep secrets server-side and calls bounded and cancellable. Expose the no-login lesson only
through the access-controlled Amp portal. Public deployment or real integrations need separate
authorization. Never reuse existing YakLabs services or credentials.

Preserve existing saved learner work unless the learner explicitly confirms Reset demo to start
a clean recording. The two-story teaching scope is not a storage cap.
Retain useful inherited code outside the reachable demo rather than broadening this feature into
a repository rewrite.

## Completion standard

A learner can describe, create, run, inspect, and repeat both starting situations. The authorized
owner receives the correct refund, and another person cannot access the owner's account or refund.
The evidence explains each selected expectation without presenting missing coverage as success.

Tests exercise the real executor and HTTP contracts. Live-model runs demonstrate actual model
behavior. Rendered checks and inspected recordings demonstrate the learner's experience. None
substitutes for another. Report unavailable live checks and unfinished delivery steps explicitly.

## References

* Sierra's [simulation
  workflow](https://sierra.ai/blog/simulations-the-secret-behind-every-great-agent).
* Sierra's [agent development lifecycle](https://sierra.ai/blog/agent-development-life-cycle).
* Sierra's [public Agent SDK overview](https://sierra.ai/product/agent-sdk).
