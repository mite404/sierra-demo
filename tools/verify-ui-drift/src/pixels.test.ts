import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { comparePng } from "./pixels.ts";

function image(width: number, height: number, darkPixel = -1) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  if (darkPixel >= 0) png.data.fill(0, darkPixel * 4, darkPixel * 4 + 3);
  return PNG.sync.write(png);
}

describe("decoded pixel comparison", () => {
  it("reports one changed pixel in an asymmetric six-pixel image", () => {
    const result = comparePng(image(3, 2), image(3, 2, 4));
    expect(result.delta).toEqual({ changedPixels: 1, totalPixels: 6, resized: false });
    expect(PNG.sync.read(result.diff).width).toBe(3);
    const diff = PNG.sync.read(result.diff);
    expect([...diff.data.subarray(16, 20)]).toEqual([57, 255, 20, 255]);
    expect([...diff.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
  });
  it.each([
    { width: 3, changedPixels: 1, resized: false },
    { width: 4, changedPixels: 8, resized: true },
  ])("uses the proof overlay without changing measurements for width $width", (expected) => {
    const result = comparePng(image(3, 2), image(expected.width, 2, 4), {
      diffColor: [255, 0, 0],
    });
    expect(result.delta).toEqual({
      changedPixels: expected.changedPixels,
      totalPixels: expected.width * 2,
      resized: expected.resized,
    });
    expect([...PNG.sync.read(result.diff).data.subarray(16, 20)]).toEqual([255, 0, 0, 255]);
  });
  it("does not report a changed PNG encoding as changed pixels", () => {
    const before = image(3, 2, 1);
    const current = PNG.sync.write(PNG.sync.read(before), { deflateLevel: 1 });
    expect(comparePng(before, current).delta).toEqual({
      changedPixels: 0,
      totalPixels: 6,
      resized: false,
    });
  });
  it("fails for size changes even when both images are solid white", () => {
    expect(comparePng(image(3, 2), image(4, 2)).delta).toEqual({
      changedPixels: 8,
      totalPixels: 8,
      resized: true,
    });
  });
});
