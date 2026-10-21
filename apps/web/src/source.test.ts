import { describe, expect, it } from "vitest";
import { keepScenario, legacyFrom, unknownScenario, wantedFrom } from "./source";

describe("wantedFrom", () => {
  it("opens the device when the address names no scenario", () => {
    expect(wantedFrom("")).toEqual({ kind: "device" });
    expect(wantedFrom("?other=1")).toEqual({ kind: "device" });
  });
  it("opens a scenario the runtime knows", () => {
    expect(wantedFrom("?scenario=long")).toEqual({ kind: "scenario", name: "long" });
  });
  it("keeps a name no scenario has, so it can be refused rather than fall back to the device", () => {
    expect(wantedFrom("?scenario=nope")).toEqual({ kind: "unknown", name: "nope" });
    expect(wantedFrom("?scenario=")).toEqual({ kind: "unknown", name: "" });
  });
});

describe("keepScenario", () => {
  it("leaves a device path alone", () => {
    expect(keepScenario("/t/profit", { kind: "device" })).toBe("/t/profit");
  });
  it("carries the scenario, known or not", () => {
    expect(keepScenario("/lab", { kind: "scenario", name: "demo" })).toBe("/lab?scenario=demo");
    expect(keepScenario("/", { kind: "unknown", name: "a b" })).toBe("/?scenario=a+b");
  });
  it("round-trips through wantedFrom", () => {
    const wanted = wantedFrom("?scenario=thread-fails");
    expect(wantedFrom(new URL(keepScenario("/", wanted), "http://x").search)).toEqual(wanted);
  });
});

describe("unknownScenario", () => {
  it("names every scenario that exists", () => {
    expect(unknownScenario("nope")).toBe(
      'There is no scenario called "nope". The scenarios are demo, empty, long, loading, failure, thread-fails.',
    );
  });
});

describe("legacyFrom", () => {
  it("sends nothing when neither key was written", () => {
    expect(legacyFrom(null, null)).toBeUndefined();
  });
  it("reads both lists and treats a malformed one as empty", () => {
    expect(legacyFrom('["thread-1"]', "not json")).toEqual({ hidden: ["thread-1"], order: [] });
    expect(legacyFrom(null, '["a", 2]')).toEqual({ hidden: [], order: [] });
    expect(legacyFrom("[]", '["b","a"]')).toEqual({ hidden: [], order: ["b", "a"] });
  });
});
