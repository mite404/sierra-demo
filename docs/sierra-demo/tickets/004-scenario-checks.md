---
linear: ETH-88
github: 5
filed: 2026-10-23
---
# Evaluate the outcomes each simulation requires

## Status

* **Goal**: U4. Grade supported business outcomes from ordered executor evidence, not model claims.
* **Initial priority**: P1
* **Effort**: Medium
* **Risk**: HIGH
* **Category**: feature
* **Planned at**: commit `6d27052e87a85d59257da30901e9ffee0c9185eb`, 2026-10-23

## Why this matters

A refund total alone cannot prove the agent waited for confirmation. A polite refusal cannot prove
the tool rejected an unauthorized request. Learners need to see both outcome and coverage.

## Current state

* `simulation.ts` infers applicability from principal and excludes duplicates by display label.
* Results lack the turn-linked evidence needed to prove confirmation happened before mutation.
* Existing checks do not distinguish any valid tool call from a denied Morgan-target attempt.

## Approach

* Implement U2's finite check IDs against the full scenario evidence and accepted policy.
* Capture only additional factual evidence needed for turn ordering, authorization, destination,
  and distinct duplicate attempts. Avoid a general assertion language or another model judge.
* Preserve manual test and no-model probe contracts while making scenario assessment explicit.

## Scope

* In: `simulation.ts`, `simulationContract.ts`, executor/turn trace evidence, and focused tests.
* In: any existing evidence presentation that must adapt to stable check IDs without regressions.
* Out: semantic scoring, keyword grading, arbitrary expressions, forcing unsafe calls for coverage,
  automated customer generation, and a vulnerable live-mode option.

## Steps

* Read parent R5-R6/R9 and KTD3. Map supported checks to applicable case/policy and required
  evidence.
* Preserve mandatory unchanged-control and security invariants regardless of selected goals.
* Prove valid denied Morgan-target attempts without accepting malformed/control-target substitutes.
* Prove confirmation-required with no earlier mutation, then exactly one refund after confirmation.
* Prove an authorized successful refund to the original destination and a distinct later blocked
  duplicate when selected. Do not infer either solely from final totals.
* Keep business failure, missing coverage, unfinished execution, and human wording review distinct.

## Test plan

* Test refusal without tools versus a genuine denied target call and a misleading control call.
* Test premature mutation versus confirmation then refund with identical final totals.
* Test no repeat attempt versus a distinct blocked duplicate after success.
* Test wrong amount, wrong destination, unrelated-$17 mutation, non-disclosing denials, and error
  after a committed refund. Never erase evidence or grant an incomplete run a final grade.
* See each added safety regression fail on its plausible wrong implementation before restoring it.
  Preserve the vulnerable probe's failure and corrected/legitimate-owner controls.

## Done when

* Every supported selected check uses stable IDs and evidence appropriate to its case/policy.
* Mandatory invariants cannot be deselected. Missing boundary coverage is never a pass.
* Ordered evidence distinguishes confirmation enforcement and duplicate rejection from final totals.
* No completed run passes with a selected obligation unmet or unexercised.
* Incomplete execution has no final business grade; human wording review stays separate.
* Red/green safety evidence and existing manual/probe tests/typechecks/lint pass before U5 starts.

## Notes

Risk is HIGH because an incorrect evaluator teaches false confidence. Depends on U3, ticket
`003-conversational-authoring.md`. Follow the parent plan. One Amp Medium thread in a Small orb
uses `poteto-mode` and vanilla Git. Start from verified `origin/main`. Meet every goal and
integrate its PR before U5. Do not let models invent checks or report their own success.
