# Web application

The web app is the standalone Sierra Agent QA Lab. Its root route renders the simulation, and
unknown or inherited YakLabs routes redirect to `/`.

The browser uses the shared catalog and UI packages. The simulation streams agent events from the
gateway and reads and writes saved simulation definitions through the gateway API. Its browser
state contains only the simulation state needed by the current page; persisted definitions and
completed results live in the local D1 database bound as `SIMULATION_DB`.

## Run and verify

```sh
pnpm dev:web
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
pnpm --filter gateway exec vitest run src/simulation.test.ts src/simulationWorker.test.ts
```

For browser acceptance, start `node apps/web/scripts/simulation-ui-server.mjs` after building,
then run `node apps/web/scripts/simulation-runs-check.mjs` in another terminal. This uses real
HTTP, executor and disposable D1 with controlled external model transport, not live K3.
It covers saved-scenario selection, streamed conversation, results dismissal/reopening, honest
incomplete statuses, preserved evidence, and desktop/narrow shell geometry. The retired manual
customer screen and its separate scenario selector are not part of the app.

Run the local simulation Worker with `pnpm --filter gateway dev:simulation`. The script applies
only the simulation D1 migrations, then starts Wrangler with its local persistence directory.
Saved simulation data remains in `apps/gateway/.wrangler/simulation-state`; the app does not
delete or reset that directory.

The production web build is served as static assets by the simulation Worker. It uses the shared
design tokens and UI components from `@yaklabs/catalog` and `@yaklabs/ui`.
