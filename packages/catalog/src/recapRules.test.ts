import { describe, expect, it } from "vitest";
import { RECAP_IDLE_MS, formatIdle, shouldShowRecap } from "./recapRules";

const lastUserInputAt = 1_000_000;

describe("shouldShowRecap", () => {
  it("stays hidden before ten idle minutes", () => {
    expect(
      shouldShowRecap({ now: lastUserInputAt + RECAP_IDLE_MS - 1, lastUserInputAt, active: true }),
    ).toBe(false);
  });

  it("appears at ten idle minutes while the thread is active", () => {
    expect(
      shouldShowRecap({ now: lastUserInputAt + RECAP_IDLE_MS, lastUserInputAt, active: true }),
    ).toBe(true);
  });

  it("never appears on an inactive thread", () => {
    expect(
      shouldShowRecap({ now: lastUserInputAt + 2 * RECAP_IDLE_MS, lastUserInputAt, active: false }),
    ).toBe(false);
  });

  it("stays dismissed for the current idle stretch but returns after new input", () => {
    const now = lastUserInputAt + RECAP_IDLE_MS;
    expect(shouldShowRecap({ now, lastUserInputAt, active: true, dismissedAt: now })).toBe(false);
    expect(
      shouldShowRecap({
        now: now + 2 * RECAP_IDLE_MS,
        lastUserInputAt: now + RECAP_IDLE_MS,
        active: true,
        dismissedAt: now,
      }),
    ).toBe(true);
  });
});

it("formats idle time for the recap header", () => {
  expect(formatIdle(12 * 60_000)).toBe("12 min");
  expect(formatIdle(125 * 60_000)).toBe("2 h 5 min");
  expect(formatIdle(120 * 60_000)).toBe("2 h");
});
