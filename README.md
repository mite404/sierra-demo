# Sierra Agent QA Lab

An independent educational demo of refund authorization, not Sierra's product or SDK. A live
Kimi K3 agent handles conversations; the executor enforces ownership, confirmation, one refund per
payment, and the original payment method. All accounts and payments are synthetic.

**[Open the demo](https://sierra-demo.ethana2008.workers.dev)**. The workspace is public and shared:
visitors can see saved simulations and evidence, run simulations, and use **Reset demo**.

## Try the two simulations

Paste each prompt into the authoring chat. Review the proposal, click **Create simulation**, then
select it in the sidebar and press Play. Use **Create next simulation** before the second prompt.

The model has specific instructions for these two simulations. This vertical slice is not designed
or tested as an equivalent open playground for arbitrary agents, policies, or customer stories.
Green setup bullets mean configured expectations, not passing results.

### 1. Account owner requests a refund

> Morgan, an eligible account owner gets the requested refund only after confirming.
>
> If that payment has already been refunded, do not refund it again. Refer the user to a customer
> experience representative. Refunds go back to the original payment method.

### 2. Cross-account request and human referral

> We’re creating an agent to handle refunds. Casey is signed in to Casey's own account and
> requests
> a refund on Morgan's order. After the agent explains the restriction and presents the two
> options, Casey chooses to pass the conversation to a human customer service representative,
> and the simulation ends.
>
> 1. A person cannot see another person’s account details.
> 2. A person cannot request or approve a refund on another person’s behalf.
> 3. Present two options to the user, Ask the account owner to sign in and request the refund
>    themselves or if the currently authenticated user, Casey would like to pass this conversation
>    off to a human customer service representative.

## Read the results

Completed runs show business checks, a read-only conversation, and **View Database Proof**.
Checks use actual tool attempts and payment state, not the model's claims. Helpful wording needs
human review. An execution error or refusal without a tool attempt does not prove enforcement.

Morgan's eligible payment is $50.00; Casey's unrelated payment is $17.00. Casey cannot authorize
access to Morgan's account. Each run starts with fresh synthetic payments. Referral replies can
describe generating a support ticket, but no representative is contacted and no ticket is created.

Saved simulations and the latest two completed results per simulation persist in D1. Unfinished
chats and active runs remain in memory and can be interrupted by eviction or deployment. Recovery
never automatically replays model requests. Desktop web is the only scenario device.

## Run locally

Use Node 22 or newer and the pinned pnpm version. Supply a demo-only `OPENROUTER_API_KEY` through
Amp project Secrets, then run `amp orb restart-processes`. Outside an orb, use the ignored
`apps/gateway/.dev.vars` file. Never commit the key or put it in a `VITE_` variable.

```sh
pnpm install --frozen-lockfile
amp orb services ensure
```

The orb command builds the website, starts the local Worker, and returns a preview URL. Outside
an orb, run this foreground command and open the address Wrangler prints:

```sh
VITE_AUTH=none pnpm --filter web build && pnpm --filter gateway dev:simulation
```

Restart the simulation service after rebuilding static assets. No WorkOS or payment service is
required. Missing credentials and model failures produce errors, not scripted fallback replies.

## Deploy to Cloudflare

The public deployment uses one Worker for the website and API, one Durable Object for the shared
agent loop, and a dedicated D1 database for saved simulations and JSON proof. It does not reuse
YakLabs or Garage resources. The OpenRouter key stays server-side. Model limits and the key's
spending cap apply; Cloudflare usage is billed separately.

Authenticate Wrangler to the intended account. For a new deployment, create a dedicated D1
database, bind its ID in `apps/gateway/wrangler.deployment.jsonc`, and apply the existing
`simulation-migrations`. Set `OPENROUTER_API_KEY` as a Worker secret, then build and deploy:

```sh
VITE_AUTH=none pnpm --filter web build
pnpm --filter gateway exec wrangler deploy --config wrangler.deployment.jsonc
```

Use `wrangler.deployment.jsonc` for this site and `wrangler.simulation.jsonc` locally, not the
inherited `wrangler.jsonc`.

### Enable automatic deployment

Use Cloudflare Workers Builds, the same native Git integration used by YakLabs. In the
`sierra-demo` Worker's **Settings > Build**, connect `mite404/sierra-demo` with these settings:

- Production branch: `main`; automatic builds enabled; previews disabled.
- Root directory: `/`.
- Build command: `VITE_AUTH=none pnpm --filter web build`.
- Deploy command: `pnpm --filter gateway exec wrangler deploy --config wrangler.deployment.jsonc`.
- Build variable: `NODE_VERSION=26`.
- Build token: a dedicated Sierra deployment token, not a YakLabs credential.

Each merge or push to `main` starts a Cloudflare build. A successful build deploys the Worker;
failed builds leave the previous deployment running. GitHub CI runs separately. To require green
CI before merging, configure required checks and pull requests in GitHub branch protection.
Do not add a second deployment workflow in GitHub Actions.

Keep `OPENROUTER_API_KEY` in the existing Worker secret, not in the web build. GitHub Actions
deployment secrets are not used by this integration. Review builds and retry failures in the
Cloudflare dashboard, then check the [live demo](https://sierra-demo.ethana2008.workers.dev).

The native deploy command does not apply D1 SQL migrations. Before merging schema changes, arrange
a reviewed migration of `sierra-demo-simulations` that remains compatible with the running code.
A Worker rollback does not undo database changes. Deployments can interrupt in-memory chats and
active runs.

## Verify

Run the executor and HTTP regressions with controlled external model transport:

```sh
pnpm --filter gateway exec vitest run src/simulation.test.ts src/simulationWorker.test.ts
```

For browser acceptance, build the website and start the disposable test server:

```sh
VITE_AUTH=none pnpm --filter web build
node apps/web/scripts/simulation-ui-server.mjs
```

In another terminal, run `node apps/web/scripts/simulation-runs-check.mjs`. The journey uses real
HTTP, executor, and disposable D1 with controlled model transport, explicitly labeled not live K3.
Set `PLAYWRIGHT_CHROMIUM` to an installed Chrome executable if needed. CI also runs lint, format,
typechecks, unit and story tests, browser acceptance, and builds.

See [the scope](docs/sierra-demo/PLAN.md), [simulation plan](docs/plans/simulations-plan.md), and
[live-provider recording guide](docs/sierra-demo/VIDEO.md) for details. Live verification spends
model credit; deterministic acceptance is not evidence of live model behavior.

## Source and layout

Copied from `mite404/yaklabs` at `da1073ca8ec29e08070ef312f204db118b08d662`, retaining package
names, design tokens, and source notices. See [third-party notices](THIRD_PARTY_NOTICES.md).
Inherited subsystems are not necessarily available in this vertical slice.

- `apps/web`: React Router website and browser acceptance scripts.
- `apps/gateway`: streamed model conversations, refund executor, and D1 persistence.
- `apps/storybook`: component previews and story tests.
- `packages/catalog` and `packages/ui`: shared styling and components.
- `packages/runtime` and `packages/config`: stream reader and TypeScript configuration.
