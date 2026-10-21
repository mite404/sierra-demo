import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workOsVerifier } from "./auth";

const CLIENT_ID = "client_01TEST";
const JWKS_URL = `https://api.workos.com/sso/jwks/${CLIENT_ID}`;
const KEY_ID = "sso_oidc_key_pair_01TEST";

// WorkOS's key pair, and a stranger's that reuses its key id.
const workOs = await generateKeyPair("RS256");
const stranger = await generateKeyPair("RS256");
const keySet = { keys: [{ ...(await exportJWK(workOs.publicKey)), kid: KEY_ID, alg: "RS256" }] };

// The claims of the decoded access token in WorkOS's session-token reference, trimmed.
const claims = { sub: "user_01TEST", sid: "session_01TEST", client_id: CLIENT_ID };

// What jose throws when the signature holds but `iss` is not one we accept.
const ISSUER_MISMATCH = { code: "ERR_JWT_CLAIM_VALIDATION_FAILED", claim: "iss" };

type TokenOptions = { issuer?: string; expiresAt?: number | string; key?: CryptoKey };

const signToken = (
  payload: Record<string, unknown>,
  {
    issuer = `https://api.workos.com/user_management/${CLIENT_ID}`,
    expiresAt = "5m",
    key = workOs.privateKey,
  }: TokenOptions = {},
): Promise<string> =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
};

// Serves the key set at WorkOS's JWKS address and nothing anywhere else.
const fakeWorkOs = vi.fn<(input: RequestInfo | URL) => Promise<Response>>((input) =>
  Promise.resolve(
    urlOf(input) === JWKS_URL ? Response.json(keySet) : new Response(null, { status: 404 }),
  ),
);

beforeEach(() => {
  vi.stubGlobal("fetch", fakeWorkOs);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fakeWorkOs.mockClear();
});

describe("workOsVerifier accepts", () => {
  it.each([
    [
      "an environment created since mid-2025",
      `https://api.workos.com/user_management/${CLIENT_ID}`,
    ],
    ["an older environment", "https://api.workos.com"],
    ["the docs' trailing-slash spelling", "https://api.workos.com/"],
  ])("a token minted by %s", async (_label, issuer) => {
    const verify = workOsVerifier(CLIENT_ID);

    await expect(verify(await signToken(claims, { issuer }))).resolves.toEqual({
      userId: "user_01TEST",
      sessionId: "session_01TEST",
    });
    expect(fakeWorkOs).toHaveBeenCalledWith(JWKS_URL, expect.anything());
  });
});

describe("workOsVerifier rejects", () => {
  it("a token from another issuer", async () => {
    const token = await signToken(claims, { issuer: "https://auth.example.com" });

    await expect(workOsVerifier(CLIENT_ID)(token)).rejects.toMatchObject(ISSUER_MISMATCH);
  });

  it("a token another client's issuer minted", async () => {
    const token = await signToken(claims, {
      issuer: "https://api.workos.com/user_management/client_OTHER",
    });

    await expect(workOsVerifier(CLIENT_ID)(token)).rejects.toMatchObject(ISSUER_MISMATCH);
  });

  it("an expired token", async () => {
    const token = await signToken(claims, { expiresAt: Math.floor(Date.now() / 1000) - 60 });

    await expect(workOsVerifier(CLIENT_ID)(token)).rejects.toMatchObject({
      code: "ERR_JWT_EXPIRED",
    });
  });

  it("a token signed by a key WorkOS did not publish", async () => {
    const token = await signToken(claims, { key: stranger.privateKey });

    await expect(workOsVerifier(CLIENT_ID)(token)).rejects.toMatchObject({
      code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
    });
  });

  it("a token that names no session", async () => {
    const token = await signToken({ sub: "user_01TEST" });

    await expect(workOsVerifier(CLIENT_ID)(token)).rejects.toMatchObject({ name: "ZodError" });
  });

  it("a string that is not a token", async () => {
    await expect(workOsVerifier(CLIENT_ID)("not-a-jwt")).rejects.toMatchObject({
      code: "ERR_JWS_INVALID",
    });
  });
});
