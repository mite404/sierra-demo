---
linear: ETH-96
github: 23
filed: 2026-10-24
---
# Reuse the YakLabs desktop app shell

## Status

- **Goal**: Frame Sierra's existing lesson as a floating desktop window using YakLabs source.
- **Initial priority**: P2
- **Effort**: Small
- **Risk**: MEDIUM
- **Category**: feature
- **Planned at**: origin/main `59b99bd0d1c58bc86492698e9ad5701579c9528f`, 2026-10-24

## Why this matters

- Give the independent Sierra teaching demo the established YakLabs desktop-window presentation
  without replacing its agent setup, simulation authoring, or execution experience.

## Current state

- Sierra's `apps/web/src/components/simulation-lab.tsx` renders the library and lesson screens.
  `.simulation-lab` in `simulation.css` fills `100dvh`; it has no inset desktop window frame.
- Actual YakLabs main was inspected at `104a052309402b25b64c64b8114b69f5e4276523`, not a
  deployment. Its [Window source][window] draws a separate `--desk` background and a fixed frame.
- At desktop widths, the frame has 16px insets on all sides, 12px outer corners, a 1px
  `--hairline` border, `--paper` fill, and `0 8px 32px var(--shadow)` shadow. There is no fixed
  pixel height or maximum width. The outer height is the viewport height minus 32px.
- At 1280 by 720, YakLabs' outer frame is 1248 by 688. At 1440 by 900, it is 1408 by 868.
  These are dimensions derived from source, not claimed browser measurements.
- The [title bar][titlebar] is 44px high (`h-11`, non-shrinking), with decorative traffic lights
  and `.chrome-surface` token remapping. Its navigation controls depend on YakLabs runtime state.
- The [empty canvas style][empty] separately uses `0 1px 2px var(--shadow)` plus
  `0 12px 40px var(--shadow-strong)`. That shadow is a permitted visual reference, not a request
  for its dots, art, empty state, panel, or drag behavior.
- Sierra already retains the catalog tokens and shadcn mapping. Its inherited `index.css`
  contains the empty-canvas shadow rule, but that does not mount or require a canvas.
- [PR 22][builder] is merged into current origin/main at
  `59b99bd0d1c58bc86492698e9ad5701579c9528f`. Preserve its builder adapters, bounded dock scrolling,
  and saved-row spacing. These changes are the baseline, not an outstanding dependency.
- Existing ETH-93 / GitHub #17 owns the merged scenario layout. ETH-94 / #18 owns PR 22's builder
  integration. ETH-95 / #19 owns the complete journey rehearsal. None requests this outer frame.

## Approach

- This is only a visual wrapper around the current app, as confirmed by Ethan. Keep the current
  app composition, navigation, actions, and state ownership unchanged inside the frame.
- Reuse the actual YakLabs frame markup and styling around Sierra's existing content. Adapt its
  title-bar presentation to Sierra's real title and existing actions without importing YakLabs'
  runtime-dependent Window or TitleBar wholesale. Keep existing main landmarks and providers.
- Preserve YakLabs' vertical geometry, including the 16px top/bottom margins and 44px chrome.
  Narrowing the window is allowed, but must not shorten its outer height. Default to the source
  width; if narrowing improves composition, center it with token-derived desktop side margins.
- Use a small downward shell shadow. Start with the existing window shadow; use the empty-canvas
  shadow treatment only if needed after desktop inspection. Apply it directly to the frame,
  independent of content state. Do not add a fake empty canvas to obtain its shadow.
- Reuse `--desk`, `--paper`, `--hairline`, `--shadow`, `--shadow-strong`, `.chrome-surface`,
  and the existing fonts. The 16px inset derives from two-thirds of `--space` (24px); 12px corners
  from half of `--space`; 44px chrome from two `--space` units minus `--btn-radius` (4px).
- Preserve Sierra's controls and behavior. Reject a generic shell framework, new dependencies,
  a second theme, and copying the full YakLabs app merely to recover its frame.

## Scope

- In: desktop framing for Sierra's setup, customer-test, and simulation-library screens;
  `simulation-lab.tsx`, `simulation.css`, and existing browser layout checks as needed.
- In: minimal source reuse with retained notices, and a sourced design-pillars entry for the
  demo-specific frame or shadow if the existing guide does not cover the final treatment.
- Out: mobile redesign or porting YakLabs' mobile drawer behavior. Preserve existing narrow UI.
- Out: the canvas panel, deck, lanes, drag/drop, browser pane, tab lifecycle, projects rail,
  onboarding, account menu, and nonfunctional YakLabs controls. They do not serve this lesson.
- Out: canvas art, dots, splash content, or canvas state selectors. Only its shadow may be reused.
- Out: executor, model, persistence, authorization, or builder protocol changes.
- Out: YakLabs deployments, credentials, WorkOS configuration, login, real accounts/payments,
  and deployment. Use only this independent demo and synthetic fixtures.

## Steps

- Recheck current origin/main before editing. Do not use the parent's preliminary local main as
  the baseline. Preserve PR 22's merged builder scrolling and saved-row changes.
- Reuse the source frame and chrome presentation in the existing Sierra layout owner. Ensure all
  screen branches receive the same frame without remounting conversations or duplicating headers.
- Replace the inner viewport-height assumption with available-frame sizing. Keep `min-height: 0`
  and internal scroll regions so composers, pinned summaries, and actions remain reachable.
- Apply the token-based desk, border, corners, and small downward shadow. Keep the outer shadow
  outside content clipping. Do not add window dragging, resizing, or decorative working buttons.
- Verify the desktop geometry and existing flows through the current browser checks.

## Test plan

- At 1280 by 720 and 1440 by 900, measure the outer frame. Its top/bottom insets must be 16px
  and heights 688px/868px respectively, even if width is narrower than YakLabs. Chrome is 44px.
- Inspect desktop screenshots in light and dark for setup, pending questions, accepted workflow
  with scenario modal, saved scenario, and a long completed conversation. The desk and small
  downward shadow remain visible without a canvas, clipped controls, or double borders.
- Exercise keyboard focus, modal open/close, streaming, scenario selection, save, run, cancel,
  reset, reload recovery, and long-message scrolling. Keep the scenario summary pinned and the
  composer reachable. Record and inspect a short pointer/keyboard interaction clip.
- Run the existing `simulation-runs-check.mjs` workflow and applicable web unit tests, typecheck,
  lint, format check, and build. Run catalog Storybook verification only if catalog files change.
- Smoke-check the existing narrow layout for regressions without expanding this ticket to mobile.

## Done when

* Every Sierra lesson screen uses source-derived desktop window framing on the token-based desk.
* Width may shrink, but source shell height and title-bar height remain unchanged per viewport.
* A small shadow makes the shell float without introducing any canvas panel or canvas lifecycle.
* Sierra's existing functionality, design tokens, accessibility, and synthetic-data boundaries hold.
* Desktop measurements, inspected captures, interaction evidence, and applicable checks are
  recorded.

## Notes

- Risk is MEDIUM because nested `100dvh` and scrolling can hide the composer inside an inset frame.
- No hard dependency. PR 22 is already merged; preserve its behavior in the shared CSS.
  ETH-95 is related verification, not a blocker.
- History confirms intent. [The shell polish commit][polish] establishes the 16px desk inset.
  [The raised-canvas commit][raised] adds the optional shadow and removes the obsolete olive trim.
  Do not restore the trim. ADR-094, ADR-111, and ADR-136 document these choices.
- Source dimensions and history were inspected during filing. No UI implementation or runtime
  verification is claimed. The repo Markdown owns the plan, Linear owns status, GitHub discussion.

[window]: https://github.com/mite404/yaklabs/blob/104a052/apps/web/src/shell/window.tsx#L59-L85
[titlebar]: https://github.com/mite404/yaklabs/blob/104a052/apps/web/src/shell/title-bar.tsx#L85
[empty]: https://github.com/mite404/yaklabs/blob/104a052/apps/web/src/index.css#L486-L502
[builder]: https://github.com/mite404/sierra-demo/pull/22
[polish]: https://github.com/mite404/yaklabs/commit/1461578a683bfef48e6d7707122235f015bd28c0
[raised]: https://github.com/mite404/yaklabs/commit/d31eb746e10c4c8888b05f30205ada3630d1b86f
