import type { Runtime, ThreadId, ThreadShare, ThreadSummary } from "@yaklabs/runtime";
import { toast } from "sonner";
import { inBackground, reasonOf } from "../runtime";
import { publish, unpublish, type ShareClient } from "./share-thread";
import { wakeText } from "./wake-text";

/** What the menu's Share submenu does (ADR-131). */
export type ShareVerbs = {
  /** Makes a thread public for `seconds`, in place of any link it had, and copies the link. */
  share(id: ThreadId, seconds: number): void;
  /** Takes a thread's public page down now. */
  stopSharing(id: ThreadId): void;
  /** Copies a public thread's link. */
  copyPublicLink(id: ThreadId): void;
  /** Opens the share permissions dialog for a thread (ADR-131); null closes it. */
  askSharePermissions(id: ThreadId | null): void;
  /** Takes down every public page of a thread and its sub-threads, as a delete does. */
  takeDown(id: ThreadId): void;
};

/** What the share verbs need: the runtime, the share client, and the snapshot's shares. */
export type ShareDeps = {
  runtime: Runtime;
  client: ShareClient;
  shares: ThreadShare[];
  threads: ThreadSummary[];
  setSharePermissions: (id: ThreadId | null) => void;
};

/** Copies text and says so in `done`; a refused clipboard shows the text to copy by hand. */
export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch (error: unknown) {
    toast.error("Copying did not work", { description: `${reasonOf(error)} ${text}` });
  }
}

// The thread's shares, newest first, as the snapshot lists them.
const sharesOf = (shares: ThreadShare[], id: ThreadId) =>
  shares.filter((share) => share.threadId === id);

// Takes the shares down on the server, then forgets them on the device.
async function end(runtime: Runtime, client: ShareClient, shares: ThreadShare[]): Promise<void> {
  for (const share of shares) {
    // One at a time: a server that refuses one leaves the rest recorded, to try again.
    // oxlint-disable-next-line no-await-in-loop -- each forget waits on its own take-down
    await unpublish(client, share);
    // oxlint-disable-next-line no-await-in-loop -- as above
    await runtime.unshare(share.id);
  }
}

// Takes a thread's pages down at the user's ask, and says the link is dead.
async function stop(runtime: Runtime, client: ShareClient, shares: ThreadShare[]): Promise<void> {
  await end(runtime, client, shares);
  toast("The public page is down. Its link no longer works.");
}

// Publishes in place of the thread's old links, then copies the new one and says until when.
async function shareFor(deps: ShareDeps, thread: ThreadSummary, seconds: number) {
  const { runtime, client, shares } = deps;
  const old = sharesOf(shares, thread.id);
  await end(runtime, client, old);
  const share = await publish(client, thread, seconds);
  const until = wakeText(new Date(share.expiresAt), "long");
  await copyText(share.link, `Public until ${until}. Link copied.`);
  if (old.length > 0) toast("The old link no longer works.");
}

/** The Share submenu's verbs over the gateway and the runtime (ADR-131). */
export function shareVerbs(deps: ShareDeps): ShareVerbs {
  const { runtime, client, shares, threads, setSharePermissions } = deps;
  const byThread = (id: ThreadId) => threads.find((each) => each.id === id);
  const childrenOf = (id: ThreadId) =>
    threads.filter((each) => each.place.kind === "child" && each.place.parentId === id);
  return {
    share: (id, seconds) => {
      const thread = byThread(id);
      if (thread !== undefined) inBackground(shareFor(deps, thread, seconds), "Sharing");
    },
    stopSharing: (id) => {
      inBackground(stop(runtime, client, sharesOf(shares, id)), "Taking the public page down");
    },
    copyPublicLink: (id) => {
      const latest = shares.find((share) => share.threadId === id);
      if (latest !== undefined) void copyText(latest.link, "Public link copied");
    },
    askSharePermissions: setSharePermissions,
    takeDown: (id) => {
      const ids = new Set([id, ...childrenOf(id).map((each) => each.id)]);
      const all = shares.filter((share) => ids.has(share.threadId));
      if (all.length > 0) inBackground(end(runtime, client, all), "Taking the public page down");
    },
  };
}
