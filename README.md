# yaklabs

A vertical slice of Kay's interface: a catalog of chart cards an agent may pick from, a chat
thread that renders them, and the runtime around both. `docs/` holds the research, the design
pillars and the ADRs that decide each part; `docs/adr/adr.md` is the index of decisions.

## Layout

A pnpm workspace run by Turborepo, laid out the way Better-T-Stack scaffolds it (`bts.jsonc`
keeps the scaffold's metadata for `pnpm dlx create-better-t-stack@latest add`):

- `apps/web`: the React Router single-page app, built to static files (ADR-083).
- `apps/storybook`: hosts Storybook and the story tests; the stories themselves live beside their
  components in the catalog.
- `apps/gateway`: the one Cloudflare Worker, Hono under `/api` and the web build as its static
  files; it checks WorkOS sign-ins and streams the model's reply (ADR-085, ADR-086).
- `packages/runtime`: the Web Worker that runs the agent loop and keeps conversations in SQLite in
  the browser's private file system (ADR-076, ADR-081).
- `packages/catalog`: the data-view catalog, `@yaklabs/catalog`: components, stories, schemas
  and tests in one place, so they cannot drift apart.
- `packages/ui`: shadcn/ui primitives, `@yaklabs/ui`, themed by Kay's tokens (ADR-082).
- `packages/config`: the shared TypeScript base config.
- `tools/verify-ui-drift`: internal only. The team's UI drift check: it screenshots the
  foundation stories on three engines in both themes and compares them with the approved
  references in `tools/verify-ui-drift/baselines/` (see its README).

`apps/` ships, `packages/` is shared between them, and `tools/` exists only for the team.

## Run

```sh
pnpm install
pnpm dev:web          # the app at http://localhost:5173
pnpm storybook        # the catalog at http://localhost:6006
pnpm test             # unit tests in node, story tests in headless Chromium
pnpm typecheck
pnpm lint && pnpm format:check
pnpm build            # apps/web/build/client, a static site
pnpm build-storybook  # apps/storybook/storybook-static
```

## Checks

Lefthook runs on every commit and touches only staged files: Oxlint, Oxfmt, and a 100-column wrap
for markdown. After a pull or a branch switch it runs `pnpm install` when the lockfile moved past
what `node_modules` holds, so a branch that adds a package never leaves the dev server failing to
resolve it. CI (`.github/workflows/ci.yml`) runs the rest on every pull request: format, lint,
types, the fallow audit against the base branch, unit and story tests, and both builds. Its
`design-verification` job runs `pnpm verify-ui-drift run` and fails on UI drift from the approved
references or on an axe violation. Only a person can approve a new reference, locally.

To prove a component change in a real browser while you work on it, use the
`verify-storybook-component` skill under `.agents/skills/`.
