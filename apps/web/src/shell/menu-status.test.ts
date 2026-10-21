import { describe, expect, it } from "vitest";
import { statusName } from "./menu-status";

describe("statusName", () => {
  it("joins an item's state to its name with a comma, name first", () => {
    expect(statusName("Snooze", "Tue 9:00")).toBe("Snooze, Tue 9:00");
  });

  it("is the bare name when the item has no state", () => {
    expect(statusName("Snooze")).toBe("Snooze");
  });
});
