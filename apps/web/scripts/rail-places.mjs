// The rail's places as the browser levers expect them, and how a lever finds and reads them.
// Kept apart from the levers' harness, so a script that only needs the list starts no browser
// and makes no output folder.

/**
 * The rail's places top to bottom (ADR-094, amended): each one's name, its role, the lucide
 * glyph it draws (Kay draws its own mark), whether it is outside the demo's scope, and whether
 * it opens a site elsewhere, in a new tab (ADR-144).
 */
export const RAIL_PLACES = [
  { name: "Home", role: "link", icon: null, outOfScope: false, external: false },
  { name: "Memory", role: "button", icon: "lucide-brain", outOfScope: true, external: false },
  { name: "Skills", role: "button", icon: "lucide-unplug", outOfScope: true, external: false },
  { name: "App store", role: "button", icon: "lucide-store", outOfScope: true, external: false },
  {
    name: "Analytics",
    role: "button",
    icon: "lucide-chart-column-increasing",
    outOfScope: true,
    external: false,
  },
  { name: "Automations", role: "button", icon: "lucide-clock", outOfScope: true, external: false },
  {
    name: "Documentation",
    role: "link",
    icon: "lucide-book-open",
    outOfScope: false,
    external: true,
  },
  { name: "Lab", role: "link", icon: "lucide-flask-conical", outOfScope: false, external: false },
];

/**
 * Runs in the page: each place in a places header (the rail's, or the phone drawer's), top to
 * bottom, as its accessible name, its role, its first glyph's lucide class, the glyph's box, and
 * its unavailable state.
 */
export function readPlaces(header) {
  return [...header.querySelectorAll('[data-sidebar="menu-button"]')].map((el) => {
    const glyph = el.querySelector("svg");
    const box = glyph.getBoundingClientRect();
    const described = el.getAttribute("aria-describedby");
    return {
      name: el.getAttribute("aria-label") ?? el.textContent.trim(),
      role: el.tagName === "A" ? "link" : el.tagName.toLowerCase(),
      icon: /lucide-[\w-]+/.exec(glyph.getAttribute("class"))?.[0] ?? null,
      glyph: [box.x, box.y, box.width, box.height],
      disabled: el.getAttribute("aria-disabled"),
      href: el.getAttribute("href"),
      description:
        described === null ? null : document.querySelector(`[id="${described}"]`).textContent,
    };
  });
}

/** The desktop's rail of a Playwright page (ADR-144): the places and, at its foot, the account. */
export const railOf = (page) => page.locator('[data-slot="rail"]');

/** A place in the desktop's rail of a Playwright page, by its role and name. */
export const placeOf = (page, { role, name }) =>
  railOf(page).getByRole(role, { name, exact: true });

/**
 * Runs in the page: each place outside the demo in the phone drawer's header, as its name's
 * edges and whether it shows whole, its hint's words, edges and visibility, the button's edges,
 * and the inks of the name and the hint with the drawer's shell behind them.
 */
export function readOutOfScopeRows(header) {
  const shell = getComputedStyle(header.closest('dialog[data-slot="sidebar"]'));
  return [...header.querySelectorAll('[aria-disabled="true"]')].map((el) => {
    const spans = [...el.querySelectorAll("span")];
    const [label] = spans;
    const tag = spans.find((span) => span.getAttribute("aria-hidden") === "true");
    const [labelBox, tagBox, buttonBox] = [label, tag, el].map((each) =>
      each.getBoundingClientRect(),
    );
    return {
      name: label.textContent,
      label: { left: labelBox.left, right: labelBox.right },
      whole: label.scrollWidth <= label.clientWidth,
      tag: tag.textContent,
      shown: tag.checkVisibility(),
      tagBox: { left: tagBox.left, right: tagBox.right },
      button: { left: buttonBox.left, right: buttonBox.right },
      labelInk: getComputedStyle(label).color,
      tagInk: getComputedStyle(tag).color,
      shell: shell.backgroundColor,
    };
  });
}
