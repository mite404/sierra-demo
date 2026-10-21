import { brief } from "../demo/scenarios/brief";
import { interrupted } from "../demo/scenarios/interrupted";
import { returned } from "../demo/scenarios/returned";
import { ids } from "./ids";
import { show, worldOf, type WorldSpec } from "./spec";

/**
 * The Demo the page plays over the device's own threads: one project of three scripted shows,
 * in sidebar order, the first of them its entry. A fourth show is one scenario file and one
 * `show(...)` here.
 */
export const DEMO_WORLD: WorldSpec = worldOf({
  projects: [
    {
      id: ids.project,
      name: "Demo",
      threads: [show(brief), show(interrupted), show(returned)],
    },
  ],
});
