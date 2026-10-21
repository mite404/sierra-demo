---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Multiple LLM reviewers challenge changes from independent angles."
disable-model-invocation: true
---

# Interrogate

Spawn one reviewer per configured model to adversarially review code changes. Each model gets the same prompt and rubric. The adversarial signal comes from model diversity, not assigned personas. Models differ in blind spots, priors, and reasoning patterns. Agreement across models is high-confidence signal; lone-model findings are worth reading but lower confidence.

The deliverable is a synthesized verdict. Do NOT auto-apply changes.

## Step 1, Determine Scope

Identify what to review from context:

- If the user points at specific files or a diff, use that
- If on a feature branch, run `git diff main...HEAD` (or the appropriate base branch) for the full changeset
- If the user's message references recent work, gather the relevant files

Package the diff (or file contents) plus any surrounding context files the reviewers need to understand the code.

## Step 2, State the Intent

Before spawning reviewers, state the intent explicitly. What is this code trying to accomplish? Derive this from:

- The user's message
- Commit messages
- PR description if one exists
- The code itself

Write one clear paragraph. Reviewers challenge whether the work achieves the intent well, not whether the intent itself is correct. If you're unsure about the intent, ask the user before proceeding.

## Step 3, Spawn Reviewers

**The external seat requires an explicit ask.** `/poteto-mode` routes here on its own for "contested design before shipping" (`poteto-mode/SKILL.md`), and that auto-route must stay Claude-only: OpenRouter is metered prepaid credit, and a panel that buys a seat on every contested design is a charge on ordinary work. Spend it only when the user invoked `/interrogate` directly, or asked in words for a second opinion, an outside model, or Kimi. On the auto-route, run the Claude panel and say in the report that no external reviewer was bought.

When the ask is explicit, spend one seat on a different vendor. Every Task reviewer here is the same family, so four of them agree far more than four vendors did, and an adversarial panel that agrees is worth little. Run the `external reviewer` line from `~/.agents/pstack-models.md` through `~/.agents/skills/interrogate/scripts/external-review` in parallel with the Task fan-out:

Quote the cost, then ask, then spend. Never spend first.

```bash
# 1. price it (no tokens bought; prints prompt size, cost, and remaining credit)
printf '%s' "$REVIEW_PROMPT" | ~/.agents/skills/interrogate/scripts/external-review --estimate -m moonshotai/kimi-k2.7-code

# 2. on approval only
printf '%s' "$REVIEW_PROMPT" | ~/.agents/skills/interrogate/scripts/external-review -m moonshotai/kimi-k2.7-code
```

Put the estimate's own numbers in the question, using `AskUserQuestion` (call `ToolSearch` with `select:AskUserQuestion` first if its schema is not loaded). Ask it as a cost approval: name the model, the estimated cost, and the remaining credit when `--estimate` reported one. Offer approve, decline and stay Claude-only, and switch to a cheaper model when the seat is `kimi-k3`. A declined seat is not a failure: run the Claude panel and record in the report that no external reviewer was bought.

Ask once per interrogation, not once per reviewer. One seat is bought, so one question is asked.

Pick the model by what is under review, per the Kimi table in `~/.agents/pstack-models.md`: `kimi-k2.7-code` for a diff (code-tuned and cheaper than k2.6, so it is the floor for code, not an escalation from it), `kimi-k2.6` for prose, and `kimi-k3` only when the Claude side of this panel ran at `opus/xhigh` and is about to be trusted without contradiction, or when the diff will not fit in 262k. It is a shell call, not a Task spawn, so it does not count against the Task batch. Treat its reply as one reviewer's findings, verified the same way as the others; a different family is a different set of blind spots, not a more trustworthy one. If no key is set the command says so and exits 1: report the panel as Claude-only rather than silently running one seat short. The key comes from `POTETO_OPENROUTER_KEY`, falling back to `OPENROUTER_API_KEY`; `--estimate` names which one it used, so quote that in the approval question when the fallback is in play.

Launch all reviewers in a single message using the Task tool. Use the `interrogate reviewers` list from `~/.agents/pstack-models.md` when present, one reviewer per entry, extending or shrinking the Reviewer A/B/C/D labels below to the configured entry count; otherwise use the table defaults.

| Subagent | Default model |
|----------|---------------|
| Reviewer A | `opus/xhigh` |
| Reviewer B | `opus/high` |
| Reviewer C | `sonnet/high` |
| Reviewer D | `opus/medium` |

For each reviewer:
- `subagent_type`: `generalPurpose`
- `model`: the configured `interrogate reviewers` entry, or the table default with no configured line
- `readonly`: `true`

If a model slug is rejected as unresolvable when you try to spawn the subagent, check the valid slugs in the Task tool's error message, pick the closest equivalent (prefer the highest-reasoning tier of the same family), spawn with the valid slug, and open a separate PR to update the configured value or default table. Do not block the review on the slug issue. If the configured value is `inherit-parent` or `auto`, omit `model` instead; never treat those aliases as broken slugs or enter this fallback for them.

Read `references/reviewer-prompt.md` and fill in the template with:
1. The stated intent
2. The diff or file contents
3. The review rubric from `references/rubric.md`
4. The code-quality lens from `references/code-quality-review.md`

The same filled template goes to all reviewers, so every model applies the code-quality lens.

Each reviewer produces structured findings as described in the prompt template.

## Step 4, Synthesize

As results come back, build a unified picture:

1. **Parse all findings** from the reviewers
2. **Identify consensus**. Findings raised by 2+ models independently are highest signal.
3. **Identify lone-model findings**. Still worth reading, but weight accordingly.
4. **Deduplicate**. Different models may describe the same issue differently. Merge these and note which models raised it.
5. **Note disagreements**. If one model flags something and another explicitly says the opposite, that's useful context for the verdict.

## Step 5, Lead Judgment

You are the lead reviewer, a pragmatic senior engineer, not a neutral aggregator.

Read `references/lead-judgment.md` for the full framework. Reviewers only see a slice of the codebase. You have the full context (the goal, the constraints, the timeline, which tradeoffs were already considered). Use that context aggressively.

Categorize every finding using these buckets:

- **Act on**. Real issues affecting correctness, security, or maintainability given the actual goals. These would block a real PR.
- **Consider**. Legitimate points, but you're not sure they outweigh the cost of addressing them right now. Worth the user's attention.
- **Noted**. Technically valid but not actionable. Context-dependent, premature optimization, or low-impact given the current stage.
- **Dismissed**. Wrong, nitpicky, or missing context. Brief explanation why.

For each finding, include:
- Which model(s) raised it
- The category (act on / consider / noted / dismissed)
- A one-line rationale for the categorization

## Output Format

Present the verdict in this structure:

### Intent
> [The stated intent paragraph from Step 2]

### Reviewers
- Reviewer [label]: [model name], [N findings] (one bullet per reviewer)

### Act On
[Findings that should be addressed. For each: description, which models raised it, why it matters.]

### Consider
[Findings worth thinking about. For each: description, which models raised it, tradeoff involved.]

### Noted
[Valid but low-priority. Brief list.]

### Dismissed
[Rejected findings with brief rationale. This shows the user what was filtered out and why, so they can override your judgment if they disagree.]

### Agreement Map
[Where did models agree, where did they diverge, and what does the pattern of agreement/disagreement tell us?]
