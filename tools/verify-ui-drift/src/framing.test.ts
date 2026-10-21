import { expect, it } from "vitest";
import { framePixels } from "./framing.ts";

function pixels(x: number, y: number) {
  const data = new Uint8ClampedArray(400 * 180 * 4).fill(255);
  for (let row = y; row < y + 70; row++) {
    for (let column = x; column < x + 120; column++) {
      data.set([20, 40, 30, 255], (row * 400 + column) * 4);
    }
  }
  return { width: 400, height: 180, data };
}

it("frames the union of content without aligning away its displacement", () => {
  expect(framePixels([pixels(40, 30), pixels(50, 50)])).toEqual({
    x: 16,
    y: 6,
    width: 178,
    height: 138,
  });
});

it("keeps an entirely uniform capture visible", () => {
  expect(
    framePixels([{ width: 400, height: 180, data: new Uint8ClampedArray(400 * 180 * 4) }]),
  ).toEqual({ x: 0, y: 0, width: 400, height: 180 });
});

it("does not guess a background when corners disagree", () => {
  const image = pixels(40, 30);
  image.data.set([1, 2, 3, 255], 0);
  expect(framePixels([image])).toEqual({ x: 0, y: 0, width: 400, height: 180 });
});
