---
name: setup-pstack
description: Configure which models pstack uses per role. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", or changing pstack's model choices.
---

# Setup pstack

Write `~/.agents/pstack-models.md`, an always-applied rule that sets pstack's model per role. The skills read it and fall back to their inline defaults when a line is absent, so this is an override layer, not a requirement.

## Steps

### 1. Detect available models

Read the harness's own subagent-spawning schema; that is the dependable source. In Claude Code the `Agent` tool's `model` enum is the roster (`sonnet | opus | haiku | fable`) and there is **no effort parameter**, while `Workflow`'s `agent()` takes `model` and `effort` (`low|medium|high|xhigh|max`) separately. Record both, because a role written `opus/xhigh` is fully expressible only through `Workflow` and flattens to `model: "opus"` through `Agent`. If the harness exposes a models API or CLI that lists entitled models, prefer it for completeness. If you cannot detect any, ask the user to paste the slugs they have access to. Never write a real slug you have not confirmed is available. The aliases `inherit-parent` and `auto` are always valid even though they are not detected slugs.

### 2. Load current state

The default role-to-model mapping is the rule shape shown in step 5 below. If `~/.agents/pstack-models.md` already exists, read it and treat its values as the current choices. Otherwise start from those defaults.

### 3. Map and confirm

Show every role with its current model, marking any real slug not in the detected set as needing a choice. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model, which is how Auto users stay on Auto) as the options. Prefer AskQuestion over free text. For panel roles (how critics, arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model family differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every real slug written must be in the detected set; `inherit-parent` and `auto` always pass. If a chosen real slug is not available, stop and ask again. A rule pointing at a model the user cannot use breaks every delegation that reads it.

### 5. Write the rule

Write `~/.agents/pstack-models.md`: a notation section, a tier table, and one fenced block of role lines, using the same labels poteto-mode uses. Plain markdown, no `alwaysApply` frontmatter; that key is Cursor rule syntax and means nothing to other harnesses, which read this file because a skill points at it. Overwrite the whole file so re-runs stay idempotent. Keep the existing file's shape:

```
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Task `model`). Alias entries in a panel list still count toward its fan-out.
feature, refactoring: sonnet/high
bug-fix: opus/high
perf-issue: opus/high
hillclimb: opus/high
judgment and prose: opus/xhigh
hardest tasks: opus/xhigh
how explorer: sonnet/high
how explainer: opus/xhigh
how critics: opus/xhigh, opus/high, sonnet/high, opus/medium
why investigators: sonnet/high
why synthesizer: opus/xhigh
reflect tooling: opus/high
reflect judgment, divergent, synthesizer: opus/xhigh
arena runners: opus/xhigh, opus/high, sonnet/high, opus/medium
arena cross-judge pool: opus/xhigh, opus/high, sonnet/high, opus/medium
swarm workers: sonnet/high
architect runners: opus/xhigh, opus/high, sonnet/high, opus/medium
interrogate reviewers: opus/xhigh, opus/high, sonnet/high, opus/medium
```

### 6. Confirm

Tell the user the rule was written and that it applies to new sessions. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill` (resolves wherever pstack is installed — workspace, user, or plugin). On no, move on without pushing.
