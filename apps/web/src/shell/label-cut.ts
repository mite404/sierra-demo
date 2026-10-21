import { useLayoutEffect, useRef, type RefObject } from "react";

// Marks a label whose words run past its box (`data-cut`), for index.css to fade them out at
// the right edge rather than end them with an ellipsis.
function mark(label: Element): void {
  if (!(label instanceof HTMLElement)) return;
  if (label.scrollWidth > label.clientWidth) label.dataset.cut = "";
  else delete label.dataset.cut;
}

// One observer for every label in the sidebar, rather than one each: a label is measured again
// whenever its box changes, as the panel is resized or its row gains a count or a glyph.
let observer: ResizeObserver | null = null;
// Watches `label` until the returned function stops it.
function observe(label: HTMLElement): () => void {
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) mark(entry.target);
  });
  const watching = observer;
  watching.observe(label);
  return () => {
    watching.unobserve(label);
  };
}

/**
 * Keeps `data-cut` on a sidebar row's label while its title is too long for the row, so only a
 * cut title fades at its end. Measured again after every render, so a renamed title counts too.
 */
export function useLabelCut(): RefObject<HTMLSpanElement | null> {
  const label = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (label.current !== null) mark(label.current);
  });
  useLayoutEffect(() => (label.current === null ? undefined : observe(label.current)), []);
  return label;
}
