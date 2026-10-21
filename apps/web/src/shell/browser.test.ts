import { describe, expect, it } from "vitest";
import { pageAddressSchema, pageAt, parseAddress, REGISTERED_PAGES, START_PAGE } from "./browser";

describe("parseAddress", () => {
  it("adds https to a bare host and path", () => {
    expect(parseAddress("weather.example/radar")).toBe("https://weather.example/radar");
    expect(parseAddress("  start.example ")).toBe("https://start.example/");
  });
  it("lowercases the host and drops the fragment", () => {
    expect(parseAddress("HTTPS://Docs.Example/kay#install")).toBe("https://docs.example/kay");
  });
  it("keeps http and the query", () => {
    expect(parseAddress("http://a.example/x?q=1")).toBe("http://a.example/x?q=1");
  });
  it("refuses what is not a web address", () => {
    for (const input of [
      "",
      "   ",
      "not an address",
      "ftp://a.example/",
      "mailto:a@b.c",
      "https://",
    ])
      expect(parseAddress(input)).toBeNull();
  });
  it("returns an address unchanged when it parses it again", () => {
    for (const input of ["weather.example/radar", "A.example?b=1#c", "http://x.example:8080/p"]) {
      const once = pageAddressSchema.parse(input);
      expect(parseAddress(once)).toBe(once);
    }
  });
  it("refuses what percent-encoding grows past the limit, so a saved shell reads back", () => {
    for (const input of [
      `wiki.example/${"東京".repeat(150)}`,
      `a.example/?q=${'"<'.repeat(400)}`,
      `a.example/${"😀".repeat(200)}`,
    ]) {
      expect(input.length).toBeLessThanOrEqual(2048);
      expect(parseAddress(input)).toBeNull();
    }
  });
});

describe("pageAddressSchema", () => {
  it("stores the same canonical address the field makes", () => {
    expect(pageAddressSchema.parse("docs.example/kay")).toBe(parseAddress("docs.example/kay"));
  });
  it("refuses a saved value that is not an address", () => {
    expect(pageAddressSchema.safeParse("not an address").success).toBe(false);
  });
});

describe("the page registry", () => {
  it("keys every page by an address that parses to itself", () => {
    for (const page of REGISTERED_PAGES) expect(parseAddress(page.address)).toBe(page.address);
  });
  it("opens on the start page, and finds a page however it was typed", () => {
    expect(pageAt(START_PAGE).kind).toBe("start");
    expect(pageAt(pageAddressSchema.parse("Weather.example/radar#now")).kind).toBe("radar");
  });
  it("draws any other address as a simulated page named by its host", () => {
    const other = pageAddressSchema.parse("https://news.example/today");
    expect(pageAt(other)).toEqual({ kind: "simulated", title: "news.example", address: other });
  });
});
