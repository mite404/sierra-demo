import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./returnTo";

const ORIGIN = "https://kay.example";

describe("safeReturnTo", () => {
  it("follows a path on our origin, with its query", () => {
    expect(safeReturnTo({ returnTo: "/lab?tab=2" }, ORIGIN)).toBe("/lab?tab=2");
    expect(safeReturnTo({ returnTo: `${ORIGIN}/lab` }, ORIGIN)).toBe("/lab");
  });

  it("lands on the thread when the state is missing or malformed", () => {
    expect(safeReturnTo(undefined, ORIGIN)).toBe("/");
    expect(safeReturnTo({ returnTo: 42 }, ORIGIN)).toBe("/");
    expect(safeReturnTo({ returnTo: "http://[bad" }, ORIGIN)).toBe("/");
  });

  it("refuses another origin, a protocol-relative link and a javascript URI", () => {
    expect(safeReturnTo({ returnTo: "https://evil.example/" }, ORIGIN)).toBe("/");
    expect(safeReturnTo({ returnTo: "//evil.example/lab" }, ORIGIN)).toBe("/");
    expect(safeReturnTo({ returnTo: "javascript:alert(1)" }, ORIGIN)).toBe("/");
  });
});
