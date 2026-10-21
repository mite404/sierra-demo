import { describe, expect, it } from "vitest";
import { redirectFor } from "./redirects";

// Where an address on the page's own origin redirects, if anywhere.
const target = (address: string) => redirectFor(new URL(address, "https://kay.example"));

// Every retired address the table knows, in the shapes a bookmark could hold.
const RETIRED = [
  "/playground",
  "/playground?splash=vitruvian",
  "/demo/weekly-brief",
  "/demo/weekly-brief/",
  "/demo/weekly-brief?script=returned",
  "/demo/weekly-brief?script=nope&splash=landscape",
  "/demo/weekly-brief/t/demo-brief-workload?script=brief",
];

describe("the retired addresses", () => {
  it("send the live playground to the device starter's thread", () => {
    expect(target("/playground")).toBe("/t/playground");
  });

  it("send the demo to the show its script names, or the brief for none or an unknown one", () => {
    expect(target("/demo/weekly-brief?script=returned")).toBe("/t/demo-returned");
    expect(target("/demo/weekly-brief?script=interrupted")).toBe("/t/demo-interrupted");
    expect(target("/demo/weekly-brief")).toBe("/t/demo-brief");
    expect(target("/demo/weekly-brief/")).toBe("/t/demo-brief");
    expect(target("/demo/weekly-brief?script=nope")).toBe("/t/demo-brief");
  });

  it("send a demo thread's address to the same thread under /t/", () => {
    expect(target("/demo/weekly-brief/t/demo-returned-south?script=returned")).toBe(
      "/t/demo-returned-south",
    );
  });

  it("carry ?splash= and nothing else", () => {
    expect(target("/demo/weekly-brief?script=returned&splash=abstract&chrome=x")).toBe(
      "/t/demo-returned?splash=abstract",
    );
    expect(target("/playground?splash=vitruvian")).toBe("/t/playground?splash=vitruvian");
  });

  it("never lead to another retired address, so no redirect loops", () => {
    for (const address of RETIRED) {
      const to = target(address);
      expect(to).toMatch(/^\/t\/[^/?]+(\?splash=\w+)?$/);
      expect(target(String(to))).toBeNull();
    }
  });

  it("leave every other address alone", () => {
    for (const address of ["/", "/t/demo-brief", "/lab", "/demo/weekly-brief/else", "/new"])
      expect(target(address)).toBeNull();
  });
});
