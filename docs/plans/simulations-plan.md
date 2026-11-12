# Implement learner-authored refund simulations

## Goal

Implement the authoring and simulation feature within the general scope in
[PLAN.md](../sierra-demo/PLAN.md). This document owns the specific interaction, data, and
verification
contracts. The follow-up ticket is [008](../sierra-demo/tickets/008-two-refund-simulations.md).

Start from the latest `origin/main`, including PR #32. Keep existing saved definitions and results
readable. This feature requires local implementation and a testable Amp portal, not publication,
deployment, a new provider integration, or additional implementation threads.

## One conversation authors each simulation

The opening chat is the authoring chat. The starter "Help our team handle subscription refunds."
only fills the draft. The learner sends it and describes the desired business outcome.

Do not require a separate workflow conversation, Accept workflow step, invitation modal, or
four-way tone/approval question. Use the bounded warm, confirm-first refund lesson. The server owns
that configuration. Creating the simulation approves its complete snapshot.

The model asks one focused question at a time, only when a missing detail affects this test. It
must use earlier answers and fixed demo facts instead of re-asking known information. It must not
suggest the spouse story, write the expected rules for the learner, or invent customer persistence
to complete a checklist. A detailed first message can be sufficient. A vague request cannot.

The conversation establishes the requester, accessible account, payment situation, what the
customer knows, what they ask for, how they respond, and the expected ending where relevant.
These are considerations, not mandatory form fields or a rigid questionnaire.

Separate a business rule from a customer story. "Only the owner can access their account" is an
expectation. Someone requesting their spouse's refund is a situation exercising that expectation.
The agent can help separate expectations so a failure identifies which expectation was not met.

## Reveal configured behaviors before creation

Show each Expected agent behavior bullet only after sufficient learner-supplied information
defines and exercises it. Communicate established expectations as validated supported check IDs
through the existing author completion and session-read contracts. Do not derive readiness or
progress from model prose or a success phrase.

Treat each author step's check list as the current complete set, not an append-only union. A
correction can remove an expectation. Restore the last server-confirmed set from an author session.
Errors, cancellation, or incomplete replies cannot install speculative progress or enable creation.

Green setup dots mean configured. They never mean a check passed. Show that distinction in visible
and accessible text. Reuse `--saved-ink` for the user-requested green markers.

## End authoring with one review popup

A validated complete proposal opens a summary popup over the same grayed, blurred authoring chat.
Reuse the existing results blur treatment, including inert background content and keyboard focus
behavior. Do not open the popup for partial or invalid proposals.

Explain that enough information has been gathered to create the checks and simulation. Show the
name, User instructions, Device type: Desktop web, and established Expected agent behavior bullets.
The summary is read-only. Revise in chat closes the popup and returns to the same conversation.

Create simulation approves and saves the exact server-held draft and frozen workflow snapshot.
Only that click creates the sidebar row. The model cannot save or approve it. A failed save must
not pretend creation succeeded or silently retry. Editing an existing record creates a revision
without changing historical run snapshots.

## The sidebar contains stories, not individual checks

Match the supplied Sierra screenshot's information layout using existing catalog and shadcn
components, spacing, type, and semantic tokens.

* Put Play above the Simulations column. Reuse its existing saved-form submission path.
* Group created simulations under Subscription refunds. No preseeded rows, disabled named examples,
  or canned story shortcuts. A blank lesson has no simulation entries.
* Teach only Account owner asks and Someone else asks. These are the two starting situations of
  one refund story, not a global two-record storage limit. Preserve existing learner work.
* Keep the selected simulation's User instructions, Desktop web device, and green expected-behavior
  bullets above a separator and conversation. Saved instructions retain the existing monospace rule.
* Add a filled green circle-check at the right of the simulation name only for actual completed
  passing evidence. Keep readable not-run, running, failed, incomplete, and not-exercised states.
  Preserve evidence on reopening.

The results popup places View Database Proof beside View conversation. Reuse the existing green
JSON evidence view for recorded synthetic payment state and tool attempts. Show before/after
values from that run, not the agent's success claim. Back to results returns to the checks without
starting another run; View conversation dismisses the popup.

Show only the authenticated user's account and payment, with one email-form username. Morgan's
owner simulation shows `morgan@example.com` and `CC_provider: "visa"`. The other-person simulation
shows `casey@example.com` and `CC_provider: "american_express"`, not Morgan's private record.
Use payment ID, decimal dollar amount (`"50.00"` for Morgan, `"17.00"` for Casey), currency, and
original payment-method ID, following the common shape of
[payment methods](https://docs.stripe.com/api/payment_methods/object) and
[refunds](https://docs.stripe.com/api/refunds/object). `CC_provider` is the lesson's card-brand
label, not a unique card or refund destination. Keep the original method ID to demonstrate that
the refund returns to the same card. Show refund count, refunded amount, and confirmation and
ownership decisions from actual recorded attempts. Preserve full execution evidence server-side.
The proof uses two-place decimal strings; execution retains exact integer cents internally.
Older saved runs without card metadata remain readable; do not invent missing card details.

Casey's unchanged payment does not prove that Morgan's account was protected. Keep untested
ownership checks distinct from a completed passing check. Only highlight facts that support the
selected passed checks; do not color Casey's payment green for a check on Morgan's payment.

Account owner asks exercises a verified owner requesting an eligible refund, confirming when
asked, then asking again after success. Check consent, one refund to the original payment method,
and rejection of the later duplicate. Someone else asks exercises an unauthorized requester,
privacy and payment protection, and helpful guidance for the owner to sign in themselves.
Relationship and permission claims belong only in stories the learner supplies.

## Keep referral guidance in the conversation

Reject an already-refunded payment without another refund. If the learner asks for referral wording,
keep it in the conversation and saved wording guidance. Do not show a contact popup, call a handoff
API, claim external contact, or grade customer-service wording as executable evidence.

## Reset before recording

Place Reset demo at the bottom of the page. Require confirmation that it deletes all saved
simulations, revisions, run results, and chats in this demo. Cancel preserves everything.
Disable it during authoring or execution; the server also rejects reset until active work and
saves finish. Delete durable records in one transaction, then clear runtime and browser handles
and reload into an empty authoring chat. Failure must not pretend the reset succeeded. Repeating
the confirmed reset is safe. Never reset automatically on refresh or service restart.

## Reuse the existing trust boundaries

* `simulationContract.ts` owns strict Zod contracts for author sources, supported checks, drafts,
  saved revisions, streamed events, and restored sessions. Add only the narrowly named lesson
  source and partial expected-check progress needed by this flow.
* `simulationAuthor.ts` and `simulationAuthorModel.ts` resolve the server-owned source and request
  one bounded clarification or complete proposal. The model cannot save, run, or modify identity.
* `simulationWorker.ts` holds validated drafts and performs explicit saves to existing local D1.
  Continue supporting accepted workflow and saved-revision sources for older clients. Do not accept
  posted settings, invoice state, arbitrary principals, or model approval flags.
* Web author state remains a discriminated lifecycle. Partial expectations do not create a saved
  definition. Existing library, run controls, and saved-summary components retain their ownership.
* `simulation.ts` remains the real corrected executor. Amount and refund destination come from
  the invoice, authorization comes from trusted identity, and duplicate refunds remain impossible.
* `simulationEvaluation.ts` reads real trace/state. Models never grade themselves. Existing finite
  checks distinguish safe outcomes from whether the tool boundary was actually exercised.

Use `moonshotai/kimi-k3` through the current OpenRouter transport. Keep the author, simulated
customer, support agent, and evaluator separate. The customer receives approved instructions and
visible dialogue, not hidden principal metadata, tool JSON, checks, verdicts, or instructor notes.

Preserve fresh state per run, frozen snapshots, bounded execution, cancellation, no automatic
replay, and the latest two completed results per definition. Partial failed executions do not
evict completed results. No new migration, abstraction framework, or general policy language.
Keep existing local persistence and same-origin/no-store protections. Credentials stay server-side.

## Implementation sequence

1. Extend author contracts and Worker tests for a strict new-lesson source and progressive checks.
   Verify unknown fields, incompatible checks, client settings, and invalid proposals are rejected.
2. Update model instructions and author processing together. Use learner-supplied expectations,
   replace progress after corrections, and hold only complete validated proposals for review.
3. Start the UI directly in authoring. Add the completed-authoring summary popup and its explicit
   Create simulation action. Remove redundant setup/invitation UI and canned scenario examples.
4. Group actual saved definitions, reuse Play, render green setup dots and evidence-earned row
   circle-checks, and preserve the pinned summary above the streamed run conversation.
5. Extend existing HTTP and browser regressions, inspect real K3 authoring/runs, and update the
   rehearsal instructions to the observed UI. Do not make live behavior a guaranteed script.

The original seven feature units are tracked in tickets 001 through 007 under
`docs/sierra-demo/tickets/`. Their implementation is the baseline, not a requirement to restart
the feature in seven new threads.

## Verification

Use tests before behavior changes. Exercise the real executor and HTTP routes. Replace only the
external model transport in deterministic tests. Extend the existing browser lever rather than
adding a new framework. Use disposable local data without deleting learner records.

Verify empty first use, insufficient details, progressive checks, retraction, proposal revision,
popup blur/focus/dismissal, no sidebar row before explicit creation, and no automatic run. Verify
both stories, trailing circular row checks, no contact popup after duplicate rejection, restore,
cancellation, error states, and desktop/narrow layouts. A proposed expectation and an incomplete
run must never earn a tick.

Run applicable repository gates, keeping full logs local:

```sh
pnpm --filter gateway exec vitest run src/simulationWorker.test.ts src/simulationSafety.test.ts
pnpm --filter web test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
pnpm build
```

Build with `VITE_AUTH=none` for the lesson browser checks. Start the disposable acceptance server
and run `node apps/web/scripts/simulation-runs-check.mjs` against it. Controlled transport proves
UI and code behavior, not provider behavior. Start the real lesson with `amp orb services ensure`
and inspect genuine K3 authoring and owner/other-person runs separately.

The [simulation verification skill](../../.agents/skills/verifying-desktop-shell/SKILL.md) owns
the exact Playwright commands, covered code, viewport bounds, and real-source mutation check.
Its explicit-creation mutation must fail when Revise saves a proposal, then pass after restoration.
Keep this bounded browser verification separate from the existing exhaustive refund-safety check.

Inspect representative screenshots and a short pointer/keyboard recording. Keep user-reviewable
media under `.amp/in/artifacts/`, logs and scratch elsewhere. Report missing live evidence honestly.

## Done when

* The opening chat authors both stories without a separate workflow-acceptance phase.
* Expected behaviors appear progressively and can be revised without creating sidebar entries.
* A complete proposal opens the summary popup over the blurred chat. Only Create simulation
  persists the reviewed record and adds its sidebar row.
* Play runs the selected created simulation. Green run checks require completed passing evidence.
* Duplicate rejection needs no contact popup or API and makes no false contact claim.
* Existing safety, persistence, recovery, and run-result guarantees remain intact.
* The live preview, inspected captures, test evidence, and recording guide match this flow.
