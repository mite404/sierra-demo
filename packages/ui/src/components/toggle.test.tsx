import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { Toggle } from "@yaklabs/ui/components/toggle";

// → string of space-separated Tailwind classes on the rendered element
function classesOf(html: string) {
  const match = html.match(/class="([^"]*)"/);
  if (!match) throw new Error("rendered toggle has no class attribute");
  return (match[1] ?? "").split(/\s+/);
}

// classes[] + a "variant:bg-" prefix → the bg-* token(s) gated behind that variant
function fillUnder(classes: string[], prefix: string) {
  return classes.filter((c) => c.startsWith(prefix)).map((c) => c.slice(prefix.length));
}

it("gives the pressed toggle a fill distinct from hover", () => {
  const classes = classesOf(renderToString(<Toggle>Canvas</Toggle>));
  const hoverFill = fillUnder(classes, "hover:bg-");
  const pressedFill = fillUnder(classes, "aria-pressed:bg-");
  expect(pressedFill.length).toBeGreaterThan(0);
  expect(pressedFill).not.toEqual(hoverFill);
});

it("changes the pressed toggle's text colour along with its fill", () => {
  const classes = classesOf(renderToString(<Toggle>Canvas</Toggle>));
  expect(classes).toContain("aria-pressed:text-primary-foreground");
});

it("keeps the focus ring at full strength for the 3:1 UI-part minimum", () => {
  const classes = classesOf(renderToString(<Toggle>Canvas</Toggle>));
  expect(classes).toContain("focus-visible:ring-ring");
  expect(classes).not.toContain("focus-visible:ring-ring/50");
});
