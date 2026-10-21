type Pixels = { width: number; height: number; data: ArrayLike<number> };

/** Frames both captures together; never aligns them independently. */
export function framePixels(images: readonly [Pixels, ...Pixels[]]) {
  const width = Math.max(...images.map((image) => image.width));
  const height = Math.max(...images.map((image) => image.height));
  const full = { x: 0, y: 0, width, height };
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (const image of images) {
    const { data } = image;
    const differs = (offset: number) =>
      data[offset] !== data[0] ||
      data[offset + 1] !== data[1] ||
      data[offset + 2] !== data[2] ||
      data[offset + 3] !== data[3];
    const corners = [
      image.width - 1,
      image.width * (image.height - 1),
      image.width * image.height - 1,
    ];
    if (corners.some((pixel) => differs(pixel * 4))) return full;
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (!differs((y * image.width + x) * 4)) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) return full;
  const x = Math.max(0, left - 24);
  const y = Math.max(0, top - 24);
  return {
    x,
    y,
    width: Math.min(width, right + 25) - x,
    height: Math.min(height, bottom + 25) - y,
  };
}
