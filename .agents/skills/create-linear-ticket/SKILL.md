---
name: create-linear-ticket
description: File one piece of work as a repo ticket .md, a Linear issue, and a mirrored GitHub issue in one command, with an auditable why/approach trail and cross-linked IDs. Use this whenever the user wants to create a Linear ticket, file an issue, turn a plan or bug into a ticket, mirror a Linear issue to GitHub, or asks to "file this" / "make a ticket for this" — and also when they finish a plan or bugfix document and it should be tracked. Handles project matching from the repo directory name, label and effort mapping, per-artifact idempotency, and an append-only resolution note at close.
---

# Create Linear Ticket

Files one piece of work in three places at once — a ticket `.md` in the repo, a
Linear issue, and a mirrored GitHub issue — without the three copies drifting.

The rule that makes this safe: **each fact has exactly one owner.** The `.md`
owns the plan, Linear owns status and cycle time, GitHub owns discussion. The
skill creates; it never syncs. Anything learned later is *appended* as a
comment, never written over a description.

The body format is in [EXAMPLE-BODY.md](EXAMPLE-BODY.md); read it before
rendering anything.

## Requirements

- `python3` (stdlib only) and the `gh` CLI, authenticated.
- A **Linear MCP server** exposing `list_projects`, `list_teams`,
  `list_issue_labels`, `save_issue`, `get_issue`, `save_comment`.
  (The GitHub link chip is `save_issue`'s `links` field. Not `create_attachment`
  — despite the name, that tool uploads file bytes and takes no URL. Nothing in
  this skill ever uploads a file.)

If the Linear tools aren't available in this harness, stop and say so. Don't
improvise a substitute transport — filing half a ticket is worse than filing
none, and a silent fallback is how duplicate records get created.

## Modes

| Invocation | Does |
| --- | --- |
| `<path.md>` or a description | Files it: Linear → front-matter → GitHub → link chip → README |
| `--dry-run <path.md>` | Renders the body, lists intended calls, creates nothing |
| `--resolve <path.md>` | Appends "How this was addressed" to both. Requires front-matter. |

Default to `--dry-run` the first time a repo is used, so the user sees the
format before anything durable exists.

### Description input: write the concise ticket `.md` first

Invoked with a description instead of a path: first write a concise ticket
`.md` — the only file this path writes — then file it exactly like the path
mode below. When invoked with a path directly, or on the handoff from
`create-tutorial`, skip this; the `.md` already exists.

Write it wherever the project keeps this kind of doc (`plans/` if that
convention exists; otherwise ask). Use the same `## Status` block as
create-tutorial's TICKET-TEMPLATE, so both paths parse identically, and no
front-matter yet — "Mode: file it" step 1 adds `linear:` the moment Linear
returns it, step 2 adds `github:`/`filed:`. An unfiled
ticket carries no front-matter at all; that absence is itself the
filed/unfiled signal.

```markdown
# <title>

## Status
- **Goal**: …
- **Initial priority**: P0
- **Effort**: Small
- **Risk**: LOW
- **Category**: bug
- **Planned at**: commit `<sha>`, <date>

## Why this matters
## Current state
## Approach
## Scope
## Steps
## Test plan
## Done when
## Notes
```

## Preflight

Run all of these before anything else and report failures together, not one at
a time — a user who has to fix three things wants to know that up front.

1. **In a git repo?** `git rev-parse --show-toplevel`. If not, stop.
2. **Has a GitHub remote?** `gh repo view --json nameWithOwner -q .nameWithOwner`.
   If this fails, stop — a mirror needs a target.
3. **`gh` authenticated?** covered by (2) failing.
4. **Linear project exists?** See Resolution below.
5. **Effort label group present?** `list_issue_labels` for the team; confirm
   children named `Small`/`Medium`/`Large` whose **`parent` is `Effort:` — with
   the trailing colon**. A bare `Effort` is a reserved group name in Linear, so
   the group could not be created without the colon. Matching on `Effort`
   returns a false miss and leads you to create a duplicate colon-less group —
   the exact label drift this skill exists to prevent. If the children are
   genuinely absent, stop and print the exact `create_issue_label` calls needed.
   Do not create them — labels are team-wide and that is not a change a ticket
   command should make silently.

## Resolution

Every lookup is exact. On a miss, stop and ask. Never guess — a wrong guess
files a durable record under the wrong project, and it surfaces months later as
meaningless cycle-time data.

| Need | How |
| --- | --- |
| Linear project | `basename $(git rev-parse --show-toplevel)`, matched exactly against `list_projects` names. On miss: list them, ask, offer to create. |
| Linear team | `list_teams`. One team → use it. More than one → ask. |
| GitHub repo | `gh repo view --json nameWithOwner -q .nameWithOwner` |
| Already filed? | `python3 scripts/ticket_state.py read <path.md>` — `{}` means unfiled |
| Labels | `list_issue_labels` at run time. Resolve effort by `(parent, name)` → **ID**, never by bare name: another group could add its own `Small` child and silently steal the match. |

**Never construct a Linear URL or identifier.** `save_issue` returns both; use
them verbatim. The workspace slug has already changed once, which killed every
URL built by concatenation.

**Front-matter stores the identifier, never the URL.** `linear: ETH-47` is 14
columns; `linear_url: https://linear.app/…` is past 100, and a markdown
line-wrapping pre-commit hook will fold it onto a second line. That fold breaks
the flat `key: value` shape `ticket_state.py` requires, and a broken block used
to read as `{}` — unfiled — so the next run filed a **duplicate Linear issue**,
the one failure the state file exists to prevent. The script now refuses that
read instead (see Failure handling), but the durable fix is the short value.
Print the URL, don't persist it: `save_issue` returned it, and it is re-derivable
from `ETH-NN`. Tickets filed before this still parse — `linear_url` is read, just
never written. If a stored `linear_url` 404s, re-derive it from the identifier;
that is not a reason to re-file.

## Field mapping

| `.md` | Linear | GitHub |
| --- | --- | --- |
| H1, minus a leading `Plan NNN: ` | title | `<ETH-NN> <title>` |
| `Initial priority: P0/P1/P2/P3` (`Priority:` also read) | `priority` 1/2/3/4 — seeded once, never read back | — |
| `Category: bug / feature / refactor \| infra` | label `Bug` / `Feature` / `Improvement` | same name |
| `Effort: Small/Medium/Large` (`S`/`M`/`L` also read) | label `Effort:` › `Small` **and** `estimate` 1/3/5 | label `Effort: Small` |
| `Risk:` | — no field — goes in Notes | — |
| — | `project` = repo directory name | — |
| — | state not set; Linear applies the team default | open |

Missing fields degrade quietly. No priority → Linear `0` (None). No category or
effort → that label is simply not applied. Never invent a value to fill a slot:
an unlabelled issue is honest, a guessed label is not.

## Rendering the body

Read [EXAMPLE-BODY.md](EXAMPLE-BODY.md) first. Produce these eight sections, in
this order, following the plan file's own reading order — problem, evidence,
chosen approach, boundary, edits, proof, gates, caveats:

```
Execute `<plan path>`.

## Why this matters
## Current state
## Approach
## Scope
## Steps
## Test plan
## Done when
## Notes
```

Rules:

- **Bullets, not code blocks.** A fenced snippet appears only when the code *is*
  the reproduction. Never to show a fix. This applies to the eight body
  sections; the GitHub trailer below is a separate, unfenced case.
- **`## Approach` is mandatory and is the point.** In a plan file the rationale
  lives in prose wrapped around the code; strip the code and it has no home
  unless this section gives it one. State the chosen approach, why it won, and
  what was considered and rejected. A ticket without this can't be audited.
- **`## Done when` uses `*`, never `- [ ]`.** GitHub renders task-list syntax as
  interactive checkboxes — a second place to track completion. Linear owns status.
- **Drop** the plan's Commands, Concepts, Git workflow, STOP conditions, and
  Status block. They're executor scaffolding; the `.md` has them.
- **Merge** Files You'll Touch into Scope. Keep out-of-scope entries verbatim —
  each names a rejected alternative and its reason.
- **State scope divergence.** If the ticket is deliberately wider or narrower
  than the plan file, say so and why.

The Linear description and the GitHub body are identical. GitHub additionally
gets a trailer:

```
@ETH-15

---
Linear: <url from save_issue, verbatim>
```

The fence above is display packaging for this document, not part of the
output. Append this trailer to the GitHub body as literal, **unfenced**
markdown — GitHub does not link an `@mention` inside fenced text, so fencing
the trailer would stop Linear's GitHub app from ever firing and the two issues
would never connect. The blank line between `@ETH-15` and `---` is required:
without it, CommonMark reads `@ETH-15` as a setext H2 heading underlined by
the rule, and GitHub renders `<h2>@ETH-15</h2>` instead of the mention plus a
horizontal rule.

The `@ETH-NN` tag goes in the **body**, not the title. Body tagging is confirmed
to trigger Linear's GitHub app; title detection is unverified, so nothing depends
on it.

## Mode: `--dry-run`

Creates nothing. Print, in order:

1. The resolved values: project, team, repo, filed-state.
2. The full rendered body, exactly as it would be sent.
3. Every call that would run, with its arguments.

End with: `Nothing was created. Re-run without --dry-run to file.`

## Mode: file it

Order is forced — the GitHub title and body both embed the Linear ID, so Linear
must exist first.

**Each step checks its own "already done?".** Not one check for the whole run.
A run that dies after step 1 leaves `linear:` in front-matter with no `github:`;
the next run must file only the GitHub side and continue. This per-artifact
resume is the difference between re-running cleanly and repairing state by hand.

### 1. Linear issue

Skip if front-matter already has `linear:`.

`save_issue(team, project, title, description, priority, labels, estimate)`

- `description` = the rendered body **without** the GitHub trailer.
- `labels` = category label ID + effort child label ID (resolved by
  `(parent, name)`).
- `estimate` = 1 / 3 / 5 for Small / Medium / Large.
- Do not set `state`.

Capture the returned `identifier` and `url` verbatim. Immediately write them:

```bash
python3 scripts/ticket_state.py write <path.md> --linear ETH-NN
```

The URL is deliberately not written — see Resolution above. Report it to the
user in the run summary instead.

Write before attempting GitHub. If GitHub fails, the ID must already be on disk
or the next run files a duplicate Linear issue.

### 2. GitHub issue

Skip if front-matter already has `github:`.

```bash
gh issue create --repo <owner/repo> \
  --title "ETH-NN <title>" \
  --body-file <tmpfile> \
  --label "Bug" --label "Effort: Small"
```

Use `--body-file`, not `--body` — the body contains backticks and newlines that
shell quoting mangles. Write it to the scratchpad first.

List the repo's labels first — `gh label list --json name -q '.[].name'` — and
match **case-insensitively**. GitHub treats label names as case-insensitive for
uniqueness, so a repo carrying `bug` already owns the name: `gh label create
"Bug"` fails with "already exists", and there is no second label to create. When
a case-variant of the label you want is already there, apply it verbatim as the
repo spells it. That is one vocabulary wearing different capitalisation, not a
fallback — and an unlabelled issue is worse than a correctly-labelled one whose
case doesn't match Linear's.

Only when no variant exists at all, ask, and create it **only if the user
agrees**:

```bash
gh label create "Effort: Small" --color 4cb782 --description "Small Effort"
```

Mirror Linear's exact name, color, and description. What's ruled out is
*substituting a different concept* — reaching for GitHub's auto-created
`enhancement` because Linear says `Improvement`, or dropping the `Effort: `
prefix. Same word, different case, is not a substitution.

Capture the issue number and write it:

```bash
python3 scripts/ticket_state.py write <path.md> --github NN --filed YYYY-MM-DD
```

### 3. Linear link chip — conditional

**No file is uploaded here.** Linear calls a `{url, title}` record an
"attachment", but it is just a link rendered as a chip near the issue title —
in this case the Linear issue pointing back at the GitHub issue. Zero bytes
transferred. The confusing part is that Linear *also* has a tool named
`create_attachment` that genuinely uploads files; it is not what this is.

Re-read the issue with `get_issue(id)` and inspect `attachments`. If Linear's
GitHub app is installed and firing, a `GitHub: <repo>#NN` chip is already there.
Do not assume it is: on observed runs the app has stayed silent, which is why
this step reads the issue rather than trusting the integration. Give it a few
seconds first — the app is asynchronous, and checking instantly reads a miss
that would have been a hit.

**Match on the GitHub issue number parsed out of each attachment URL, not on
string equality.** The app may store a URL that differs cosmetically from the
one `gh issue create` returned — trailing slash, `www.`, `http` vs `https` —
and a naive equality check would call that a miss and add a duplicate chip,
which is the one thing this conditional exists to prevent.

Only if no existing attachment points at that issue number:

```
save_issue(id=<ETH-NN>, links=[{url: <gh url>, title: "GitHub: <repo>#NN"}])
```

**Never add `labels` to this call.** `save_issue`'s `labels` field replaces
the issue's entire label set, not merges into it — this call is safe only
because it omits the field entirely. Passing the labels back here to be
"thorough" would silently wipe any label added after step 1.

**Use `save_issue`'s `links` field. Do NOT use `create_attachment`** — despite
the name, that tool uploads file bytes and requires `base64Content`, `filename`,
`contentType`, and `sha256`. It has no `url` parameter, so calling it here fails
schema validation. `links` is append-only: existing links are never removed, so
this can only ever add.

### 4. Verify the bot comment — do not post one

Linear's GitHub app posts an `ETH-NN` comment when the magic word appears in the
body. The rendered body carries `@ETH-NN`, so it should fire on its own. Check
`gh issue view NN --comments`. If it fired, post nothing.

If it did not, **still post nothing** — step 3 has already added the link chip,
so the two issues are connected, and a hand-written comment would only be a
second, unmaintained copy of that link. Say so plainly in the run summary
instead: the integration is not firing, and that is a fact about the workspace
the user needs, not a gap for the skill to paper over.

### 5. `plans/README.md`

Only if the file exists and contains a plan-index table — a table listing
plans by number. If there is no such table, skip this step entirely — do not
invent one or guess which table is the index.

**Ensure a `Ticket` column exists, then fill in only the row you just
filed.** If the table already has a `Ticket` column — a partial migration
already happened — don't add a second one; just fill that row's cell. If it
doesn't have one yet, add it as the last column. Leave every other row's
`Ticket` cell empty:

```markdown
| Plan | Title | Priority | Effort | Depends on | Status | Ticket |
|------|-------|----------|--------|------------|--------|--------|
| 001  | Bind dev servers to loopback | P0 | Small | — | TODO |  |
| 002  | Fix PostToolUse-all hook dead health check | P0 | Small | — | TODO | [ETH-15](https://…) |
```

**If the table still has a `Status` column, leave it in place** — this step
never touches it. Drop `Status` only once every row has a ticket link, as a
separate, later edit: removing it earlier would erase the status of plans
that aren't filed yet, and the skill would be destroying the only record
those rows have in the name of tidiness. Once `Status` is gone, this step
keeps working exactly the same way, off the `Ticket` column alone — the gate
above is "does a plan-index table exist," not "does it have a `Status`
column," so dropping `Status` never stops future filings from being recorded.

The end state is the point: a hand-maintained mirror of Linear state is
guaranteed to go stale — that column already read `TODO` for plan 002 while
ETH-15 was In Progress. A link never does. But get there one row at a time.

### Re-run on a filed ticket

Print and change nothing. Front-matter's `github` key holds only the issue
number, not its URL — get the GitHub URL with
`gh issue view <NN> --json url -q .url` before printing this:

```
Already filed:
  Linear  ETH-15  <url>
  GitHub  #57     <url>

Nothing changed. Status lives in Linear; the plan lives in the .md.
```

### Failure handling

| Failure | Do |
| --- | --- |
| No git remote | Stop before creating anything |
| Project not found | List projects, ask, offer to create. Never guess. |
| Effort label missing | Stop; print the `create_issue_label` call |
| Two labels share a child name | Resolve by `(parent, name)` → ID |
| `gh` not authenticated | Stop after Linear; front-matter has `linear:` only; re-run completes |
| Linear API error | Nothing written — Linear is step 1, so there's no partial state |
| Front-matter present but issue deleted | Report the dead ID; ask before re-filing |
| Stored `linear_url` 404s | Re-derive from the identifier. Not a re-file. |
| `ticket_state.py read` exits 1, "damaged front matter" | A filed ticket whose block got line-wrapped. **Never treat as unfiled.** Rejoin the folded line by hand, drop `linear_url` so it can't recur, re-read, continue. |

## Mode: `--resolve`

`## Why this matters` and `## Approach` are knowable at filing. **How the fix
was actually addressed is only knowable at close**, so it cannot live in the
description without a later overwrite — the exact clobber this design rules out.

It is therefore an **appended comment**, posted to both places. Appending can
never collide with a concurrent edit, which is why this doesn't reopen the
conflict-detection problem the design avoids.

Read the IDs back from front-matter: `linear:` gives the Linear identifier and
`github:` gives the GitHub issue number. Both are required.

**Refuse in two cases**, and say which:

- `ticket_state.py read` returns `{}` — unfiled. Tell the user to file it first.
- `linear:` is present but `github:` is absent — a filing run that died partway.
  There is no GitHub issue to comment on, so refuse and tell them to re-run the
  filing mode first; it will complete only the GitHub side. Commenting on Linear
  alone would leave a resolution note whose mirror never existed.

Post identical text to both:

```markdown
## How this was addressed

<What actually changed, in prose. Where it differed from `## Approach`, say so
and why — a plan that survived contact unchanged and a plan that got revised
are different pieces of evidence, and only the comparison shows which happened.>

<Anything discovered along the way the next reader needs: a second bug found, an
assumption that turned out wrong, a test that couldn't be written.>
```

Linear: `save_comment(issueId, body)`
GitHub: `gh issue comment <NN> --repo <owner/repo> --body-file <tmpfile>`

Do **not** set Linear state. Closing is the user's call — `--resolve` records
what happened, it doesn't decide the work is done.

## Checklist — filing

Run this after `file it`, not after `--dry-run` or `--resolve` (which has its
own, below). Before reporting success:

- [ ] Nothing was guessed — every name came from an exact match or a user answer
- [ ] No Linear URL or identifier was built by string concatenation
- [ ] Body has all eight sections and `## Approach` is substantive
- [ ] No fenced code block except a genuine reproduction
- [ ] `## Done when` uses `*`, not `- [ ]`
- [ ] Effort label resolved by `(parent, name)` → ID
- [ ] Front-matter written before the next artifact was attempted, holding
      `linear: ETH-NN` — no URL, nothing a wrap hook could fold
- [ ] Exactly one GitHub attachment chip on the Linear issue
- [ ] The skill posted no comment, and the run summary says whether the bot's
      comment fired
- [ ] Re-read the `.md` after any commit hook ran, and `ticket_state.py read`
      still returns the IDs
- [ ] `plans/README.md`: if a `Status` column exists it's untouched, and only
      the row just filed had its `Ticket` cell touched (added if missing,
      filled if present)
- [ ] No description was overwritten

## Checklist — `--resolve`

Nine of the filing items above describe artifacts `--resolve` never touches, so
it gets its own short list:

- [ ] Refused correctly if the `.md` was unfiled, or filed to Linear only
- [ ] Exactly one new comment on the Linear issue, and one on the GitHub issue
- [ ] Both descriptions are byte-identical to before — this mode only appends
- [ ] Linear state was not changed
