# The canvas splash and the welcome's paintings

Ethan supplied every picture here. Their origin and licence are still to be confirmed.

- `landscape.webp` (1280x853, about 267 KB) is Ethan's oil painting of a river valley, resized
  from his 1536x1024 file and re-encoded at quality 78. It sits behind a new thread's welcome
  (ADR-136) under `--splash-wash`, cleared to paper behind the words.
- `abstract.webp` (1280x1024, about 262 KB) is Ethan's abstract oil brush strokes, resized from
  his 1408x1120 file and re-encoded the same way. Drawn exactly as the landscape is, under
  the same `--splash-wash`.
- `atlas.webp` (635x1081, about 73 KB, lossless) is Ethan's Atlas figure holding the globe, cut
  to a stencil: black strokes on alpha, with his fade towards the feet baked into the alpha. It
  is a CSS mask filled with `--splash-figure` on the empty canvas, so only the strokes show and
  they theme with the ink. The welcome's Vitruvian look draws the same sheet behind its words.
- `atlas-lines.svg` is an original construction drawn by `apps/web/scripts/draw-atlas-lines.mjs`
  after Ethan's composed canvas surface: circles concentric with the globe and spokes through
  its centre. A CSS mask filled with `--splash-line`. No licence is needed.
