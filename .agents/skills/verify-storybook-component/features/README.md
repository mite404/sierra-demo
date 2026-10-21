# Catalog Storybook verification map

This directory is the maintained source for verifying the catalog package's UI components through
Storybook. Read this index, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.agents/skills/verify-storybook-component/scripts/control-storybook.sh launch`.
- `control-storybook.sh doctor` reports `storybook doctor: OK` at `http://127.0.0.1:6106/`.
- Never drive a Storybook this run did not start; a human's instance on 6006 may hold edits
  in progress.

## Driving conventions

- Every story is also reachable standalone at
  `http://127.0.0.1:6106/iframe.html?id=<story-id>&viewMode=story`. Drive that, not the manager
  UI with its sidebar and toolbar.
- Locate elements by ARIA role and accessible name, as written in each feature file. The same
  component renders in several stories and layouts, so CSS classes and positions are not stable.
- Stories are stateless between page loads. Reload the story to reset; nothing persists.
- Render proof: `node .agents/skills/verify-storybook-component/scripts/shoot.mjs <story-id>...`.
- Interaction proof: a `play` function in the story, run by `pnpm test:stories`.

## Proof and skip reporting

- Capture the action and the resulting state: the ARIA tree after the click, not only a picture.
- Screenshot before and after any component change (AGENTS.md), and report each difference.
- Record the story id with every artifact.
- Microphone, screen capture and clipboard permissions are unavailable in headless Chromium.
  Report those paths as verified-unreachable and name the permission; the simulated story does
  not prove the live path.
- A skipped story is never reported as verified through another story.

The feature file defines the coverage set, together with
`affected-stories.mjs`. A change that reaches thirty stories is not proven by one.

Mocks count only at the production boundary this surface already has: `labAgent` stands in for
the model. Stubbing a component, hook, or browser API inside the component under test proves
the stub.

## Feature entry contract

Each feature file starts with an H1 and one paragraph of user-visible behavior, then four H2
sections in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Storybook`,
and `Gotchas`.

## Full sweep

To check everything rather than one change, run `pnpm test:stories` (all 40 stories render,
play, and pass axe), then walk this map top to bottom with `shoot.mjs` for the visual pass. A
sweep reports per feature: verified, verified-unreachable with the blocking permission, or failed
with the observed state. A feature with no line is not covered.

## Features

- [Catalog cards](./catalog-cards.md) covers the approved chart and table cards, their data-table
  toggle, and every fallback and refusal state.
- [Chat thread](./chat-thread.md) covers the thread panel: messages, composing, attaching, the
  recap, awaiting input, interactive cards in context, and the reading tools (search and request
  bookmarks).
- [Dictation](./dictation.md) covers the listening dialog opened from the compose box.
- [Share](./share.md) covers the share menu on a card and the public page a link opens.
- [Foundations](./foundations.md) covers the shared primitives: button, disclosure, icon button,
  menu, modal, and text field.
