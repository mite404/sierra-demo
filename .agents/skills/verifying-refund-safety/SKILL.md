---
name: verifying-refund-safety
description: >-
  Checks bounded refund authorization, consent, and idempotency against the Sierra plan.
  Use after changing the simulation executor, confirmation rules, fixtures, or continuation state.
---

# Verify refund safety

Run from the repository root:

```sh
pnpm --filter gateway exec vitest run src/simulationSafety.test.ts
```

This checks the real TypeScript executor with exhaustive generated inputs using the repository's
pinned Vitest version. No model, credentials, network, or separate model-checker install is needed.
It is bounded executable verification, not a proof for arbitrary inputs or the whole app.

## Coverage and bounds

Last synchronized with `adb4bfff8a7f574bb7fc4e3993ee121d84862cfd`.

Requirements come from `docs/sierra-demo/PLAN.md`: R3, R5, R6 and the execution trust boundaries.
The covered code is `runSimulation` and its synchronous `execute` closure in
`apps/gateway/src/simulation.ts`, plus `confirmedAt` in `simulationEvaluation.ts`.

The check enumerates all 8,000 combinations of three actions from a ten-symbol alphabet, two
trusted identities, two approval policies, and uninterrupted versus server-held follow-up execution.
Assertions run on every prefix of the recorded trace. Actions include identity spoofing, unknown
tools, extra model arguments, missing/control accounts, consent, refusal, agent-only consent, and
two calls in the same customer turn. There are at most six tool calls per path, below the cap of
eight. Fixtures are Morgan's $42 invoice and Casey's $17 immutable control. Tone is fixed to warm.

Properties and the harm each prevents:

- Only trusted Morgan can mutate Morgan's payment; chat cannot grant account access.
- Denials disclose no private payment fields or account existence.
- Unknown tools and extra arguments do not mutate invoices.
- Confirm-first refunds require a customer confirmation after a prior-turn confirmation prompt.
- At most one refund occurs, for exactly $42 to the original method; Casey stays untouched.
- Every mutation has contiguous before/after evidence, including across follow-ups.
- A legitimate owner can still complete both approval policies, so blanket denial cannot pass.

Excluded: HTTP workflow acceptance, D1 concurrency, model wording, UI races, cancellation, tool-cap
boundaries, arbitrary strings, amounts, and unbounded histories. The executor's validation,
authorization, mutation, and trace append currently have no await between them; this check does
not establish safety if that atomicity changes. Existing HTTP/browser tests remain necessary.

## Recheck changes

1. Compare covered files with the sync commit. Confirm that trusted identity, fixture ownership,
   confirmation turns, continuation state, and synchronous mutation still match these assumptions.
2. Run the command. A failure prints a counterexample with identity, policy, continuation mode,
   and action indices into the test's alphabet. Read the nested assertion for the violated promise.
3. Reproduce a failure through `runSimulation`. Report product bugs without weakening assertions.
   If intended behavior changes, update the alphabet, independent expectations, and bounds together.
4. Prove sensitivity with a temporary real-code mutation, then restore only that mutation:
   bypass `authorized`, remove the duplicate guard, bypass confirmation, or change the refund
   destination. Each must fail. Run the restored check and gateway typecheck before finishing.
5. Advance the sync commit only after checking that the verification still describes the code.

The intentionally vulnerable teaching branch is excluded from passing runs. Never relabel its
expected unauthorized mutation as corrected behavior.

## Initial sensitivity evidence

All seven temporary mutations failed the check, and the restored executor passed. These mutations
changed product code, not assertions or a parallel model:

| Mutation | Observed failure |
| --- | --- |
| Force authorization true | Spouse's first Morgan request discloses payment output |
| Remove duplicate guard | Owner's repeated request issues more than one refund |
| Bypass confirmation | Owner's ordinary request refunds before explicit consent |
| Set refunded destination to `other` | Payment state no longer records the original method |
| Record pre-call state as post-call evidence | Recorded successful refund lacks its mutation |
| Accept extra tool properties | Injected identity/amount/destination arguments are accepted |
| Deny every account | Legitimate owner cannot complete either approval policy |

For verification drift after skipped checks, use `/maintain-formal-verification-skill`.
