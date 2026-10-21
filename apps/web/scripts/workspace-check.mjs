#!/usr/bin/env node
// Measures the done predicate for the projects, sub-threads, shell, carry, collapsible lane,
// sidebar (peek, resize), rail (places, pills, traffic lights) and projects panel work on the
// real app and the real Storybook. Every check runs in its own browser context, so one failure
// never hides another, and a check never sees another's data.
//
//   pnpm dev:web                                        # http://127.0.0.1:5173
//   .agents/skills/verify-storybook-component/scripts/control-storybook.sh launch   # http://127.0.0.1:6106
//   node apps/web/scripts/workspace-check.mjs [--base URL] [--storybook URL] [--only P1,P4] [--out dir]
import { canvasChecks } from "./canvas-checks.mjs";
import { chartResizeChecks } from "./chart-resize-checks.mjs";
import { laneCollapseChecks } from "./lane-collapse-checks.mjs";
import { collect, run } from "./lever.mjs";
import { lightsChecks } from "./lights-checks.mjs";
import { panelChecks } from "./panel-checks.mjs";
import { railChecks } from "./rail-checks.mjs";
import { shellChecks } from "./shell-checks.mjs";
import { sidebarChecks } from "./sidebar-checks.mjs";
import { welcomeChecks } from "./welcome-checks.mjs";
import { welcomeFrameChecks } from "./welcome-frame-checks.mjs";

await run(
  collect(
    canvasChecks,
    shellChecks,
    laneCollapseChecks,
    welcomeChecks,
    welcomeFrameChecks,
    sidebarChecks,
    railChecks,
    lightsChecks,
    panelChecks,
    chartResizeChecks,
  ),
);
