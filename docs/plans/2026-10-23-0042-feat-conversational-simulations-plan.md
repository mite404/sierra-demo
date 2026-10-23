---
title: Conversational simulation authoring
date: 2026-10-23 00:42 America/New_York
type: feat
status: planned
---

# Build conversational simulation authoring

## Goal capsule

Let a non-technical learner describe a refund test, review what the system understood, save it,
and watch a simulated customer test the real support agent over multiple turns. Show what happened
to the payments separately from whether the agent gave helpful advice. Keep manual customer tests.

This extends [the refund lesson](../sierra-demo/PLAN.md), not the inherited YakLabs application.
Use synthetic Casey and Morgan accounts, Kimi K3 through OpenRouter, and the existing corrected
refund executor. No Sierra SDK integration or public deployment is implied.

## Settled choices

* The user chose the synthetic refund domain and `moonshotai/kimi-k3` with their OpenRouter key.
* The user accepted automated customers alongside manual tests, deterministic business checks,
  human review of wording, and saved definitions with the latest two completed results.
* The user authorized the `sierra-demo` Linear project, mirrored GitHub issues, and matching labels.
* Each implementation ticket gets one Amp Medium thread in a Small orb, using `poteto-mode`.
* U1 and U2 may implement in parallel in separate orbs with separate code ownership. Integrate U1
  before U2, then start U3 after both meet their goals and reach `origin/main`. Later units remain
  sequential. Evidence, not another manual approval, is the integration gate.
* This thread plans the work and files the tickets. Implementation runs in separate ticket-owned
  threads. No owner may deploy, publish live access, or change shared infrastructure under this
  authorization.

## Requirements

* R1. Describe a test in ordinary chat. Ask only for missing customer identity, behavior, or desired
  outcome. Unsupported requests get an explanation and a supported alternative, never fake support.
* R2. Review a proposed test before saving. Show its name, customer, starting facts, customer
  instructions, business checks, human-review questions, and frozen accepted workflow settings.
* R3. Save and reopen independent test definitions. Edits create revisions. Existing run evidence
  continues to name the exact revision and workflow settings used at execution.
* R4. Generate each customer message from Kimi K3 and preceding visible dialogue. The support agent
  uses the real refund path. No prerecorded transcript, fixed pressure script, or model-generated
  grade.
* R5. Keep identity, invoice state, refund destination, security rules, credentials, and executor
  selection outside authored text. Live automated runs always use the corrected executor.
* R6. Present selected expected outcomes against actual evidence. Separate safety, boundary
  coverage, and human review. Cancellation, timeout, errors, and exhausted limits receive no grade.
* R7. Rerun explicitly with fresh synthetic state. Compare the latest two completed results per
  saved test. Keep cancelled or errored partial evidence visible without evicting completed results.
* R8. Saved definitions and completed results survive Worker restarts using the same local storage.
  In-flight execution does not resume or replay automatically. Reset does not delete saved tests.
* R9. Teach a repeatable method with the unauthorized spouse and authorized owner controls. Preserve
  the separate corrected and vulnerable no-model probes. A refusal is not proof of tool enforcement.

## Learner journey and controls

| Step | Controls and placement | What the learner learns |
| --- | --- | --- |
| Configure | Existing employee chat and Accept workflow | Agent behavior is configurable; authorization is not. |
| Describe a test | New Create simulation stage, existing composer, optional draft-only examples | Describe the customer, circumstances, and desired outcome without code. |
| Clarify | Same authoring chat with focused follow-ups | Customer knowledge and the first message are different. |
| Review | Always-visible test summary beside chat, Revise in chat, Save simulation | Inspect the proposed test before trusting it. Saving is explicit human approval. |
| Reopen | Compact Saved simulations list with names and revision, Open, Edit in chat | A simulation is a reusable definition, not a disposable chat. |
| Run | Run simulation and running-only Stop in the selected test view | A simulated customer talks to the real agent with fresh state. |
| Inspect | Transcript, expected/actual checks, readable payment before/after, expanded tool JSON | A convincing answer and a correct business outcome are separate. |
| Review wording | Per-run Meets guidance / Needs improvement with an optional note | Helpful language needs human judgment in this sample. |
| Repeat | Run again and Previous / Latest result comparison in the same view | Repeated trials reveal variation; one pass is not a guarantee. |

Do not add a second form builder. The summary is read-only. Users revise through chat and explicitly
save a new revision. Reuse the existing composer, thread, sidebar, tokens, and status vocabulary.
New composed UI components follow the repository's shadcn rule. Keep evidence visible by default.
At narrow widths, stack the inspector below the chat without claiming everything fits at once.

## Data and trust decisions

### KTD1. Use one explicit product model

Use `moonshotai/kimi-k3` for workflow chat, test authoring, the simulated customer, and the support
agent. The existing shared model constant currently points at K2.6. Reuse the existing OpenRouter
transport. Verify genuine streaming and tool calls before building on it. Do not silently fall back
to another model or mistake the implementation thread's Medium dial for the product model.

OpenRouter's public catalog lists the exact K3 identifier and tools. Access using this key and
compatibility with the current Anthropic-format request remain U1 verification gates. Missing or
rejected credentials must leave stored tests readable and produce an explicit live-run error.

### KTD2. Save a bounded, human-approved definition

Use a strict shared Zod contract. A definition contains a short name, the named Casey/spouse or
Morgan/owner case, bounded customer instructions, selected supported business check IDs, human
review guidance, and an accepted workflow snapshot resolved by the server. Include a stable test
ID, monotonically increasing revision, and timestamps. Saving the completed, reviewed proposal is
approval. The model has no approval tool. A run names the saved ID and revision, never a browser
assertion of approval or caller-supplied settings.

The server maps named cases to fixed synthetic starting facts. Describe those facts in the review
summary; do not allow arbitrary invoices or account identities. Resolve workflow settings from an
accepted employee session on first save. Edits inherit that saved snapshot, so authoring and reruns
do not require the original session to survive. To test different workflow settings, accept a new
workflow and create another simulation. An edited proposal is unsaved until accepted again.
Keep the current approved revision and immutable run snapshots; a full revision-history product is
unnecessary. Never rewrite the definition behind an old run.

### KTD3. Keep checks finite and independent

Supported checks cover Morgan's payment remaining untouched for Casey, a denied Morgan-target tool
attempt, non-disclosing tool denials, Morgan's full refund exactly once to its original destination,
confirmation before mutation when configured, and rejection of a later duplicate request.

The Casey $17 control invoice staying untouched is mandatory. Users cannot turn that invariant or
authorization off. Validate check compatibility with the chosen case and approval policy. Unknown
checks, arbitrary expressions, code, or model-reported expected monetary values are unsupported.

Evaluate full scenario evidence with stable check IDs and turn ordering, not display-label matching
or only final totals. A refusal without a Morgan-target attempt leaves boundary coverage not
exercised. An invalid or unrelated-target call does not count as authorization coverage. A completed
run cannot pass if a selected obligation lacks evidence. Human wording review remains separate.

### KTD4. Give the customer only customer-visible information

The authoring model proposes definitions. The customer model generates one bounded message or a
stop decision at a time. The support model alone requests refund tools. The evaluator reads actual
executor evidence. Neither model grades itself.

Give the customer its approved instructions, allowed synthetic customer facts, and visible chat.
Do not send trusted principal metadata, hidden fixture objects, tool JSON, checks, verdicts, or
instructor guidance to that actor. Never use check results to steer the next customer message.
The support agent retains its trusted runtime context. Generated claims cannot change identity.

### KTD5. Persist saved records locally, not active actors

Use a simulation-only local D1 binding and direct prepared statements. No ORM, remote database,
Durable Object routing, or browser-as-authority store is needed. Keep existing employee/manual
sessions ephemeral. Use a stable ignored persistence directory and apply local migrations on start.
Verify the installed Wrangler version can migrate without provisioning a remote database.

Keep all new routes behind the existing same-origin/no-store guards. Bind locally and expose only
through the access-controlled Amp portal. Opaque IDs are not authentication. Never expose this
no-login lesson publicly. Credentials stay in server secret bindings, never D1 or browser storage.
Synthetic inference still sends instructions/dialogue to OpenRouter; local storage is not local AI.

Retain two completed results per saved test, including across revisions. Store each immutable
definition snapshot, both model identities, visible transcript, tool evidence, all check results,
before/after state, and human-review state. Commit completion and prune older completed results
atomically. Duplicate delivery of a run ID must not consume another retained slot. Failed business
checks on a completed run count as completed results. Failed execution and cancellation do not.

Await storage success before claiming a result was saved. On a storage error, preserve prior
results and show the computed run as unsaved. Retrying persistence must not rerun tools or models.
This survives process restarts with the same directory, not deleting the orb or sharing across orbs.

### KTD6. Bound execution and keep cancellation truthful

Start runs with an idempotent opaque creation handle. Limit the installation to one active
automated run initially. Separate manual sessions remain usable and cannot write the actor's state.
Use six customer turns, eight cumulative refund-tool calls, four support model rounds per turn,
1,400 output tokens per call, a 20-second provider-request timeout, a 45-second support-turn
deadline,
and a 240-second whole-run deadline initially. U1 and U5 must verify these budgets against K3.

Use server-owned abort controllers. Stop, disconnect, reset, and active deletion abort both roles
before any next turn or uncommitted mutation. Preserve committed refunds and partial evidence.
Keep ownership until the run has actually terminated. Do not retry ambiguous model/tool work.
Distinct reasons are completed, cancelled, timed out, limit exhausted, and errored. Only a normal
scenario completion receives a final business assessment. A support turn ending is not run
completion.

Refresh reads existing run state without POSTing again. Stop active work when the stream
disconnects.
A Worker restart loses active execution and requires an explicit fresh run. Never reconstruct
payment authority from browser history. Saved tests/results load independently of session recovery.

## Implement seven units with ordered integration

Each unit has a companion ticket under `docs/sierra-demo/tickets/`. Linear owns status, the Markdown
owns scope, and GitHub owns discussion. Use ticket goal evidence as the integration gate. Rebase
each new owner onto the verified predecessor in `origin/main`, not another orb's local `main`.

| Unit | Deliverable | Integrates after | Verification before advancing | Ticket |
| --- | --- | --- | --- | --- |
| U1 | Kimi K3 live transport | None | Real streaming workflow and tool-using customer turn with exact model provenance. | [ETH-85](https://linear.app/mite404-workspace/issue/ETH-85/use-kimi-k3-for-the-live-refund-lesson) |
| U2 | Approved saved definitions and local storage | U1 | Strict HTTP contracts, explicit save, real local restart with definitions intact. | [ETH-86](https://linear.app/mite404-workspace/issue/ETH-86/save-approved-simulation-definitions-locally) |
| U3 | Conversational authoring, review, saved-test list | U2 | Browser create → clarify → revise → save → reopen, including stale-save rejection. | [ETH-87](https://linear.app/mite404-workspace/issue/ETH-87/author-and-review-simulations-through-chat) |
| U4 | Scenario-specific business checks | U3 | Red/green evaluator cases for refusal, denied target, confirmation order, duplicates, and wrong mutations. | [ETH-88](https://linear.app/mite404-workspace/issue/ETH-88/evaluate-the-outcomes-each-simulation-requires) |
| U5 | Bounded multi-turn customer execution and result retention | U4 | Real K3 dialogues, cancellation races, fresh reruns, restart and atomic two-result retention. | [ETH-89](https://linear.app/mite404-workspace/issue/ETH-89/run-bounded-multi-turn-customer-simulations) |
| U6 | Run controls and understandable result comparison | U5 | Browser run → inspect → human review → rerun → compare, refresh and narrow states. | [ETH-90](https://linear.app/mite404-workspace/issue/ETH-90/run-simulations-and-explain-their-results) |
| U7 | Recording-ready teaching journey | U6 | Clean-start live rehearsal, inspected recording, restart demonstration, accurate launch/script docs. | [ETH-91](https://linear.app/mite404-workspace/issue/ETH-91/prove-and-script-the-complete-teaching-journey) |

U2 owns server-held validated drafts and explicit saves, not an authoring model or unused result
tables. Its HTTP contract is independently testable before U3 connects K3 chat to those drafts.
U1 owns model transport, focused model tests, model-facing launch notes, and initial delivery of
these planning documents. U2 owns shared simulation contracts, Worker routes and their tests, local
storage and migrations, simulation Wrangler configuration, and gateway startup scripts.
U2 may start from the common `origin/main` base and verify with controlled external model transport.
Before U2 integrates, rebase onto integrated U1 and rerun combined checks. Linear's U2 blocked-by-U1
relation records integration order, not an implementation-start blocker.
U4 owns check semantics before U5
depends on them. U5 adds result persistence when the runner produces results. U6 presents those real
results. U7 proves the complete lesson instead of introducing another product feature.

## Verification contract

Run focused gateway and web tests as each owner changes their behavior. Use these baseline commands,
then add the narrow scripts named in the ticket when they exist.

```sh
pnpm --filter gateway exec vitest run src/simulation.test.ts src/simulationWorker.test.ts
pnpm --filter web test
pnpm --filter gateway typecheck
pnpm --filter web typecheck
pnpm lint
amp orb services ensure
node apps/web/scripts/simulation-check.mjs --live on --out .amp/in/artifacts
```

Test the real executor and HTTP routes. Stub only external model transport in deterministic tests.
Run real Wrangler against disposable isolated local storage to prove migration/restart behavior.
Each safety regression must fail on the plausible wrong implementation it is meant to catch.
Do not modify or erase the learner's saved lesson database during verification.

For visual changes, use `control-ui` and installed `agent-browser`, inspect representative rendered
states, and include labeled screenshots plus a short inspected interaction recording. Show empty,
draft, saved, running, complete, incomplete, error, and narrow layouts where that ticket changes
them.
Keep full logs outside the chat. Save only reviewable media under `.amp/in/artifacts/`.

Live K3 calls are required for U1, U5, and U7. Provider unavailability blocks their live acceptance;
mocked transport cannot satisfy it. Do not expand model budgets silently to manufacture a pass.
Verify no API key reaches browser bundles, stored definitions/results, logs, or captures.

## Definition of done

* A learner authors both a spouse-pressure test and an owner-confirm-repeat test through chat.
* The learner reviews, revises, saves, reopens, and explicitly runs either definition without code.
* A real K3 customer reacts to the support agent across turns through the corrected refund path.
* Expected outcomes and payment evidence support the business assessment. Human review stays human.
* Reruns start fresh. Two completed results remain comparable with their original revision/settings.
* Worker restart preserves saved tests/results, loses active sessions honestly, and never replays
  work.
* Existing manual testing and separately labeled no-model probes still work.
* Every ticket's stated goals and relevant checks pass before its dependent integrates. Only U1 and
  U2 may implement concurrently. U3 and later threads start after their predecessors integrate.
* Launch instructions and the five-minute script match the actual UI. Ethan records final narration.

## Risks, exclusions, and open questions

No product questions remain. Assume retention means two results per test and only one concurrent
automated run. These are bounded defaults, not a multi-user queue or a general run-history product.
Use plain-language names for customers, checks, and payments; keep raw JSON as supporting evidence.

The authoring model can misunderstand requests. The visible summary, server validation, and explicit
save contain that risk. K3 may stop early or produce inconsistent conversations. Record the honest
coverage outcome and let the learner rerun; do not script a guaranteed pass or grade by keywords.

Exclude real agents/accounts, arbitrary workflows/check code, importers, a canvas, a second form
builder, bulk scheduling, dashboards, login, a judge model, automatic code fixes, and deployment.
The vulnerable executor remains probe-only on separate fresh state, never an authored live option.

Planning confidence review identified persistence and actor/evaluator boundaries as the two gaps.
Read-only research resolved the storage choice and exposed confirmation/duplicate applicability
changes now assigned to U4. Remaining runtime facts are explicit U1/U2/U5 gates, not assumed proof.
No live model calls, browser runs, builds, or implementation tests ran while preparing this plan.

## Sources

* Existing scope and script under `docs/sierra-demo/PLAN.md` and `docs/sierra-demo/VIDEO.md`.
* Existing gateway `simulationContract.ts`, `simulationModel.ts`, `simulationWorkflow.ts`,
  `simulationWorker.ts`, `simulation.ts`, and web `simulation-*` components.
* [Sierra's simulations
  article](https://sierra.ai/blog/simulations-the-secret-behind-every-great-agent).
  Its screenshot separates customer instructions, context, and expected behavior. It does not prove
  that Sierra authors tests conversationally. This demo's conversational authoring is our design.
* [Kimi K3 on OpenRouter](https://openrouter.ai/moonshotai/kimi-k3).
* [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/).
* [Worker local data](https://developers.cloudflare.com/workers/local-development/local-data).
* [D1 atomic batches](https://developers.cloudflare.com/d1/worker-api/d1-database/).
