# verify-ui-drift

Internal Use Only.

A local review tool for Kay's UI. It captures production components through their existing Storybook
stories, compares screenshots with approved references, and checks CSS tokens, contrast, and
accessibility. It can also capture the SPA shell.

Use it to catch visual drift as humans and agents change the product. Code is the source of truth;
Figma receives token exports. Automated checks find differences. A person decides whether an
intentional visual change should become the new reference.

## Run it

From the repository root, using Node 26 and the repository's pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm --filter verify-ui-drift exec playwright install --with-deps chromium firefox webkit
pnpm verify-ui-drift run
pnpm verify-ui-drift review
```

The default run captures five foundation stories in light and dark themes across Chromium, Firefox,
and WebKit. Add `--app` to include the SPA shell, or use `--stories STORY_ID` to select a component
state. Missing references leave the comparison incomplete, not passing.

Open the address printed by the review command. In an Amp orb, start a supervised service and use
its portal instead:

```sh
amp orb service start verify-ui-drift --command 'pnpm verify-ui-drift review' --portal
```

The review app reads saved evidence. **Reload saved report** reloads the selected run without taking
new screenshots. To capture code changes, rerun the CLI with the same selection. The review server
listens on every interface so orb portals and containers can reach it, with no sign-in: anyone on
your network can read the saved evidence while it runs.

## Reading the result

Every run ends with a verdict, the report's path, and plain lines saying why and what to do next.
Only PASS means everything was compared and found as approved.

| Verdict | Exit | Meaning | Trust it? |
| --- | --- | --- | --- |
| PASS | 0 | Every capture matches its reference, no axe violations | Yes |
| FAIL | 1 | Captures changed or axe found violations; each is listed | Decide each one |
| INCOMPLETE | 2 | Part of the run was not compared: no reference for this machine, an engine that did not run, or a failed comparator proof | No, it is unverified |
| BROKEN | 3 | The run did not finish cleanly; the cause is printed | No, do not use it |

References are per machine, since browsers draw text slightly differently on each OS. The
approved ones come from CI's Debian image, so a run on a Mac is INCOMPLETE and says so before it
captures anything. To see CI's comparison, unzip the PR's `design-verification` artifact into
`.artifacts/verify-ui-drift/` (it holds `runs/`) and open it in the review app. Changes and axe
violations are listed even when a run is INCOMPLETE, so they are never hidden by it.

## From design to drift check

1. Explore in Figma or code. Implement the component with semantic CSS tokens and add or update its
   Storybook stories.
2. Capture the affected stories with the CLI. Include the app shell when checking composition.
3. Select a run in the review app. Use **Pixels** for before/after comparison and pixel inspection,
   **Tokens** for color usage, and **Accessibility** for contrast and axe's automated findings.
   **Comparator proof** checks that the tool detects deliberately introduced mistakes.
4. Fix unintended differences and capture again. If the change is intentional, inspect it before
   approving a replacement reference.
5. Rerun the comparison, then commit the code and approved references together. Future runs compare
   against those references so later drift stays visible.

## What approval means

Approval accepts a screenshot as the baseline for that component state and rendering environment.
Each browser and theme has its own reference. A matching capture needs no new approval; a changed
capture needs review. Approval does not fix code or certify accessibility.
Keyboard and screen-reader checks still need human review.

After inspecting a capture, copy its command from **Review and approve this capture**:

```sh
pnpm verify-ui-drift approve --run RUN_ID --keys foundations-button--default.chromium.light --expect 1
pnpm verify-ui-drift run
```

Approval writes a PNG and `approved.json` under `tools/verify-ui-drift/baselines/`.
Commit these with the code.
Reports and comparison images live in `.artifacts/verify-ui-drift/runs/`, which Git ignores.

The CLI rejects stale or incomplete evidence, failed comparator checks, altered images, and selected
captures with axe violations. CI cannot approve references. Never approve an unexplained difference
just to make a check pass.

## Check the tool itself

After a default capture run, check the tool with:

```sh
pnpm --filter verify-ui-drift test
pnpm --filter verify-ui-drift typecheck
pnpm --filter verify-ui-drift test:review
```

For capture options and exit codes, run `pnpm verify-ui-drift --help`.
