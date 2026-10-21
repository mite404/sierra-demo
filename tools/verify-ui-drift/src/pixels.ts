import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { DIFFERENCE_RGB } from "./diff-palette.ts";
import type { Delta } from "./report.ts";

/** Compares decoded pixels, including antialiasing. Resizing is always a change.
 * The overlay color changes only the diagnostic image, never the measured delta.
 * @throws If either input is not a decodable PNG.
 */
export function comparePng(
  before: Buffer,
  current: Buffer,
  { diffColor = DIFFERENCE_RGB }: { diffColor?: [number, number, number] } = {},
): { delta: Delta; diff: Buffer } {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(current);
  const resized = a.width !== b.width || a.height !== b.height;
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const diff = new PNG({ width, height });
  let changedPixels = width * height;
  if (resized) {
    for (let i = 0; i < diff.data.length; i += 4) {
      diff.data.set([...diffColor, 255], i);
    }
  } else {
    changedPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
      threshold: 0,
      includeAA: true,
      diffColor,
    });
  }
  return {
    delta: { changedPixels, totalPixels: width * height, resized },
    diff: PNG.sync.write(diff),
  };
}
