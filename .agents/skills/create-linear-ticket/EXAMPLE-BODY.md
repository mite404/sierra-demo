# Example rendered body — ETH-15

This is the exact body the skill produces from
`plans/002-fix-posttool-all-health-check.md`. It goes into the Linear
description and the GitHub issue body verbatim, except that GitHub also gets
the trailer at the bottom.

Match the section set and the compression level. The source plan is ~200 lines
with code blocks; this is ~45 lines with none.

---

Execute `plans/002-fix-posttool-all-health-check.md`.

## Why this matters

The PostToolUse-all hook health-checks `${API_BASE}/api/tasks`, a route the
server doesn't register — Hono registers `/tasks`; `/api` exists only in Vite's
dev proxy, which hooks never go through. The check always fails, the hook exits
0, and the whole ingestion path is silently dead. Nothing errors.

## Current state

* `scripts/post-tool-all.ts:28` — health check hits `/api/tasks`, always 404s.
* `scripts/session-event.ts:45` — the same check done correctly, as `/tasks`.
* `scripts/post-tool-all.ts:96` — reads `existing.events` and calls `.map`; the
  API returns no `events` field, so this throws the moment the hook runs at all.

## Approach

Fix the caller, not the contract. Adding `/api/tasks` to Hono would make the
dev-proxy facade real and permanently double the route table to accommodate one
typo. Removing the health check entirely was also rejected — it would error on
every tool use during non-dashboard sessions, training you to ignore the log.
The `events` guard rides along because fixing the URL *turns on* code that has
never executed; shipping the fix without it just moves the failure.

## Scope

* In: `scripts/post-tool-all.ts`
* Out: `src/server.ts` — the missing `events` JOIN is separately tracked; this
  makes the hook survive the absent field, it does not add the JOIN.
* Out: `vite.config.ts` — the `/api` proxy is correct for the browser.

## Steps

* Change the health-check URL from `/api/tasks` to `/tasks`.
* Default the `events` array so `.map` can't throw on the missing field.

## Test plan

* Start the server, pipe a minimal payload into the hook, confirm exit 0.
* Confirm a new `[post-all]` line appears in `logs/hooks.log` — before this fix
  there would be none at all. That line's existence is the proof.

## Done when

* Triggering a PostToolUse event writes a row the dashboard displays.
* The hook fails loudly if the server is genuinely unreachable, not exit 0.

## Notes

Risk: LOW. Land before the `JSON.parse` guard ticket — both edit
`post-tool-all.ts` and 003 applies cleanly on top of this, not the reverse.

---

## GitHub-only trailer

Appended to the GitHub body only. Not present in Linear.

**The fence below is this document's packaging.** Append the trailer inside
it to the GitHub body as literal, *unfenced* markdown. Wrapping it in a code
block would stop GitHub linking the `@ETH-15` mention, so Linear's app would
never fire and the two issues would never connect.

```markdown
@ETH-15

---
Linear: <the url save_issue returned, verbatim>
```

The blank line between `@ETH-15` and `---` is required: without it,
CommonMark reads `@ETH-15` as a setext H2 heading underlined by the rule, and
GitHub renders `<h2>@ETH-15</h2>` instead of the mention plus a horizontal
rule.

## What to notice

- **`## Approach` is where the code snippets went.** In the plan file the
  rationale is prose wrapped *around* code. Strip the code and that reasoning
  has no home unless this section gives it one. It is the difference between a
  ticket that can be audited a year later and one that can't.
- **Out-of-scope entries carry reasons**, not just paths. Each one names a
  rejected alternative and why it lost, which is half the audit trail.
- **No code blocks in the eight body sections.** A fenced snippet appears only
  when the code *is* the reproduction — a broken URL, a failing assertion —
  never to show a fix. (The fence under "GitHub-only trailer" below is display
  packaging for this document, not part of the output — see the note there.)
- **`## Done when` uses `*`, never `- [ ]`.** GitHub renders task-list syntax as
  interactive checkboxes, creating a second place to track completion. Linear
  owns status.
- **Risk lives in Notes.** Neither system has a field for it.
- **No Status block.** Initial priority is a Linear field, Category and Effort
  are labels. Mutable facts stay out of body prose.
