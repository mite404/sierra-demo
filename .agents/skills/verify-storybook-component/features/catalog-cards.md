# Catalog cards

A catalog card is the only way the agent can show data: a line chart for a trend, dots for a
snapshot, bars for a comparison, or a table for exact values. Every chart can flip to its data
table. Payloads that fail validation or fall outside the catalog get an honest notice instead of
a guessed chart.

## Sub-features

- `card-trend` draws a line chart for a trend.
- `card-snapshot` draws isolated dots without implying values between readings.
- `card-comparison` draws bars.
- `card-table` shows the exact-values table, and every chart toggles to it and back.
- `card-sparse` falls back to the table when a trend has fewer than two known observations.
- `card-missing` shows gaps for null values instead of zeros.
- `card-empty` states that no observations were supplied, and that this is not zero.
- `card-refusal` refuses unsupported requests and unsafe props without rendering anything
  unvalidated.

## How to get to it (user POV)

- A card arrives inside an agent message in the chat thread (see [Chat thread](./chat-thread.md)).
- A card opens on its own from a share link (see [Share](./share.md)).
- In Storybook: `Catalog/Approved answers`, stories `catalog-approved-answers--{trend,snapshot,
  comparison,exact-values,sparse-fallback,missing-data,empty,unsupported,unsafe-props}`.

## Driving it with Storybook

Preconditions:

- Doctor is OK on port 6106.

- **Chart renders.** Load `catalog-approved-answers--trend`. The ARIA tree has
  `heading "A clearer view of the week" [level=2]` and
  `img "A clearer view of the week. Values available in the data table."`.
- **Table toggle.** Click `button "View data table"`. A
  `table "A clearer view of the week · cases"` appears with `columnheader "Observation"`,
  `columnheader "Value (cases)"` and rows `"Mon 24"` through `"Sun 58"`; the toggle becomes
  `button "Show chart"`. Click it and the image returns.
- **Exact values.** Load `catalog-approved-answers--exact-values`. The table is shown first,
  inside `region "A clearer view of the week · cases"`, which scrolls within a capped height:
  Saturday and Sunday start below the fold. Tab reaches the region (axe
  `scrollable-region-focusable`), and End scrolls it to the last row.
- **Sparse fallback.** Load `catalog-approved-answers--sparse-fallback`. A `status` reads
  `A trend needs at least two known observations. Showing the exact values instead.` above the
  table.
- **Empty.** Load `catalog-approved-answers--empty`. The card reads `NO DATA` and
  `No observations were supplied. This is not a value of zero.` and draws no chart.
- **Refusal.** Load `catalog-approved-answers--unsupported` and `--unsafe-props`. Both show
  `heading "We don’t have a safe view for this yet."` and
  `No unvalidated content was rendered.`, and no `img` or `table`.
- **Proof.** `node .agents/skills/verify-storybook-component/scripts/shoot.mjs` with the nine ids
  above, plus
  `--width 420` for the narrow layout.

## Gotchas

- `catalog-approved-answers--product-evaluation` renders the whole lab workbench (`App`), not a
  card. It is the lab, not the catalog; it still has to render, but it does not prove a card.
- The chart is an SVG from Recharts. Assert on the `img` accessible name and the table rows, not
  on SVG paths, which change with Recharts versions.
- Chart marks are graphite, green is reserved for button hovers (ADR-058). A green line or bar in
  a screenshot is a regression.
- `CatalogCard.tsx` imports no CSS. Its look comes from `tokens.css` and `thread.css`, so a CSS
  change in either reaches every card.
