import { describe, expect, it } from "vitest";
import {
  clampWidth,
  parseStoredWidth,
  SIDEBAR_MAX_PX,
  SIDEBAR_MIN_PX,
  widestFor,
  widthForKey,
  widthValue,
} from "./sidebar-width";

describe("widestFor", () => {
  it("is the sidebar's maximum in a wide window", () => {
    expect(widestFor(2560)).toBe(SIDEBAR_MAX_PX);
  });

  it("is 40% of a window where that is less", () => {
    expect(widestFor(1000)).toBe(400);
    expect(widestFor(1001)).toBe(400);
  });

  it("never drops below the narrowest width", () => {
    expect(widestFor(300)).toBe(SIDEBAR_MIN_PX);
  });
});

describe("clampWidth", () => {
  it("rounds a width inside the range", () => {
    expect(clampWidth(300.4, 1440)).toBe(300);
  });

  it("holds a width to the narrowest and the widest", () => {
    expect(clampWidth(40, 1440)).toBe(SIDEBAR_MIN_PX);
    expect(clampWidth(900, 1440)).toBe(SIDEBAR_MAX_PX);
    expect(clampWidth(900, 1000)).toBe(400);
  });
});

describe("parseStoredWidth", () => {
  it("reads a stored width", () => {
    expect(parseStoredWidth("300")).toBe(300);
    expect(parseStoredWidth("300.6")).toBe(301);
  });

  it("holds a stored width to the range", () => {
    expect(parseStoredWidth("12")).toBe(SIDEBAR_MIN_PX);
    expect(parseStoredWidth("9000")).toBe(SIDEBAR_MAX_PX);
  });

  it("refuses what is not a width", () => {
    for (const stored of [null, "", " ", "wide", "-300", "300px", "1e3", "NaN"]) {
      expect(parseStoredWidth(stored)).toBeNull();
    }
  });
});

describe("widthForKey", () => {
  it("steps 16px on an arrow and 64px with Shift", () => {
    expect(widthForKey("ArrowRight", false, 256, 1440)).toBe(272);
    expect(widthForKey("ArrowLeft", false, 256, 1440)).toBe(240);
    expect(widthForKey("ArrowRight", true, 256, 1440)).toBe(320);
    expect(widthForKey("ArrowLeft", true, 256, 1440)).toBe(SIDEBAR_MIN_PX);
  });

  it("goes to the ends on Home and End", () => {
    expect(widthForKey("Home", false, 300, 1440)).toBe(SIDEBAR_MIN_PX);
    expect(widthForKey("End", false, 300, 1440)).toBe(SIDEBAR_MAX_PX);
    expect(widthForKey("End", false, 300, 1000)).toBe(400);
  });

  it("leaves every other key alone", () => {
    expect(widthForKey("Enter", false, 256, 1440)).toBeNull();
    expect(widthForKey("ArrowUp", false, 256, 1440)).toBeNull();
  });
});

describe("widthValue", () => {
  it("caps the width at 40% of the viewport", () => {
    expect(widthValue(256)).toBe("min(256px, 40vw)");
  });
});
