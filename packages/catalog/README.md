# Fieldnotes catalog lab

A React and Storybook experiment for non-technical knowledge workers. Start with the catalog,
not a prompt that asks an LLM to invent an interface.

## Run

This package is `@yaklabs/catalog`, a pnpm workspace member. Install from the repo root, which
owns lint, format and Fallow (`pnpm lint`, `pnpm format`, `pnpm fallow`). Storybook and the
story tests are hosted by `apps/storybook`; only the node unit tests run from here.

```sh
pnpm install            # from the repo root
pnpm --filter @yaklabs/catalog dev
pnpm storybook          # from the root: apps/storybook serves this package's stories
pnpm test               # from the root: unit and story tests
pnpm --filter @yaklabs/catalog build
pnpm build-storybook    # from the root
```

The app is a deterministic evaluation workbench. It does not call a model. The JSON editor accepts
a proposed model response and runs the same validation boundary used by every story.

## Contract

`src/catalog.ts` owns the strict, versioned Zod schema and derives its JSON Schema for future
structured-output model calls. An agent selects exactly one of `LineChart`, `BarChart`, or
`DataTable`, plus bounded data and a component-specific semantic variant. It cannot select layout,
styles, events, HTML, children, JSX, or Recharts configuration. Unknown fields fail closed.
React escapes all text. No evaluated code or HTML insertion exists.

The client picks presentation. Trend connects adjacent observations; snapshot shows isolated dots
without claiming what happened between readings. Comparison uses bars. Audit uses a semantic table.
These are deliberately named analytical meanings, not arbitrary visual styles.

Data preserves input order. Labels are categorical, not parsed timestamps; equal spacing does not
claim elapsed-time accuracy. Null means missing, never zero. Fewer than two known observations in
a LineChart produces a labeled table fallback. Empty arrays produce a no-data state. Invalid
payloads never get partially salvaged. Source labels are supplied, not independently authenticated.

## Storybook as product evaluation

Ten stories cover trend, snapshot, comparison, exact values, sparse fallback, missing observations,
empty data, unsupported requests, unsafe props, and the full workbench. Each uses the same renderer
and shared fixtures. Ask participants to identify the highest observation, find an exact value,
explain a gap, and decide what the unsupported view promises. Compare task success and confidence,
not merely which chart they like. New catalog entries need a task, a strict schema, an accessible
table equivalent, empty/error behavior, stories, and a user evaluation before approval.

`src/tokens.css` owns the restrained green palette, surface/border colors, typography, and
responsive
layout. No payload can override these tokens. It is a prototype token set, not a complete design
system. The Google font request can be removed for an entirely local asset pipeline.

## Unsupported requests become evidence

Capture creates a session-only record with a human-written capability, catalog version, scenario,
reason, fallback, triage status, and timestamp. Download JSON before reloading. It deliberately
omits raw model payloads and business rows. Capability text is not automatically redacted, so users
are told not to include confidential information. Production work would add consent, deduplication,
review ownership, retention policy, and a durable server store.

## A2UI relationship

Inspired by [A2UI's introduction](https://a2ui.org/introduction/what-is-a2ui/): declarative
messages,
trusted catalogs, native client rendering, and client-owned styling. This is intentionally NOT an
A2UI protocol implementation. A2UI permits component graphs and incremental updates. This prototype
chooses a stricter complete-card selection: no arbitrary tree, IDs, bindings, streaming, or actions.
That makes the first product evaluation easier to reason about and the renderer easier to audit.

## Limitations

This validates representation safety, not the truth of business data or the correctness of a model's
selection. The package itself has no live model, sign-in or server storage; `apps/web`, the runtime
worker and the gateway add those around it (ADR-088). There is no provenance verification.
The schema caps 100 rows and bounded finite numbers. An eventual network ingress must also cap
request bytes before JSON parsing. The editor's character limit is only a local UX limit.
Builds currently report upstream Zod annotation warnings and bundle-size warnings. No optimization
claim is made; the development workbench includes JSON Schema inspection and all chart code.
