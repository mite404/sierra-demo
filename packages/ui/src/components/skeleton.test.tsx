import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { Skeleton } from "@yaklabs/ui/components/skeleton";

// → string of space-separated Tailwind classes on the rendered element
function classesOf(html: string) {
  const match = html.match(/class="([^"]*)"/);
  if (!match) throw new Error("rendered skeleton has no class attribute");
  return (match[1] ?? "").split(/\s+/);
}

it("freezes the pulse for prefers-reduced-motion", () => {
  const classes = classesOf(renderToString(<Skeleton />));
  expect(classes).toContain("motion-reduce:animate-none");
});
