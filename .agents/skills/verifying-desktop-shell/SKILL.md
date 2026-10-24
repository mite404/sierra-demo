---
name: verifying-desktop-shell
description: >-
  Checks Sierra's rendered window geometry and lesson continuity after shell or layout changes.
---

# Verify the desktop shell

Check that the lesson fits the available window height while its navigation preserves the session.
A viewport-height inner screen clips controls once desktop insets and title-bar height are added.

## Run

From the repository root, build the web app and start its deterministic acceptance server. Stop an
existing `shell-qa` service before rebuilding, and reuse the service if the build is already
current.

```sh
pnpm --filter web build
amp orb service start shell-qa --port 8790 --command 'node apps/web/scripts/simulation-ui-server.mjs'
curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:8790/__qa
PLAYWRIGHT_CHROMIUM="$(ls -d "$HOME"/.agent-browser/browsers/chrome-*/chrome | sort -V | tail -1)" \
  node apps/web/scripts/simulation-runs-check.mjs \
  --out /tmp/desktop-shell-captures --logs /tmp/desktop-shell-logs
```

Require exit status zero and the journey's `PASS` output. Inspect the viewport screenshots for
setup, question, saved simulation, completed results, frozen conversation, dark/narrow layout,
and recovery. A full-page screenshot does not establish that the composer is reachable inside
the frame.

## Coverage and limits

- `apps/web/src/components/simulation-lab.tsx`, `SimulationLab`, owns the stable frame around all
  screen branches. Old manual-customer navigation must recover the accepted employee without
  replaying requests. The manual screen and selector are retired. Existing journey assertions
  retain single-workflow and sidebar-only scenario/run controls.
- `apps/web/src/components/simulation.css` owns frame geometry and available-height layout.
  `apps/web/scripts/simulation-shell-check.mjs` checks actual browser rectangles, not a CSS model.
- `verifyShellSizes` generates every combination of widths 390, 767, 768, 769, 799, 800, 801, 1024,
  1280, and 1440px; heights 720 and 900px; and light/dark media. Each of five stable lesson states
  receives all 40 combinations. Streaming is checked by the existing journey at its default size.
- Results open only after execution stops. The journey checks 2px transcript-only blur, inert
  obscured chat, dismiss/reopen, Escape and focus return, read-only completed conversation,
  selected goal counts, and incomplete/not-exercised outcomes. Popup bounds are checked at 390,
  800, 801, 1024 and 1280px widths; narrow light/dark captures accompany desktop results.
- Assertions cover 16px desktop insets from 768px, full-bleed narrow layout, 44px nonshrinking
  chrome,
  one visible main, frame-height content, decorative desktop-only lights, document scroll bounds,
  and desktop conversation/summary bounds. The journey also exercises keyboard and internal
  scrolling.
- This is bounded generated-input verification in Chromium, not an unbounded formal proof. No CSS
  verifier is configured. The real HTTP routes, executor, and disposable D1 run with controlled
  external model transport. Live model output, Safari, touch, all possible content, and arbitrary
  viewport sizes are outside this check.
- Verified with Node 26.12.1, pnpm 10.33.0, locked Playwright 1.63.0, and Chromium 156.0.8078.47.

## Prove a regression is caught

Temporarily change only `.simulation-lab`'s `height: 100%` to `height: 100dvh` in the real CSS
source.
Rebuild, restart the acceptance server, and rerun the command. Require failure at
`The lesson uses frame height, not viewport height`. Restore that one line, rebuild, and require
the complete journey to pass again. Keep unrelated working changes intact.

This mutation establishes sensitivity of the inner-height property. Other assertions are exercised
by the matrix but are not separately mutation-proven. A failing browser rectangle is a product
counterexample unless the sourced shell contract intentionally changed. Update the expectation only
after checking the design guide and actual rendered result.

## Keep in sync

The shell baseline is `b0c964315ac2f4b1f045d73622caa604d54e2ff0`. This record also covers the
follow-up removing the manual screen and adding post-run results. Review the covered source and
journey diff together before rerunning. Re-run the real-source mutation when changing the height
contract. Use `/maintain-formal-verification-skill` if the implementation changed without updating
this coverage record.
