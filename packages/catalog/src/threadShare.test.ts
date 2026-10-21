import { describe, expect, it } from "vitest";
import { threads } from "./thread";
import {
  openSealedThread,
  readThreadLink,
  sealThread,
  threadLink,
  type SharedThread,
} from "./threadShare";

const shared: SharedThread = {
  v: 1,
  title: threads.profit.title,
  messages: threads.profit.messages,
  expiresAt: "2026-10-02T09:00:00.000Z",
};
const at = {
  href: "https://kay.example/t/profit?scenario=demo",
  pathname: "/t/profit",
  origin: "https://kay.example",
};

describe("sealThread and openSealedThread (ADR-131)", () => {
  it("opens what it sealed, with the same key", async () => {
    const { sealed, key } = await sealThread(shared);
    expect(await openSealedThread(sealed, key)).toEqual(shared);
  });

  it("seals the same thread differently each time, under a fresh key", async () => {
    const [first, second] = await Promise.all([sealThread(shared), sealThread(shared)]);
    expect(first.key).not.toBe(second.key);
    expect(first.sealed).not.toEqual(second.sealed);
  });

  it("never carries the thread's words in the clear", async () => {
    const { sealed } = await sealThread(shared);
    const bytes = new TextDecoder("utf-8", { fatal: false }).decode(sealed);
    expect(bytes).not.toContain(shared.title);
  });

  it("opens nothing under another key, from damaged bytes, or from a thread that fails its check", async () => {
    const { sealed, key } = await sealThread(shared);
    const other = await sealThread(shared);
    const damaged = sealed.slice();
    // The last byte, one bit flipped.
    damaged.set(
      sealed.subarray(-1).map((byte) => byte ^ 1),
      sealed.length - 1,
    );
    // A thread whose expiry is not an instant: sealed fine, refused on opening.
    const odd = await sealThread({ ...shared, expiresAt: "next week" });
    expect(await openSealedThread(sealed, other.key)).toBeUndefined();
    expect(await openSealedThread(damaged, key)).toBeUndefined();
    expect(await openSealedThread(sealed, "not a key")).toBeUndefined();
    expect(await openSealedThread(odd.sealed, odd.key)).toBeUndefined();
  });
});

describe("threadLink and readThreadLink (ADR-131)", () => {
  it("points at the site's share page from any address, with the id and key in the fragment", () => {
    const link = threadLink("abc_123", "k-ey", at);
    expect(link).toBe("https://kay.example/share.html#t=abc_123.k-ey");
    expect(readThreadLink(new URL(link).hash)).toEqual({ id: "abc_123", key: "k-ey" });
  });

  it("reads nothing from a card's link or a garbled one", () => {
    expect(readThreadLink("#c=eyJ2IjoxfQ")).toBeUndefined();
    expect(readThreadLink("#t=only-an-id")).toBeUndefined();
    expect(readThreadLink("#t=a.b.c")).toBeUndefined();
    expect(readThreadLink("")).toBeUndefined();
  });
});
