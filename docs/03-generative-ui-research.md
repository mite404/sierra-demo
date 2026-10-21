# Research - UI that agents generate

Question: which foundation lets an LLM build data surfaces (tables, charts) for a user that still look and behave like Kay?

## TanStack versus shadcn/ui: two layers, not two options

| | TanStack Table / Charts | shadcn/ui |
| --- | --- | --- |
| Layer | Logic ("headless": sorting, filtering, pagination, scales, marks) | Look (styled components you copy into your repo, built on Radix + Tailwind) |
| Ships markup and styles? | No | Yes |
| Data surfaces | Table is stable; Charts is a grammar-of-graphics library, officially Alpha as of Sept 2026, APIs may change | Its Data Table is built on TanStack Table; its Charts are built on Recharts |
| Frameworks | React, Vue, Solid, Svelte, Angular; Charts adds Lit, vanilla, experimental React Native | React |

The comparison is engine versus paint job.
shadcn's own Data Table is TanStack Table underneath.
TanStack Charts does not use Recharts: it runs on its own engine built from D3 primitives, and it ships its own versions of shadcn's chart examples as an alternative to the Recharts ones.

## Recharts versus TanStack Charts for agent-built charts

- **Grammar versus chart types**: TanStack Charts composes marks, scales, channels, and transforms; Recharts uses fixed chart-type components.
- **Where the grammar would help**: if the LLM wrote chart specs, a grammar is data it writes well (like Vega-Lite). But under the catalog model (ADR-014) the LLM only fills props of tested components, so this advantage mostly disappears.
- **What remains**: a developer-side benefit of building catalog charts on one grammar and one theme.
- **Rendering**: both render in Electron, whose window is Chromium. Recharts needs a DOM; TanStack Charts can also render SVG without one (server-side), which matters only for charts that leave the app (emailed reports, Slack, PDF, thumbnails).
- **Risk**: TanStack Charts is Alpha; Recharts is mature, shadcn's default, and already used in Ethan's PlanMonster dashboard.
- **Verdict**: Recharts behind Kay's own catalog components; watch TanStack Charts.

## The real question: what is the agent allowed to emit?

If the agent writes JSX against TanStack or shadcn, it can still invent any colour, column format, or button placement.
Coherence comes from a catalog: the agent emits intent plus data, and Kay renders it with its own components.

- **A2UI** (Google, with CopilotKit): a declarative JSON protocol where the client keeps a catalog of trusted components and the agent can only request those. v0.9 shipped April 2026 with React, Flutter, Lit, and Angular renderers. Designed for LLMs: a flat list of components with ID references, generated incrementally.
- **MCP Apps** (official MCP extension, January 2026): tools serve their own HTML via `ui://` resources, rendered in a sandboxed iframe that talks to the host over JSON-RPC. Maximum freedom, minimum coherence.

These are the two ends of the spectrum: A2UI-style catalogs give coherence, while MCP Apps give an escape hatch for plugins that need bespoke UI.

## Recommendation

1. Kay catalog components (`Table`, `Chart`, `Action`, `Edit`, `Receipt`) with constrained, intent-level props.
2. Built from shadcn primitives for the look and TanStack Table for table logic.
3. Charts on Recharts via shadcn, behind catalog components (ADR-014); watch TanStack Charts.
4. Agents emit an A2UI-like JSON spec that references the catalog.
5. Plugins that truly need bespoke UI use a sandboxed iframe with Kay's design tokens injected as CSS variables.

Kay's runtime (Electron, Tauri, or otherwise) is unknown; a catalog plus a JSON spec does not depend on it.

## marimo

marimo is a reactive Python notebook: cells form a dependency graph, editing one re-runs the cells that depend on it, UI widgets bind to values, and notebooks are plain `.py` files that can also run as apps or in the browser via WebAssembly.
It is Python-first and aimed at data work, so Kay should borrow the model, not the tool.
The fit is ADR-008 (Remix): a finished run rendered as cells of catalog components, where editing an upstream step re-runs downstream steps.

## Prior art: `pm-interview-dashboard-main`

Ethan's dashboard already applies the catalog pattern: the LLM names a tool, and an exhaustive `switch` in `src/App.tsx` maps each result to a designed component (shadcn + Recharts).
Its limit is a 1:1 mapping between tool and component, so every new surface needs a developer.
The next step is to decouple them: tools return data, and the agent chooses a presentation intent from the catalog.

## Sources

- [TanStack ecosystem guide, Code With Seb](https://www.codewithseb.com/blog/tanstack-ecosystem-complete-guide-2026)
- [TanStack Charts Alpha, InfoQ](https://www.infoq.com/news/2026/09/tanstack-charts-alpha-introduced/)
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/radix/data-table)
- [shadcn/ui Chart](https://ui.shadcn.com/docs/components/base/chart)
- [Introducing A2UI, Google Developers Blog](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
