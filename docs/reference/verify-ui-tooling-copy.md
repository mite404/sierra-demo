# The design tooling page's first copy

The words the landing page at `/verify-ui-tooling` carried before Ethan's copy replaced them
(ADR-160, amended), kept here to cross-check against. The first part is what left the page.
The second part is what stayed: the tool's own words and numbers, which are evidence rather
than copy.

## Removed from the page

### Hero

- Kicker: Design engineering / tooling
- Headline: UI drift is the default. Evidence is the fix.
- Lede: People and agents edit Kay's interface in the same afternoon. verify-ui-drift captures
  every visual change, compares it with an approved reference, checks tokens and contrast, and
  keeps the evidence. A new baseline needs a person. Nothing passes by looking fine.
- Buttons: See the pixels · Why it exists

### The claim (01 / The problem)

- Headline: Two kinds of editors, one surface.
- Body: A person nudges a corner radius. An agent restyles a button while fixing something else.
  Both diffs read fine in review. Drift is not a bug anyone wrote. It is the sum of small
  decisions nobody compared.
- Note: **Looks fine is not a test.** A reviewer's eye compares a screenshot with a memory of
  last week's build. Memory is the weakest reference in the building.
- Note: **Agents move faster than review.** An agent revises UI in minutes. The check has to run
  at that speed, and be the same check every time, on every engine and theme.
- Note: **Consistency at scale is a records problem.** Every approved look has to be findable,
  dated and tied to its commit. Otherwise the standard is whoever was in the room.

### The bento

- Pixels cell, title: Locate, then judge
- Pixels cell, body: The list says which capture changed and by how much. The wipe shows before
  and after on one coordinate plane. The inspector enlarges the same corner of both at 4x, no
  smoothing. The corner went from 4px to 12px, and the difference view says where.
- Zero cell, title: references CI can approve
- Zero cell, body: A capture with no approved reference for this machine is listed as missing,
  never as passing. A person decides, and names the count expected.
- Proof cell, title: The tool tests its own camera
- Proof cell, body: An untouched Button recaptured must give zero changed pixels. A wrong colour
  and a wrong padding must both differ, in every engine, or nothing can be approved on the run.
- Approve cell, title: Approval is a command, not a click
- Approve cell, body: The CLI rejects stale or incomplete evidence, a failed camera proof, an
  altered image and any selected capture with an axe violation.
- Contrast cell, title: Contrast is measured
- Contrast cell, body: The rule marks each pair's minimum. The focus ring clears its 3:1 by a
  hundredth.
- Steps cell, title: One command, five beats
- Steps cell, body: A verdict with its reasons, a report and the comparison images are saved for
  the run. Only a person can approve a new reference.

### The five beats, as described

- Capture: The CLI builds the current Storybook and photographs the production components
  through their own stories, in three engines and both themes.
- Prove the camera: Before any comparison counts, the tool recaptures an untouched Button, then a
  wrong colour and a wrong padding. The control must match. Both mistakes must differ.
- Compare: Each capture meets its approved reference for that engine, theme and machine. A
  missing reference is reported as missing, never as a pass.
- Check: Tokens are read off the rendered CSS, every declared colour pair is measured for
  contrast in both themes, and axe runs on every story.
- Decide and keep: A verdict with its reasons, a report and the comparison images are saved for
  the run. Only a person can approve a new reference.

### What approval means (the lines not shown on the page)

- A person names the captures to approve and how many to expect. The command fails if the count
  is off.
- Approval writes the PNG and an approved.json beside the code. They are committed together, so
  the reference carries the commit that chose it.
- CI cannot approve. It can only compare, and attach its evidence to the pull request for a
  person to open.

### The band (02 / Accessibility)

- Headline: Measured, never judged by eye.
- Body: Kay's theme is two inks and two lines. Every declared pair is measured in both themes
  against Kay's minimums: 4.5:1 for text, 3:1 for essential marks. The other lenses read the
  same table against a platform's recommendation. They are review lenses, not a new palette.

### The roles (03 / One tool, four roles)

- Design engineering: The components are production code and Storybook is their contract.
  Corners, tokens and contrast are checked in the rendered CSS, against Kay's own minimums.
- Design engineering infrastructure: Four verdicts, four exit codes, references kept per
  machine, a CI artifact a reviewer opens locally, and a camera that proves itself before a
  comparison counts.
- Frontend engineering: A React review app over Playwright captures in Chromium, Firefox and
  WebKit, with a before/after wipe on one coordinate plane and a pixel inspector that never
  smooths.
- Forward deployed engineering: Every run leaves evidence a non-engineer can read: a verdict,
  the reason, and what to do next.

### The closing

- Quote: I built it before anyone asked.
- Body: Drift starts the first week people and agents share a codebase. The rules this tool
  keeps are the ones a team needs settled once: a missing reference is not a pass, CI cannot
  approve, and evidence outlives the run.
- Buttons: Back to Kay · See the pixels again

## Still on the page: the tool's own words and numbers

- The bar: Yaklabs / Verify · Back to Bonsai
- The run's numbers: 3 rendering engines · 2 themes · 85 stories in the inventory · 0
  references CI can approve
- The terminal: the run `pnpm verify-ui-drift run` as the CLI printed it, with its notice: "No
  approved references exist for this machine (darwin-arm64), so captures are recorded but not
  compared. References exist for: linux-x64-debian-12."
- The ticker, from the tool's README: PASS · exit 0 · Every capture matches its reference and
  axe found nothing. FAIL · exit 1 · Captures changed or axe found violations. Each one is
  listed. INCOMPLETE · exit 2 · Part of the run was not compared: no reference for this machine,
  an engine that did not run, or a failed camera proof. BROKEN · exit 3 · The run did not finish
  cleanly. The cause is printed.
- The bento's cell names, from the review app's tabs and the CLI's commands: Pixels · Approve ·
  Comparator proof · Accessibility · Run
- The Pixels chip: 3,776 changed pixels · 0.154%
- The missing rows: Button / Default, Text Field / On Paper, Disclosure / Open · firefox · dark ·
  missing baseline
- The proof table: engine, control, colour, geometry, with the counts for chromium, firefox and
  webkit
- The approve command: `pnpm verify-ui-drift approve --run RUN_ID --keys
  foundations-button--default.chromium.light --expect 1`
- The contrast pairs: --ink on --paper 13.33:1 · --soft-ink on --paper 6.42:1 · --rule on
  --paper 5.68:1 · --focus on --paper 3.01:1
- The five beats' names: Capture · Prove the camera · Compare · Check · Decide and keep
- The lenses: Kay · Apple · Microsoft · Material
- The footer: Internal use only · tools/verify-ui-drift · the README has the commands and the
  operating limits.

## Ethan's copy, as it changed

- Hero headline, first: A design system agents can build with
- Hero headline, now: Design tooling that allows humans to verify at scale
- Back to Kay, in the bar and at the close: now Back to Bonsai
- Switch appearance, in the bar: gone; the page is light only
