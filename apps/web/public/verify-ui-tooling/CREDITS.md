# The design tooling page's pictures

Ethan supplied every picture here: screenshots of `tools/verify-ui-drift`'s review app, taken on
his Mac at 2x, each 2000px wide and re-encoded as WebP. The page at `/verify-ui-tooling` shows
them (ADR-160).

- `pixels-workbench.webp` (2000x1551, about 75 KB): the Pixels workbench on Button / Default,
  changed by 3,776 pixels, with the before/after wipe and the 4x pixel inspector on one corner.
  The bento's biggest cell, cropped to its top left.
- `contrast-kay.webp` (2000x979, about 71 KB): the Accessibility tab's Contrast in context
  under the Kay lens, every declared token pair in both themes. The band's main picture.
- `review-header.webp` (2000x543, about 29 KB): the review app's header, the latest run's
  source and time and its summary row, laid over the Kay one's corner.

The seal on the welcome and on the page is drawn by
`apps/web/src/components/design-tooling-seal.tsx`, and the terminal in the hero is set as text
from the run Ethan's terminal screenshot showed, so no picture is needed for either. The
comparator proof's counts are set as a table in the bento, from the review app's own.
