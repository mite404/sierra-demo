import assert from "node:assert/strict";
import path from "node:path";
import type { Browser } from "playwright";
import { PNG } from "pngjs";
import { openApp } from "./app-capture.ts";
import { screenshot } from "./capture.ts";
import { comparePng } from "./pixels.ts";
import { ROOT, serveBuild } from "./workspace.ts";

/** Proves app-shell recaptures are stable and see a real title-bar geometry change.
 * @throws If the production shell is absent, the control drifts, or the mutation is invisible.
 */
export async function checkAppComparison(browser: Browser, run: string) {
  const server = await serveBuild(
    path.join(ROOT, "apps/web/.artifacts/verify-ui-drift", run, "client"),
  );
  try {
    for (const theme of ["light", "dark"] as const) {
      const first = await openApp(browser, server.url, theme);
      let before: Buffer;
      try {
        assert.ok(await first.page.getByRole("tab", { selected: true }).isVisible());
        before = await screenshot(first.page);
        const size = PNG.sync.read(before);
        assert.deepEqual([size.width, size.height], [2880, 1800]);
      } finally {
        await first.page.context().close();
      }
      const second = await openApp(browser, server.url, theme);
      try {
        const current = await screenshot(second.page);
        assert.equal(
          comparePng(before, current).delta.changedPixels,
          0,
          `${browser.browserType().name()} ${theme}: independent app recapture must match`,
        );
        await second.page.addStyleTag({
          content: 'header[data-slot="title-bar"] { transform: translateY(8px) !important; }',
        });
        const changed = comparePng(before, await screenshot(second.page));
        assert.ok(changed.delta.changedPixels > 0, "title-bar displacement must change pixels");
        assert.deepEqual(second.errors, []);
      } finally {
        await second.page.context().close();
      }
    }
  } finally {
    await server.close();
  }
}
