# Phase 1b - Ethan's take and the side-by-side

## Ethan's principles

1. **Nothing moves under your eyes.** The compose box must not shift or resize while you type or dictate; you are proofreading as you go. Zed does this right: streaming output never pushes your input down.
2. **Show the whole thing; the diff is a lens.** Amp shows only a diff when you click a file, and you must right-click "open raw file" to see it. That friction does not help.
3. **Recognition over recall.** Typing `/` should list your skills. Learning that a skill loaded only after pressing enter ("loading skill") is an anti-pattern.
4. **Fun is the onboarding.** Subtle animation (Amp's hold-to-confirm progress fill, animated patches of color) turns "have to" into "get to".
5. **Success metric: users create their own workflows and skills.** The goal is creative thinking.
6. **Legibility.** Long agent streams get condensed to a 2-4 sentence summary; steps become bullets; tool calls (terminal commands) render as artifacts in the thread.
7. **A reactive notebook**, in the spirit of marimo.

Chosen problem: **making agent work legible**, seen as a design pillar that also differentiates the product.

## Observed in Ethan's Zed recording

- Row actions (archive) and section actions (`...`, `+`, filter, add project) appear only on hover.
- Agent activity collapses to one muted line ("Ran 2 commands, thought ...") between prose blocks.

## Agreement

- Collapsed by default, detail on demand.
- Agent actions are objects, not paragraphs.
- Layout stability is a prerequisite for trust.

## Disagreement (Claude's pushback)

- **Post-hoc summaries**: a second model narrating the first is lossy and can hallucinate. Summaries should be a view over structured events, with each line linking to its evidence.
- **Process versus outcome**: "Ran 2 commands" means nothing to a non-technical user. Lead with what changed in the world; steps sit one layer down.
- **Hold-to-confirm with meaning**: hold duration scales with irreversibility, so the delightful interaction also teaches consequence.

## Gaps

- Ethan's examples are all single-thread and watched live. Missing: parallel work that happened while away, and the "about to do" (plans and pending approvals).
- Claude's framing over-indexed on trust and risk. Missing: delight as the on-ramp, and the notebook idea.

## Synthesis

**Legible work becomes remixable work.**
A finished run renders as a reactive recipe (marimo, or a node graph in Nuke/Fusion): edit an upstream step and downstream steps re-run.
"Save as skill" becomes the last step of understanding a run, which connects legibility directly to Ethan's success metric.

Proposed demo arc: Return, Inspect, Approve, Remix.
