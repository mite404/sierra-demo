---
name: control-ui
description: Build or adapt a local browser/CDP harness to drive and inspect a web, IDE, or Electron UI. Use for local UI verification, screenshots, accessibility snapshots, perf profiles, visual diffs, or reproducing UI bugs.
---

# Control UI

Use local browser automation to verify UI behavior with evidence. First reuse the repo's own Playwright, browser, or Electron harness if it exists; otherwise assemble a temporary local harness around the app's dev server or Chromium debug port.

## What It Is Used For

- Reproducing UI bugs that depend on real browser focus, keyboard input, scrolling, resizing, or rendering.
- Verifying visual or accessibility changes with screenshots and snapshots.
- Checking local web, IDE, or Electron behavior before shipping.
- Capturing console logs, network logs, CPU profiles, traces, or heap snapshots.
- Creating before/after evidence for `verify-this`.

## Pick a flow before connecting

Decide which instance you are driving, and refuse to guess. Most repos have exactly one dev instance on one well-known port, and driving it is fine. The trap is the second instance: a git worktree, a second checkout, a colleague's session on a shared box.

```bash
test -f .git && echo worktree   # .git is a file pointing at the parent; a directory means main checkout
```

- **Main checkout:** the dev build owns the conventional port and the shared user-data-dir. Drive it directly.
- **Worktree or second checkout:** derive a port and an isolated user-data-dir from the worktree path, and pass them explicitly on every command, so you neither fight the user's main session nor pollute its auth and feature-flag overrides.

**From an isolated context, a connect or launch with no explicit target is an error, not a default.** Falling back to the conventional port is the failure mode this rule exists to prevent: it silently attaches to the user's real session, and the run's writes land in their profile. Make the harness say which instance it chose in its output, so a proof records the instance it was captured from.

## Doctor before driving

Ship one read-only command that answers "is this instance worth driving?" and run it first whenever anything looks off. It reports, without changing state:

- which context it is running in (main checkout or which worktree)
- which process owns the debug port, and whether this run started it
- whether the build is fresh relative to the source, and whether any watcher is alive
- whether the app-specific extensions, plugins, or workers the test needs are actually compiled and loaded

A failing doctor is a stop, not a warning to drive through. Most "the click did nothing" investigations are a stale build or the wrong instance, and both are visible here in one call before any driving begins.

## Setup Pattern

1. Start the app locally using the repo's documented dev command.
2. Discover existing local harnesses: Playwright tests, Cypress specs, Storybook, browser scripts, Electron launch scripts, or snapshot tools.
3. For a web app, connect to the local URL with the existing browser tooling.
4. For Electron/Chromium, enable a remote debugging port when supported.
5. Select the correct page by stable app markers, not by tab order alone.
6. Prefer accessibility roles, labels, and stable `data-*` selectors over coordinates.

## Generic Web Harness

Use the repo's installed browser tooling when possible. If the repo already has Playwright, a minimal one-off probe looks like:

```javascript
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:<port>");
await page.getByRole("button", { name: /submit/i }).click();
await page.screenshot({ path: "/tmp/ui-harness-after.png", fullPage: true });
await browser.close();
```

Do not add Playwright as a project dependency just for this probe unless the user asks. Prefer existing dev dependencies or external browser tools already available in the environment.

## Generic CDP Harness

For Electron or a Chromium app launched with `--remote-debugging-port=<port>`, connect over CDP:

```javascript
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:<debug-port>");
const pages = browser.contexts().flatMap((context) => context.pages());
let page;
for (const candidate of pages) {
  if (await candidate.locator("<app-root-selector>").count()) {
    page = candidate;
    break;
  }
}

if (!page) {
  console.log(await Promise.all(pages.map(async (p) => ({
    title: await p.title(),
    url: p.url(),
  }))));
  throw new Error("No matching app page found");
}

await page.screenshot({ path: "/tmp/ui-harness-cdp.png", fullPage: true });
await browser.close();
```

Replace `<app-root-selector>` with a stable marker from the current repo, such as a root app node, landmark, or product-specific `data-*` attribute.

## Interaction Loop

1. Capture a page snapshot or screenshot before acting.
2. Choose a target from the latest page structure.
3. Perform exactly one structural action: click, type, keypress, drag, scroll, navigate, or resize.
4. Capture a fresh snapshot/screenshot.
5. Verify the expected state change.
6. Save artifacts for before/after comparisons when the user asked for proof.

## Driving Conventions

- **Selector order:** ARIA role and accessible name first, then stable `data-*` attributes the app owns (`data-component`, `data-action-id`, `data-*-status`). Class selectors are a fallback. Use a `data-testid` only where the feature map already names it, since a testid nobody documented is a testid someone will rename.
- **Prefer the registered keyboard shortcut over a coordinate click** where the app has one. It exercises the power-user path, and the command id it fires is documentation pointing straight at the handler. Fall back to clicking when another surface legitimately holds the chord, such as an editor claiming Find/Replace.
- **Read with `eval`, never invoke with it.** Evaluating JS to inspect DOM state, attributes, or the clipboard is fine. Calling the app's own command service to make something happen is not: it skips the user path, so whatever it proves is not what a user gets. If the command service is not reachable from `window` anyway, take that as the design telling you the same thing.
- **Async is non-deterministic, so poll an observable end state,** not a fixed sleep: a status label, a button becoming enabled, a `data-*` status attribute settling. A generic "wait for settle" helper covers short render transitions only. It does not wait for a request, a stream, or a tool call to finish, and treating it as if it does is how a proof captures a half-finished screen.
- **Keep developer overlays off** (FPS meters, lag radars, debug panels, RPC tracers), and leave feature-flag overrides you did not set alone. Both change what you are measuring, and the second changes it for the user's next session too.
- **Flip gated paths through the app's own flag mechanism.** Most gates update live; reload when the gated code runs at mount.
- **Watch the console during any flow whose expected result includes "no errors."** An assertion that a screen looks right is not an assertion that it rendered cleanly.
- **Mark as manual what the harness genuinely cannot drive:** real OS file drops, drags from outside the app, native context menus, links that open the system browser, and third-party auth dialogs. Say so in the proof, name what blocks it, and cover the closest real path that remains. A synthetic reproduction that bypasses the user path is not a substitute, and reporting it as one is worse than reporting the skip.

## CDP Capabilities

Use raw CDP only when higher-level browser APIs are insufficient:

- Performance: CPU profiles, traces, paint flashing, FPS meter, layout shift inspection.
- Memory: heap snapshots and forced GC for leak investigations.
- Network: request blocking, throttling, cache disablement, request/response logs.
- Rendering: viewport changes, color scheme emulation, reduced motion, accessibility checks.
- Debugging: console streaming, exception capture, DOM snapshots.

## Page Selection

When multiple app windows/tabs share a debug port:

- Prefer a positive marker for the surface under test, such as an app root selector.
- Use a negative marker to avoid the wrong surface when necessary.
- If no page matches, list available page titles and URLs instead of guessing.

## Guardrails

- Do not rely on stale element references after navigation or structural changes.
- Avoid coordinate clicks unless a fresh screenshot was captured immediately before the click.
- Keep test data local and disposable.
- Do not store screenshots or heap snapshots from privacy-sensitive workspaces unless the user explicitly agrees.
- Do not hard-code selectors, ports, or script paths from another repository. Discover the current repo's local app markers.
- Clean up dev servers, debug sessions, and temp profiles when done.
