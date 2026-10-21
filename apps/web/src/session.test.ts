import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./returnTo";
import { signInState } from "./session";

describe("signInState", () => {
  it("brings a visitor back to the address they wanted, its scenario included", () => {
    const state = signInState({ pathname: "/t/t-005", search: "?scenario=demo" });
    expect(safeReturnTo(state, "https://kay.example")).toBe("/t/t-005?scenario=demo");
  });
});
