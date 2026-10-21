import { openSealedThread, readThreadLink } from "@yaklabs/catalog/threadShare";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import {
  threadIdSchema,
  type ProjectId,
  type ThreadShare,
  type ThreadSummary,
} from "@yaklabs/runtime";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LIFETIMES, liveShare, publish, unpublish, type ShareClient } from "./share-thread";

const NOW = new Date("2026-09-28T10:00:00.000Z");
// What a thread link's fragment carries, checked so a missing one fails the test by name.
const linkSchema = z.object({ id: z.string(), key: z.string() });
const BASE = "https://kay.example";
const turns: ThreadMessage[] = [
  { id: "u1", role: "user", text: "Check the refunds.", time: "9:02" },
  { id: "a1", role: "agent", text: "Two have no order number.", time: "9:03" },
];
// The runtime keeps its project id schema to itself; a test id is one cast.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fixture id, never parsed from outside
const PROJECT = "p" as ProjectId;
const thread: ThreadSummary = {
  id: threadIdSchema.parse("t-1"),
  title: "Refund audit",
  place: { kind: "main", projectId: PROJECT },
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  preview: "",
  turnCount: 0,
  draft: "",
  pinnedAt: null,
  snoozedUntil: null,
  archivedAt: null,
};
const answer = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

// A client whose server answers `respond` and records each request; the device records shares.
function client(respond: (request: Request) => Response) {
  const requests: Request[] = [];
  const kept: ThreadShare[] = [];
  const share: ShareClient = {
    base: BASE,
    now: () => NOW,
    token: () => Promise.resolve("workos-token"),
    turns: () => Promise.resolve(turns),
    keep: (record) => {
      kept.push(record);
      return Promise.resolve();
    },
    fetch: (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return Promise.resolve(respond(request));
    },
  };
  return { share, requests, kept };
}

describe("publish makes a thread public for a while (ADR-131)", () => {
  it("offers 1 hour, 6 hours, 1 day and 7 days", () => {
    expect(LIFETIMES.map((each) => each.label)).toEqual(["1 hour", "6 hours", "1 day", "7 days"]);
  });

  it("sends the gateway only sealed bytes, signed in, and keeps the link with its key", async () => {
    const created = {
      id: "abcdefghijklmnop",
      expiresAt: "2026-09-28T11:00:00.000Z",
      revokeToken: "r",
    };
    const { share, requests, kept } = client(() => answer(201, created));
    const record = await publish(share, thread, 3600);
    const [request] = requests;
    expect(request.url).toBe(`${BASE}/api/shares?ttl=3600`);
    expect(request.headers.get("Authorization")).toBe("Bearer workos-token");
    const sealed = new Uint8Array(await request.arrayBuffer());
    expect(new TextDecoder().decode(sealed)).not.toContain("refunds");
    const link = linkSchema.parse(readThreadLink(new URL(record.link).hash));
    expect(link.id).toBe(created.id);
    expect(await openSealedThread(sealed, link.key)).toEqual({
      v: 1,
      title: "Refund audit",
      messages: turns,
      expiresAt: "2026-09-28T11:00:00.000Z",
    });
    expect(kept).toEqual([
      { ...created, threadId: "t-1", link: record.link, createdAt: NOW.toISOString() },
    ]);
  });

  it.each<[string, Response, string]>([
    ["asks for sign-in when the gateway wants it", answer(401), "Sharing needs you signed in"],
    ["says when there is no share server", answer(404), "This build has no share server"],
    ["passes on any other refusal", answer(413), "The share server answered 413"],
  ])("%s", async (_, response, message) => {
    const { share, kept } = client(() => response);
    await expect(publish(share, thread, 3600)).rejects.toThrow(message);
    expect(kept).toEqual([]);
  });
});

describe("unpublish takes a share down (ADR-131)", () => {
  const record: ThreadShare = {
    id: "abcdefghijklmnop",
    threadId: threadIdSchema.parse("t-1"),
    link: `${BASE}/share.html#t=abcdefghijklmnop.key`,
    revokeToken: "revoke",
    createdAt: NOW.toISOString(),
    expiresAt: "2026-09-28T11:00:00.000Z",
  };

  it("sends its revoke token, and counts one already gone as down", async () => {
    const { share, requests } = client(() => answer(204));
    await unpublish(share, record);
    const [deleted] = requests;
    expect(deleted.method).toBe("DELETE");
    expect(deleted.url).toBe(`${BASE}/api/shares/abcdefghijklmnop`);
    expect(deleted.headers.get("X-Revoke-Token")).toBe("revoke");
  });

  it("fails when the server keeps it", async () => {
    const { share } = client(() => answer(403));
    await expect(unpublish(share, record)).rejects.toThrow("The share server answered 403");
  });
});

const shareEnding = (id: string, expiresAt: string): ThreadShare => ({
  id,
  threadId: thread.id,
  link: `${BASE}/share.html#t=${id}.key`,
  revokeToken: "revoke",
  createdAt: NOW.toISOString(),
  expiresAt,
});

describe("liveShare finds the share that still holds (ADR-131)", () => {
  const newest = shareEnding("newest0000000000", "2026-09-28T11:00:00.000Z");
  const older = shareEnding("older00000000000", "2026-09-28T09:00:00.000Z");

  it("is the newest share while its time has not run out", () => {
    expect(liveShare([newest, older], thread.id, NOW.getTime())).toBe(newest);
  });

  it("is undefined once the newest has ended, and for another thread", () => {
    expect(liveShare([older], thread.id, NOW.getTime())).toBeUndefined();
    expect(liveShare([newest], threadIdSchema.parse("t-2"), NOW.getTime())).toBeUndefined();
  });
});
