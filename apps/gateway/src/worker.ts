import { z } from "zod";
import { createApp, type AppType } from "./app";
import { workOsVerifier } from "./auth";
import { randomToken, type ShareStore } from "./shares";
import { openRouterClient } from "./upstream";

// The Worker's bindings: `WORKOS_CLIENT_ID` is a dashboard variable, `OPENROUTER_API_KEY` a
// secret (`wrangler secret put`, ADR-146); `.dev.vars` supplies both under `wrangler dev`.
// `SHARES` is the KV namespace public threads live in (ADR-131).
type Env = { OPENROUTER_API_KEY: string; WORKOS_CLIENT_ID: string; SHARES: KVNamespace };

// Both must be set, and a WorkOS client id (not its API key) must go in the client id slot.
const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  WORKOS_CLIENT_ID: z.string().startsWith("client_"),
});

// Shares in Cloudflare KV, which deletes each at its `expirationTtl` (ADR-131).
function kvShares(kv: KVNamespace): ShareStore {
  type Meta = { expiresAt: string; revokeHash: string };
  return {
    put: (id, { bytes, expiresAt, revokeHash }, ttlSeconds) =>
      kv.put(id, bytes, { expirationTtl: ttlSeconds, metadata: { expiresAt, revokeHash } }),
    get: async (id) => {
      const { value, metadata } = await kv.getWithMetadata<Meta>(id, "arrayBuffer");
      return value === null || metadata === null ? null : { bytes: value, ...metadata };
    },
    delete: (id) => kv.delete(id),
  };
}

// One app per isolate: the JWKS cache and the SDK client live as long as the isolate does.
let app: AppType | undefined;

// Builds the app from the bindings, or throws naming the binding that is missing or wrong.
const appFor = (env: Env): AppType => {
  const { OPENROUTER_API_KEY, WORKOS_CLIENT_ID } = envSchema.parse(env); // → Env, or throws
  return createApp({
    verifyToken: workOsVerifier(WORKOS_CLIENT_ID),
    upstream: openRouterClient(OPENROUTER_API_KEY), // → Anthropic, pointed at OpenRouter
    shares: { store: kvShares(env.SHARES), now: () => new Date(), newToken: randomToken },
  });
};

/**
 * The Cloudflare Workers entry (ADR-086). Static files never reach it; `run_worker_first` sends
 * `/api/*` here and the assets binding serves the rest.
 *
 * @throws when `OPENROUTER_API_KEY` or `WORKOS_CLIENT_ID` is missing or malformed.
 */
export default {
  fetch(request, env, ctx) {
    app ??= appFor(env); // → AppType, built on the first request
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
