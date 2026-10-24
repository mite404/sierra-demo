# Record the five-minute agent-to-simulation journey

## Prepare the real-provider rehearsal

1. Follow [README.md](../../README.md#run-the-lesson), including the demo-only provider secret.
2. Open the returned Amp portal in a fresh browser session at about 1440 × 1000.
3. Confirm `/api/health` reports `liveConfigured: true`. Never show credentials on screen.
4. Start an uncut recording and a wall clock before the first employee message.

Keep the server running throughout the take. Do not rebuild its assets during recording.
All accounts and payments are synthetic. The provider calls and executor results are real.
This independent educational sample is not Sierra's SDK, builder, or private implementation.

## 0:00-1:20 · Describe, choose, and iterate on the agent

Say: "The agent helps the customer. The executor enforces permission. First I configure how our
support team handles refunds. These grey simulation controls stay locked until I accept an agent."

Type: "Help our support team handle subscription refunds."

Wait for the actual preference card above the composer. Select the warm-replies, confirm-first
choice, then click **Submit**. Labels are model-generated and may vary. Ordinary prose asking a
question does not prove this interaction. The submitted choice must resume the builder.

Read the streamed proposal. Type: "Revise to brief replies. Keep owner confirmation and all
safeguards." Wait for the revised proposal.

Say: "That is one iteration. I changed reply style, not ownership or payment safeguards. The agent
cannot accept its own proposal."

## 1:20-2:30 · Accept, describe, review, and save a scenario

Click **Accept workflow** to open **Create your first test scenario**.
Show the computer icon and **Desktop web**, the only device. Click **Describe a test scenario**.

Type the following request in the separate authoring chat:

> Create an owner test named Morgan confirms once. Morgan knows morgan@example.com and asks for her
> latest refund. When asked to confirm, reply exactly "Yes, refund it." After success ask for the
> same refund again, then stop. Expect a full $42 refund exactly once, confirmation before mutation,
> and duplicate rejection. Human review checks truthful helpful wording without an invented receipt.
> Propose the complete test now.

Read the complete proposal before clicking **Save simulation**. If the model asks a clarification,
answer it. Do not imply that an incomplete proposal is ready or automatically saved.

Say: "This chat authors a customer scenario. It does not issue a refund. Save approves the reviewed
instructions and freezes the accepted agent settings for this test."

Show the saved instructions, device, and expected behavior above the separator. Only saved
instructions use JetBrains Mono. Scenario authoring and automated customer dialogue are separate.

## 2:30-4:20 · Run and inspect the actual result

Click the sidebar play control, **Run selected simulation**. The customer and support agent now
converse automatically. Do not type the customer turns yourself or substitute a tool probe.

Say: "Each run starts with fresh synthetic payments and a trusted fixture identity. The model does
not choose who owns the account. The full scenario stays pinned while the conversation streams."

Scroll the conversation without moving the instructions, device, expected behavior, or separator.
Show that editing, navigation, and another run are locked while execution is active.

After completion, open **Business checks and execution JSON**. Inspect actual evidence, not the
agent's success claim. For this owner test, check all of the following:

- Confirmation is required before any refund.
- Morgan receives exactly 4,200 cents once, to the original payment method.
- A later customer request produces `already_refunded`, with the refund count still one.
- Casey's unrelated $17 payment remains untouched.

Show **Business checks passed · human review pending** only if that is the actual result.
Review the wording independently with **Human wording review**. Never equate payment assertions
with helpfulness or claim that a human review happened when it is still pending.

## 4:20-5:00 · Explain the limits

Say: "The evaluator checks actual tool events and payment state. A spouse conversation that never
calls a tool does not prove the authorization boundary. The separate labeled tool probe and
regression checks cover that boundary. A refusal alone is not a green authorization result."

Errors, cancellation, time limits, and unexercised checks remain visibly distinct from a pass.
If the live provider fails or the take exceeds five minutes, retain that result and report it.
Do not shorten pauses, fake live output, or relabel deterministic transport as a live provider.

Stop the timer only after inspecting the actual result. Record wall-clock elapsed time, provider
identity, completed run ID, selected checks, payment mutations, and human-review status separately
from the video duration. Editing or narration added afterward does not change that elapsed time.
Ethan records the final personal narration; label any synthetic rehearsal voice as synthetic.

## Run deterministic browser regressions separately

Build once, then start the disposable acceptance server in a separate terminal or supervised orb
service. It replaces only the external model transport and clearly labels itself as not live K3.

```sh
VITE_AUTH=none pnpm --filter web build
node apps/web/scripts/simulation-ui-server.mjs
```

In another terminal, run the existing journey harness:

```sh
node apps/web/scripts/simulation-runs-check.mjs
pnpm --filter gateway exec vitest run src/simulation.test.ts src/simulationWorker.test.ts
```

Set `PLAYWRIGHT_CHROMIUM` to an installed Chrome executable if the pinned browser is unavailable.
The browser check uses real HTTP, the executor, and disposable D1 storage. It covers locked first
use, choice-card answer/resume, one revision, explicit acceptance, modal dismissal, reload,
review/save/run, active-run locks, pinned content during streaming, owner and spouse results,
failure states, save-only retry, and single-workflow navigation. It does not measure provider latency.

Reload restores existing state without resubmission or an automatic run. Dismissing the invitation
does not revoke acceptance; **Create simulation** reopens it. The demo keeps one accepted workflow.
Saved definitions and completed runs persist locally in D1. Builder sessions expire after 24 hours
and do not survive a Worker restart. Missing sessions show recovery rather than invented history.

## Observed rehearsal on 2026-10-24

The [ETH-95 verification thread](https://ampcode.com/threads/T-01a16beb-ea2f-7678-b825-b638716575cc)
retains screenshots, provider events, immutable results, gate logs, and the rehearsal recording.
Both takes used real `moonshotai/kimi-k3` customer and support calls, synthetic identities, one
builder revision, explicit acceptance, scenario authoring, explicit save, and an automated run.

| Take | Fresh visit through result inspection | Result | Capture limitation |
| --- | --- | --- | --- |
| 1 | 124.250 seconds | Business checks passed; human review pending | Video encoder failed; screenshots and events retained |
| 2 | 103.294 seconds | Business checks passed; human review pending | Uncut 5 fps video; synthetic narration added afterward |

Take 2 ran from 07:33:01.781 to 07:34:45.075 UTC. Its run ID is
`a4e32e4d-9671-4095-830e-53d635cad9db`. The provider initially narrated a proposal without calling
the proposal tool. Save correctly stayed disabled. A follow-up requested the actual proposal;
the same take then reviewed, saved, and ran it. That delay remains in the video and elapsed time.

Both runs recorded `confirmation_required`, `refunded`, then `already_refunded`. Morgan received
4,200 cents once to the original payment method; Casey remained at zero refunded. These owner runs
do not independently prove spouse authorization. The deterministic browser regression and executor
tests cover unauthorized access, incomplete results, and boundary controls separately.

The narrated review copy preserves the complete 103.8-second capture and holds its actual final
frame for ten extra seconds. The added voice is synthetic rehearsal narration, not a recording of
Ethan speaking live. This demonstrates available time, not a guarantee about future provider latency
or a completed personal application video.
