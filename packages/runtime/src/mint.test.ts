import { describe, expect, it } from "vitest";
import { fixedMint, liveMint } from "./mint";

const stopped = new Date("2026-09-21T14:05:00.000Z");

function mintThree(): string[] {
  const mint = fixedMint(stopped);
  return [mint.project(), mint.thread(), mint.lane()];
}

describe("fixedMint", () => {
  it("counts each kind of id on its own, zero-padded", () => {
    const mint = fixedMint(stopped);
    expect([mint.thread(), mint.project(), mint.thread(), mint.lane()]).toEqual([
      "t-001",
      "p-001",
      "t-002",
      "c-001",
    ]);
  });

  it("mints the same ids again from a fresh start", () => {
    expect(mintThree()).toEqual(mintThree());
  });

  it("never moves its clock, and writes turn times in UTC", () => {
    const mint = fixedMint(stopped);
    const first = mint.now();
    first.setFullYear(2000);
    expect(mint.now().toISOString()).toBe(stopped.toISOString());
    expect(mint.turnTime(stopped)).toBe("14:05");
  });
});

describe("liveMint", () => {
  it("mints fresh random ids with each kind's prefix", () => {
    const mint = liveMint();
    expect(mint.project()).toMatch(/^p-[0-9a-f]{12}$/);
    expect(mint.thread()).toMatch(/^t-[0-9a-f]{12}$/);
    expect(mint.lane()).toMatch(/^c-[0-9a-f]{12}$/);
    expect(mint.thread()).not.toBe(mint.thread());
  });

  it("writes turn times in local time, like the seeds", () => {
    const at = new Date(2026, 8, 21, 9, 2);
    expect(liveMint().turnTime(at)).toBe("9:02");
  });
});
