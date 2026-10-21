import { expect, it } from "vitest";
import { decodeCard, encodeCard, shareLink, type SharedCard } from "./share";
import { profitCard } from "./thread";

const card: SharedCard = { v: 1, kind: "interactive", payload: profitCard };
// A link from a build that knows a card kind this one does not. `encodeCard` only takes a
// `SharedCard`, so the fragment is spelled out: base64url of plain ASCII JSON, unpadded.
const unknownKind =
  "#c=" + btoa(JSON.stringify({ v: 1, kind: "chat", payload: {} })).replace(/=+$/, "");

it("round-trips a card through a link fragment, including non-ASCII text", () => {
  const withDash: SharedCard = { v: 1, kind: "catalog", payload: { title: "Sep 14–20 · €" } };
  expect(decodeCard("#" + encodeCard(card))).toEqual(card);
  expect(decodeCard(encodeCard(withDash))).toEqual(withDash);
});

it("returns nothing for a fragment that is missing, garbled or of an unknown kind", () => {
  expect(decodeCard("")).toBeUndefined();
  expect(decodeCard("#c=not-base64-json")).toBeUndefined();
  expect(decodeCard(unknownKind)).toBeUndefined();
});

it("links to the site's share.html from any address in the app, and to the public-page story inside Storybook", () => {
  // A card shared from a thread: a relative link would land on /t/share.html, the app's own
  // thread route, which says the thread is gone.
  const thread = {
    href: "https://kay.example/t/profit?scenario=demo",
    pathname: "/t/profit",
    origin: "https://kay.example",
  };
  expect(shareLink(card, thread)).toMatch(/^https:\/\/kay\.example\/share\.html#c=/);
  const storybook = {
    href: "http://localhost:6006/iframe.html?id=x",
    pathname: "/iframe.html",
    origin: "http://localhost:6006",
  };
  expect(shareLink(card, storybook)).toMatch(
    /^http:\/\/localhost:6006\/iframe\.html\?id=share-public-page--from-link&viewMode=story#c=/,
  );
});
