---
linear: ETH-93
github: 17
filed: 2026-10-24
---
# Present simulations as friendly scenario threads

## Status

- **Goal**: Make agent setup and simulation inspection understandable to non-technical users.
- **Initial priority**: P1
- **Effort**: Medium
- **Risk**: MEDIUM
- **Category**: feature
- **Planned at**: commit `22cb4063c90af36b3d46693d18a81ffe3389a84f`, 2026-10-24

## Why this matters

The demo must show one agent-building iteration, test-scenario creation, and a real simulation
within five minutes. Raw technical panels distract from that lesson.

## Current state

- Setup, authoring, and results have dense inspector panels and redundant controls.
- Existing APIs already support accepted workflows, saved definitions, and real run evidence.
- Preliminary local UI edits move the library left but have not received browser verification.

## Approach

Use the existing component library and tokens with the confirmed Version A interaction model.
Place a scenario-thread inspector on the left and search, settings, rerun, and play at its top.
Keep the selected scenario's situation and expected behavior visible above its conversation.
Put JSON and provider details behind technical disclosure without hiding honest outcome states.
Use existing endpoints and adapters so this PR remains independent of the parser restoration.

## Scope

- In: simulation UI components and CSS, plus existing browser checks for the changed interactions.
- In: first-use gating, an acceptance-triggered first-test-scenario modal, readable run results,
  truthful scenario statuses, keyboard behavior, and responsive layout.
- Out: builder protocol changes and prose parsing, owned by the integration ticket.
- Out: copying Sierra aesthetics or introducing a new component framework.
- Out: executor policy changes, new auth, real payment data, and deployment.

## Steps

1. Use compact whole-row scenario buttons on the left with actual result statuses.
2. Keep simulation controls and scenario rows visibly disabled until the current agent has enough
   context and is explicitly accepted. Explain what unlocks them; do not rely on grey color alone.
3. On successful first agent acceptance, open an accessible modal inviting the first test scenario.
   Explain that scenarios test edge cases. Dismissal must not lose the agent or block later
   creation.
4. Make the primary run a readable customer/support conversation. Keep its situation and expected
   behavior visible. Put technical evidence and previous-run comparisons in secondary disclosures.
5. Wire toolbar actions to real search, settings, and explicit selected-scenario runs. Disable
   unsafe actions during running, loading, missing-selection, or unaccepted-agent states.
6. Preserve accepted-agent recovery on reload and reset the gating correctly for a new agent.
7. In a successfully saved scenario, render the text under User instructions in JetBrains Mono.
   Reserve monospace for that instruction text. Keep headings, descriptions, expectations, chat,
   labels, and controls in the normal UI typeface. Follow the supplied reference's hierarchy.
8. In the scenario modal, scope Device type to Desktop web only. Do not offer unsupported device
   choices. Show a computer icon when viewing the saved scenario, following the reference cue.
9. Pin the full scenario summary and its separator above the scrolling conversation. User
   instructions, device type, and expected agent behavior stay visible while messages scroll or
   stream. Chat bubbles must not cover or push away this summary. Follow the latest screenshot.

## Test plan

- Exercise first visit, clarification still pending, proposal not accepted, accepted, modal open,
  modal dismissed, scenario saved, running, completed, cancelled, and failed states in the browser.
- Verify disabled controls cannot run through mouse, keyboard, or form submission.
- Check search, selection, rerun, play, technical disclosure, narrow width, and light/dark styling.
- Verify the saved instruction text uses JetBrains Mono and no other default UI text is monospace.
- Scroll a long simulated conversation and observe streamed messages while the full summary and
  separator stay in place and all messages remain reachable.
- Inspect screenshots and a pointer/keyboard interaction recording. Run web tests and typecheck.

## Done when

* First-time users see a calm locked simulation area and know how to unlock it.
* Acceptance invites the first test scenario without prematurely running or saving anything.
* Scenarios read like named threads, not JSON fixtures, and selected expectations stay visible.
* Checks represent actual results; incomplete, not-exercised, and human-review states stay distinct.
* One child thread owns one independently green, reviewed PR with inspected visual evidence.

## Notes

No prerequisites. Start concurrently with parser restoration. Use the unchanged main adapter.
Latest user requirements supersede older default-visible-JSON and right-inspector plan language.
Both toolbar run buttons may start a fresh explicit run; neither may silently resume or refresh.
The parent coordinates merging after CI. Use vanilla Git, poteto-mode, and ponytail full.
