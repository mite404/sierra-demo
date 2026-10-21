import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

// Whose session a verified access token carries.
export type VerifiedSession = { userId: string; sessionId: string };

/**
 * Checks a caller's access token and says whose session it carries.
 *
 * @throws when the token is malformed, expired, signed by an unknown key, minted by an
 * unexpected issuer or missing its user or session, so a caller that lets the error escape
 * lets no one through.
 */
export type TokenVerifier = (token: string) => Promise<VerifiedSession>;

// WorkOS's hosted API: it publishes the signing keys and mints the tokens.
const WORKOS_API = "https://api.workos.com";

// The claims the gateway reads from an AuthKit access token: `sub` is the user, `sid` the session.
const claimsSchema = z.object({ sub: z.string().min(1), sid: z.string().min(1) });

// The `iss` values WorkOS's hosted API mints, which depend on when the environment was created
// (workos-node PR #1694): the bare origin for older environments, a per-client path for ones
// created since mid-2025. The session docs also print the origin with a trailing slash. A custom
// auth domain mints its own origin and would have to be added here.
const hostedIssuers = (clientId: string): string[] => [
  WORKOS_API,
  `${WORKOS_API}/`,
  `${WORKOS_API}/user_management/${clientId}`,
];

/**
 * Verifies WorkOS AuthKit access tokens against the client's public signing keys (ADR-084,
 * ADR-085). The key set is fetched on first use and cached for the life of the isolate.
 */
export const workOsVerifier = (clientId: string): TokenVerifier => {
  const keys = createRemoteJWKSet(new URL(`${WORKOS_API}/sso/jwks/${clientId}`)); // → key lookup
  const issuer = hostedIssuers(clientId); // → string[]
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, { issuer }); // → JWTPayload, or throws
    const claims = claimsSchema.parse(payload); // → { sub, sid }, or throws
    return { userId: claims.sub, sessionId: claims.sid };
  };
};
