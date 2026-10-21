import { MAX_SHARE_BYTES, SHARE_TTLS, type ShareCreated } from "./contract";

/** A sealed thread as the gateway keeps it: the bytes it cannot read, when they end, and the revoke token's hash. */
export type StoredShare = { bytes: ArrayBuffer; expiresAt: string; revokeHash: string };

/**
 * Where shares live: Cloudflare KV in the Worker (worker.ts), memory in tests. It forgets each at
 * its end. This module names no Worker type, so the runtime can import the app's types.
 */
export type ShareStore = {
  put(id: string, share: StoredShare, ttlSeconds: number): Promise<void>;
  /** The share, or null once it has ended or been taken down. */
  get(id: string): Promise<StoredShare | null>;
  delete(id: string): Promise<void>;
};

/** What the share routes need: the store, the time, and fresh unguessable tokens. */
export type ShareDeps = { store: ShareStore; now: () => Date; newToken: () => string };

/** A route's answer: a status and a JSON body, or the stored bytes. */
export type ShareAnswer =
  | { status: 201; json: ShareCreated }
  | { status: 200; bytes: ArrayBuffer; expiresAt: string }
  | { status: 204 }
  | { status: 400 | 403 | 404; json: { error: string } };

// A share id or token as the gateway mints them: 16 random bytes, base64url.
const TOKEN = /^[\w-]{16,64}$/;
const TTLS: readonly number[] = SHARE_TTLS;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// The revoke token is kept only as its SHA-256, so a read of the store cannot take a share down.
async function hashOf(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

/** 16 random bytes, base64url: a share's id, or its revoke token. */
export function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Keeps a sealed thread for `ttl` seconds, one of `SHARE_TTLS` (ADR-131). The gateway never
 * sees the key, so it keeps bytes it cannot read.
 */
export async function createShare(
  { store, now, newToken }: ShareDeps,
  ttl: string | undefined,
  bytes: ArrayBuffer,
): Promise<ShareAnswer> {
  const seconds = Number(ttl);
  if (!TTLS.includes(seconds)) return { status: 400, json: { error: "unknown lifetime" } };
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SHARE_BYTES) {
    return { status: 400, json: { error: "bad size" } };
  }
  const [id, revokeToken] = [newToken(), newToken()];
  const expiresAt = new Date(now().getTime() + seconds * 1000).toISOString();
  await store.put(id, { bytes, expiresAt, revokeHash: await hashOf(revokeToken) }, seconds);
  return { status: 201, json: { id, expiresAt, revokeToken } };
}

/** The sealed bytes, to anyone with the id, until the share ends; nothing after, however the store lags. */
export async function readShare({ store, now }: ShareDeps, id: string): Promise<ShareAnswer> {
  const share = TOKEN.test(id) ? await store.get(id) : null;
  if (share === null || Date.parse(share.expiresAt) <= now().getTime()) {
    return { status: 404, json: { error: "gone" } };
  }
  return { status: 200, bytes: share.bytes, expiresAt: share.expiresAt };
}

/** Takes a share down for whoever holds its revoke token; one already gone is taken down too. */
export async function revokeShare(
  { store }: ShareDeps,
  id: string,
  token: string | undefined,
): Promise<ShareAnswer> {
  const share = TOKEN.test(id) ? await store.get(id) : null;
  if (share === null) return { status: 204 };
  if (token === undefined || (await hashOf(token)) !== share.revokeHash) {
    return { status: 403, json: { error: "wrong token" } };
  }
  await store.delete(id);
  return { status: 204 };
}

/** A store in memory that forgets each share at its end, as KV does; for tests. */
export function memoryShares(now: () => number): ShareStore {
  const shares = new Map<string, StoredShare>();
  return {
    put: (id, share) => {
      shares.set(id, share);
      return Promise.resolve();
    },
    get: (id) => {
      const share = shares.get(id);
      return Promise.resolve(
        share === undefined || Date.parse(share.expiresAt) <= now() ? null : share,
      );
    },
    delete: (id) => {
      shares.delete(id);
      return Promise.resolve();
    },
  };
}
