## Ethan's agent instructions

These are common instructions for Ethan's agents across all scenarios.

## Sierra demo scope

This repository is the independent `mite404/sierra-demo` teaching demo. Read
`docs/sierra-demo/PLAN.md` before implementation. Its design pillar and scope replace the inherited
YakLabs product journey and the Prototype scope section below for this demo only. The engineering
standards, design language, and component rules still apply.

Use synthetic accounts and payments. Keep the agent helpful while enforcing authorization in the
executor. Existing YakLabs deployments, WorkOS configuration, and credentials are not demo
resources.

## General Guidelines

- Never use the em dash "--". Use plain dash "-" instead.
- Never manually modify changelog.md files or any files that are marked as auto-generated.
- When writing or editing Markdown files, keep every physical line at or under 100 columns, wrapping
  longer lines at word boundaries.
  A pre-commit hook enforces this deterministically (`lefthook.yml` runs `scripts/wrap-md.js`
  on staged markdown), leaving code fences, tables, and headings intact - so this is the rule to
  follow, not one-sentence-per-line.
- When making technical decisions, do not give much weight to development cost.
  Instead prefer quality, simplicity, robustness, scalability, and long-term maintainability.
  "Development cost" here means a human-scale effort estimate.
  Do not let reasoning like "a human would spend two days on this, so patch it" justify a flimsier
  choice, because an agent writes and revises code far faster than that estimate assumes.
  Effort is cheap; correctness and longevity are not.
- When doing bug fixes, always start with reproducing the bug in an E2E setting as closely aligned
  with how the end user uses the product.
  This makes sure you find the real problem so your fix will actually solve it.
- When end-to-end testing a product, be picky about the UI you see and be obsessed with pixel
  perfection.
  If something clearly looks off, even if it is not directly related to what you are doing, try to
  get it fixed.
- Apply the same high standard to engineering excellence: lint, test failures, and test flakiness.
  If you see one, even if it is not caused by what you are working on right now, still get it fixed.
- Always opt for writing files in the same way: imports, variable declarations, prep data to work
  with, helper fns / pure fns, the main orchestration at the bottom.
  Work leafs to root and follow the functional programming principles from Grokking Simplicity:
  data, calculations, actions.
- Public/exported functions and interface members get JSDoc (`/** */`) so editor
  tool tips carry the contract.
  Include `@throws` wherever the function throws, and `@param`/`@returns` only where they say
  something the type does not.
  Do not JSDoc private helpers or pure data-shape types - leave those as `//` comments; restating a
  type in JSDoc just invites drift.
- Annotate Data Flow where appropriate - add a quick comment on each line showing
  what type goes in and what comes out.

```typescript
async () => {
    const raw = await getVoicesFromFirebase();   // → Record<string, unknown>[]
    return raw.map(item => Voice.fromJSON(item)); // → Voice[]
```

---

## Commits

Messages follow [the seven rules](https://cbea.ms/git-commit/), with one deliberate deviation
noted below.

**Scope.** Atomic. Each commit tells one part of the story of building a feature or fixing a bug.
One commit with hundreds or thousands of changed lines is hard for anyone to track. If the subject
line will not fit in 50 characters, that is usually the commit doing two things - split it.

**Subject line**

- Conventional Commits prefix: `feat:` `fix:` `refactor:` `test:` `docs:` `style:` `chore:`.
- Imperative mood. The subject must complete the sentence "If applied, this commit will \_\_\_".
  Write `scope order lookups by customer`, not `scoped`, `scopes`, or `order lookup scoping`.
- 50 characters including the prefix. Never past 72.
- No trailing period.
- Lowercase after the prefix. This is the deviation from rule 3 (capitalize the subject); the
  prefix already marks where the subject starts, and this repo's history is lowercase.

**Body**

- Blank line after the subject, always. Git tooling treats the first line as the subject and
  misbehaves without the separator.
- Wrap at 72 columns. This is not the 100-column markdown rule above: a commit message is not a
  markdown file, and 72 leaves room for the four-space indent `git log` adds.
- One `-` bullet per change. Reach for a prose paragraph only when a decision needs a
  because-clause that no bullet can hold.
- Say what and why. Never how - the diff already shows how.
- Skip the body entirely when the subject fully covers the change.

---

## Prototype scope

- The prototype build is the deployed site, running the production runtime with sign-in:
  `VITE_AUTH=workos` and `VITE_AGENT=gateway` (ADR-154 and ADR-156 in `docs/adr/adr.md`).
  A user signs in through AuthKit and lands on a splash with two projects. Demo plays
  the scripted scenarios on its own clock. Live Playground is a real thread, persisted in the
  worker and answered by the model with tools through the gateway, so they can play with it.
- The sandbox and the levers still run sign-in off, `VITE_AUTH=none` and `VITE_AGENT=lab`,
  the defaults in `apps/web/.env.example`; there the lab stand-in answers the live thread.
- Sign-in is wired as ADR-084, ADR-088 and ADR-154 describe. Do not extend it (a custom auth
  domain, new redirect URIs), and do not build telemetry or the other extras ADR-137 still cuts.
  If one looks needed, ask Ethan.

---

## Design language

- `docs/design-pillars.md` is the brand guide: colour, type, buttons, data visualisation,
  surfaces, inputs and motion. Read the section that applies before choosing a colour, size,
  spacing, corner, duration, easing or animation, and follow its rules.
- Do not invent a value the guide does not cover. Derive it from a token in
  `packages/catalog/src/tokens.css` and say which, or ask Ethan. A new rule goes into the guide
  with its source marked (css, derived, Ethan).
- When the guide and the code disagree, flag the mismatch; do not silently pick one.

---

## UI components

- Do not convert these components to shadcn: App, AwaitingInputCard, CardHeader, CatalogCard,
  ChartGlyph, ChatThreadPanel, ComposeBox, DictationModal, Disclosure, IconButton,
  InteractiveCard, Menu, Modal, Recap, ShareButton, ShareView, Waveform, the icons in `icons.tsx`
  (ChevronIcon, ShareIcon, LinkIcon, ExternalIcon, FilesIcon, ScreenIcon), and the CSS-only
  Button (`.btn`) and TextField (`.field`) primitives.
- Build new components with shadcn.
- Move an existing component to shadcn only when there is a reason to touch it, and screenshot it
  before and after the move.
- The lab today is hand-made primitives (Disclosure, Menu, Modal, CardHeader, IconButton,
  TextField), Recharts and Zod, with no Tailwind and no shadcn. No ADR records a decision to drop
  them. The code drifted there, so do not treat the drift as a choice.
- Kay's tokens stay the source of truth. Tailwind v4 is configured in CSS with custom properties,
  and shadcn themes itself through variables like `--background`, `--foreground`, `--primary`,
  `--border` and `--ring`, so the tokens feed both. Mapped like this, every shadcn component comes
  out in Kay's colours and contrast rules with no per-component restyling:

```css
/* Kay tokens stay the source of truth */
@theme inline {
    --color-paper: var(--paper);
    --color-ink: var(--ink);
    --color-soft-ink: var(--soft-ink);
    --color-moss: var(--moss);
}
:root {
    --background: var(--paper);
    --foreground: var(--ink);
    --muted-foreground: var(--soft-ink);
    --border: var(--hairline);
    --ring: var(--focus);
    --primary: var(--ink); /* green stays for hovers (ADR-058) */
    --radius: 4px; /* the site's button corners */
}
```

- Rename Bonsai's own `--radius` before adding that mapping. It is 14px today and rounds the catalog
  card and the thread panel; shadcn reads `--radius` for its corners, so the mapping above would
  shrink both to 4px.
