import { expect, it } from "vitest";
import { RIBBON_WORDS } from "./design-tooling-seal";
import { SEAL_WORDS } from "./seal-words";

it("draws the ribbon's own words, so a change to them asks for the outlines again", () => {
  // If this fails, run `node apps/web/scripts/seal-words.mjs`.
  expect(SEAL_WORDS.text).toBe(RIBBON_WORDS.toUpperCase());
});
