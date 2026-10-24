---
linear: ETH-92
github: 16
filed: 2026-10-24
---
# Restore the existing streaming prose parser

## Status

- **Goal**: Recover normal chat formatting without restoring the removed SQLite runtime.
- **Initial priority**: P1
- **Effort**: Small
- **Risk**: LOW
- **Category**: feature
- **Planned at**: commit `22cb4063c90af36b3d46693d18a81ffe3389a84f`, 2026-10-24

## Why this matters

Human-facing agent building needs readable headings, lists, emphasis, and genuine streaming.
The inherited parser already implements that contract. Rebuilding it would duplicate tested code.

## Current state

- Runtime exposes only NDJSON on remote main. The pure Markdown modules were removed in cleanup.
- Historical revision `248c18f^` contains the parser, inline parser, emitter, and 34 tests.
- Local recovered files are preliminary work, not published changes.

## Approach

Restore the pure modules and their package exports, dependencies, and runnable test command.
Do not restore the SQLite store or the old playground adapter. This independent foundation PR
must pass without migrating consumers; the builder integration ticket will use the exports.

## Scope

- In: `packages/runtime/src/markdown*`, runtime package configuration, and necessary lockfile edits.
- Out: gateway protocols and UI callers, which belong to the builder integration ticket.
- Out: SQLite, authentication, deployment, and new dependency versions.

## Steps

1. Recover the four historical files and inspect their dependencies and exports.
2. Make the parser tests runnable by the existing workspace test workflow.
3. Verify restoration, format, runtime typecheck, and parser behavior before opening this PR.

## Test plan

- Run the restored 34 tests, including partial streamed blocks and inline formatting.
- Run runtime typecheck, workspace format checks, and applicable CI gates.
- Compare restored behavior with the historical source; document any necessary adaptation.

## Done when

* The pure parser and emitter are available through runtime exports with passing tests.
* Existing consumers compile unchanged and no removed runtime subsystem returns.
* One child thread owns one green, reviewed PR for this ticket.

## Notes

No prerequisites. Start concurrently with the scenario workspace ticket.
The user authorized publishing PRs and merging after passing CI. The parent coordinates merges.
Use vanilla Git, poteto-mode, and ponytail full. Keep synthetic data and executor safety unchanged.
