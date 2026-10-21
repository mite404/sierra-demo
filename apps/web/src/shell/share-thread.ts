import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { sealThread, threadLink } from "@yaklabs/catalog/threadShare";
import {
  SHARE_TTLS,
  shareCreatedSchema,
  type ThreadId,
  type ThreadShare,
  type ThreadSummary,
} from "@yaklabs/runtime";

/** What publishing needs: the server, the time, the visitor's token, the turns, and the device's record. */
export type ShareClient = {
  /** Where the gateway answers (ADR-086): the site's origin unless a URL is set. */
  base: string;
  now: () => Date;
  /** The signed-in visitor's token; undefined in a build with no sign-in. */
  token: () => Promise<string> | undefined;
  /** The thread's turns as the worker has them. */
  turns: (thread: ThreadSummary) => Promise<ThreadMessage[]>;
  /** Records the share on the device, link and revoke token included. */
  keep: (share: ThreadShare) => Promise<void>;
  fetch: typeof fetch;
};

/** The lifetimes the Share submenu offers (ADR-131), in its words, as the gateway takes them. */
export const LIFETIMES = ["1 hour", "6 hours", "1 day", "7 days"].map((label, i) => ({
  label,
  seconds: SHARE_TTLS[i] ?? SHARE_TTLS[0],
}));

/**
 * The thread's live share (ADR-131): the newest one the snapshot lists, if its time has not run
 * out at `now`. Undefined means the thread is private.
 */
export function liveShare(
  shares: ThreadShare[],
  id: ThreadId,
  now: number = Date.now(),
): ThreadShare | undefined {
  const latest = shares.find((share) => share.threadId === id);
  return latest !== undefined && Date.parse(latest.expiresAt) > now ? latest : undefined;
}

// A refusal in words fit for a toast: sign-in, a build with no share server, or the status.
function refusal(status: number): Error {
  if (status === 401) return new Error("Sharing needs you signed in");
  if (status === 404 || status === 405) return new Error("This build has no share server");
  return new Error(`The share server answered ${status}`);
}

/**
 * Makes a thread public for `seconds` (ADR-131): seals its turns under a fresh key on the page,
 * sends the gateway only the sealed bytes, and keeps the link, which alone carries the key,
 * on the device with the revoke token.
 * @returns The share as the device now records it.
 * @throws When the visitor is not signed in, the build has no share server, or it refuses.
 */
export async function publish(
  client: ShareClient,
  thread: ThreadSummary,
  seconds: number,
): Promise<ThreadShare> {
  const createdAt = client.now();
  const expiresAt = new Date(createdAt.getTime() + seconds * 1000).toISOString();
  const messages = await client.turns(thread);
  const { sealed, key } = await sealThread({ v: 1, title: thread.title, messages, expiresAt });
  const token = await client.token();
  const response = await client.fetch(`${client.base}/api/shares?ttl=${seconds}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: sealed,
  });
  if (response.status !== 201) throw refusal(response.status);
  const created = shareCreatedSchema.parse(await response.json());
  const share: ThreadShare = {
    ...created,
    threadId: thread.id,
    link: threadLink(created.id, key, { href: client.base }),
    createdAt: createdAt.toISOString(),
  };
  await client.keep(share);
  return share;
}

/**
 * Takes a public share down with its revoke token (ADR-131); one the server has already let go
 * counts as down.
 * @throws When the server keeps it.
 */
export async function unpublish(client: ShareClient, share: ThreadShare): Promise<void> {
  const response = await client.fetch(`${client.base}/api/shares/${share.id}`, {
    method: "DELETE",
    headers: { "X-Revoke-Token": share.revokeToken },
  });
  if (response.status !== 204 && response.status !== 404) throw refusal(response.status);
}
