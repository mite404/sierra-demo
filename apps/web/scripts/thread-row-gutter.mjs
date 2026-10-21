// What the sidebar's thread rows show in their left gutter (ADR-127 to ADR-129), measured: where
// each title's first character starts and where each mark hangs, in px from the row's fill.

/**
 * @typedef {{ mark: string; left: number; right: number; top: number; bottom: number }} MarkBox
 * @typedef {{ title: string; kind: string; height: number; titleX: number; arrowX: number | null;
 *   marks: MarkBox[] }} RowGutter
 */

/**
 * Every thread row in the sidebar: its title's first character, a child's branch icon and its
 * marks.
 * @returns {Promise<RowGutter[]>}
 */
export function rowGutters(page) {
  return page.locator('[data-slot="sidebar"] [data-thread]').evaluateAll((rows) =>
    rows.map((row) => {
      const fill = (row.closest('[data-slot="thread-row"]') ?? row).getBoundingClientRect();
      const label = row.querySelector("[data-label]");
      const first = document.createRange();
      first.setStart(label.firstChild, 0);
      first.setEnd(label.firstChild, 1);
      const arrow = row.querySelector('[data-slot="child-icon"]');
      return {
        title: label.textContent,
        kind: row.dataset.thread,
        height: fill.height,
        titleX: first.getBoundingClientRect().left - fill.left,
        arrowX: arrow === null ? null : arrow.getBoundingClientRect().left - fill.left,
        marks: [...row.querySelectorAll("[data-mark]")].map((icon) => {
          const box = icon.getBoundingClientRect();
          return {
            mark: icon.dataset.mark,
            left: box.left - fill.left,
            right: box.right - fill.left,
            top: box.top - fill.top,
            bottom: box.bottom - fill.top,
          };
        }),
      };
    }),
  );
}

// Whether a mark hangs left of what starts the row's words (a child's branch icon, else its
// title), 4px clear of it, and inside the fill: 3px in from its left edge, between its top and
// bottom.
const hangsInGutter = (row, box) =>
  box.right <= (row.arrowX ?? row.titleX) - 4 &&
  box.left >= 3 &&
  box.top >= 0 &&
  box.bottom <= row.height;

// The x at which the row named `title` starts its title, or NaN if it is not among `rows`.
const titleXOf = (rows, title) => rows.find((row) => row.title === title)?.titleX ?? Number.NaN;

/**
 * Whether marking the rows moved no title, and every mark hangs in its row's gutter, two marks
 * stacked rather than side by side.
 * @param {RowGutter[]} plain the rows with no marks
 * @param {RowGutter[]} marked the same rows once marked
 */
export function gutterHolds(plain, marked) {
  return marked.every(
    (row) =>
      Math.abs(titleXOf(plain, row.title) - row.titleX) < 0.01 &&
      row.marks.every((box) => hangsInGutter(row, box)) &&
      (row.marks.length < 2 || new Set(row.marks.map((box) => box.top)).size === row.marks.length),
  );
}
