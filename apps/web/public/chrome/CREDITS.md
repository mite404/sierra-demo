# The painted title bar

- `painting.webp` (2880x88, about 3 KB) is an original painting made for this repo by
  `apps/web/scripts/paint-chrome.mjs`: misty green-grey ground with dark tree canopies at the
  top, from seeded SVG noise, so it is the same on every run. Source: that script. Licence:
  none needed, it is ours.
- It follows the style of Ethan's mock
  (`docs/reference/shell-polish/mocks/oil-painting-title-bar.webp`)
  without copying its pixels, and stands in until Ethan names the painting he wants, where it is
  from and under what licence.
- The script decodes the WebP it wrote and keeps lowering its clamp until no pixel of the file is
  brighter than luminance 0.10, so cream and the painted bar's soft ink, cream at 85%, stay above
  4.5:1 anywhere on the bar. `painting.json` records the decoded mean colour and brightest pixel.
  A painting that replaces this one has to pass through the same step.
