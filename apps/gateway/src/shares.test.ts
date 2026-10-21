import type { Anthropic } from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { TokenVerifier } from "./auth";
import { SHARE_TTLS, MAX_SHARE_BYTES, shareCreatedSchema } from "./contract";
import { memoryShares } from "./shares";

const TOKEN = "workos-access-token";
const HOUR = 60 * 60;
const START = Date.parse("2026-09-28T10:00:00.000Z");

const verifyToken: TokenVerifier = (token) =>
  token === TOKEN
    ? Promise.resolve({ userId: "user_01TEST", sessionId: "session_01TEST" })
    : Promise.reject(new Error("unknown token"));

// The share routes never reach the model, so the client is never called.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an unused dependency's stand-in
const upstream = {} as Anthropic;

// An app on a memory store and a clock the test moves; ids count up.
function sharesApp() {
  const clock = { now: START };
  let minted = 0;
  const store = memoryShares(() => clock.now);
  const app = createApp({
    verifyToken,
    upstream,
    shares: {
      store,
      now: () => new Date(clock.now),
      newToken: () => `token-${String(++minted).padStart(16, "0")}`,
    },
  });
  return { app, clock, store };
}

const sealed = new Uint8Array([1, 2, 3, 4, 5]);
const signedIn = { Authorization: `Bearer ${TOKEN}` };

function upload(app: ReturnType<typeof sharesApp>["app"], ttl: number, body = sealed) {
  return app.request(`/api/shares?ttl=${ttl}`, { method: "POST", headers: signedIn, body });
}

describe("POST /api/shares keeps a sealed thread for a while (ADR-131)", () => {
  it("keeps it for the time asked, and names it, its end and its revoke token", async () => {
    const { app } = sharesApp();
    const response = await upload(app, HOUR);
    expect(response.status).toBe(201);
    expect(shareCreatedSchema.parse(await response.json())).toEqual({
      id: "token-0000000000000001",
      revokeToken: "token-0000000000000002",
      expiresAt: "2026-09-28T11:00:00.000Z",
    });
  });

  it("offers exactly 1 hour, 6 hours, 1 day and 7 days", () => {
    expect(SHARE_TTLS).toEqual([HOUR, 6 * HOUR, 24 * HOUR, 7 * 24 * HOUR]);
  });

  it.each<[string, number, Uint8Array<ArrayBuffer>]>([
    ["a lifetime it does not offer", 2 * HOUR, sealed],
    ["nothing", HOUR, new Uint8Array(0)],
    ["more than it keeps", HOUR, new Uint8Array(MAX_SHARE_BYTES + 1)],
  ])("refuses %s", async (_, ttl, body) => {
    const { app } = sharesApp();
    expect((await upload(app, ttl, body)).status).toBe(400);
  });

  it("keeps nothing for someone who is not signed in", async () => {
    const { app } = sharesApp();
    const response = await app.request(`/api/shares?ttl=${HOUR}`, { method: "POST", body: sealed });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/shares/:id hands the sealed bytes to anyone with the link (ADR-131)", () => {
  it("hands them back unread, never cached, with the moment they end", async () => {
    const { app } = sharesApp();
    const { id, expiresAt } = shareCreatedSchema.parse(await (await upload(app, HOUR)).json());
    const response = await app.request(`/api/shares/${id}`);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(sealed);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Expires-At")).toBe(expiresAt);
  });

  it("has nothing once the time is up, even before the store forgets it", async () => {
    const { app, clock } = sharesApp();
    const { id } = shareCreatedSchema.parse(await (await upload(app, HOUR)).json());
    clock.now = START + HOUR * 1000;
    expect((await app.request(`/api/shares/${id}`)).status).toBe(404);
  });

  it("has nothing for an id it never made", async () => {
    const { app } = sharesApp();
    expect((await app.request("/api/shares/token-0000000000000009")).status).toBe(404);
    expect((await app.request("/api/shares/not%20an%20id")).status).toBe(404);
  });
});

describe("DELETE /api/shares/:id takes a share down early (ADR-131)", () => {
  it("takes it down for whoever holds its revoke token, and only them", async () => {
    const { app } = sharesApp();
    const { id, revokeToken } = shareCreatedSchema.parse(await (await upload(app, HOUR)).json());
    const take = (token: string) =>
      app.request(`/api/shares/${id}`, { method: "DELETE", headers: { "X-Revoke-Token": token } });
    expect((await take("token-0000000000000009")).status).toBe(403);
    expect((await app.request(`/api/shares/${id}`)).status).toBe(200);
    expect((await take(revokeToken)).status).toBe(204);
    expect((await app.request(`/api/shares/${id}`)).status).toBe(404);
    expect((await take(revokeToken)).status).toBe(204);
  });
});
