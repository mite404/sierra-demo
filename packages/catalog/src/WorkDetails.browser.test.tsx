import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { scenarios } from "./fixtures";
import type { Work } from "./reply";
import { WorkDetails } from "./WorkDetails";
import "./tokens.css";
import "./thread.css";

// One finished step with an outcome, the lines that say how it was found, and its evidence.
const work: Work = {
  steps: [
    {
      id: "issues",
      label: "Open issues by category",
      status: "done",
      outcome: "18 cases remain open: 12 billing, 4 product, 2 access.",
      basis: ["Counted Friday's 20 open cases", "Set aside 2 billing cases logged twice"],
      evidence: scenarios.comparison.payload,
    },
  ],
  logs: [],
  narration: [],
};

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => {
    root.render(<WorkDetails work={work} label={{ label: "Checked open issues", live: false }} />);
  });
  host.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click();
});

afterEach(() => {
  root.unmount();
  host.remove();
});

// The first element `selector` matches in the rendered details.
function part(selector: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

// The step row's parts, top to bottom, by what each is.
function partsOfStep(): string[] {
  return [...part(".work-step").children].map((child) => child.className.split(" ")[0] ?? "");
}

it("sets the basis lines under the outcome and above the evidence card", async () => {
  await expect
    .poll(partsOfStep)
    .toEqual([
      "work-step-status",
      "work-step-label",
      "work-step-outcome",
      "work-step-basis",
      "card",
    ]);
  const basis = part(".work-step-basis");
  expect(basis.getAttribute("aria-label")).toBe("How this was found");
  expect([...basis.querySelectorAll("li")].map((line) => line.textContent)).toEqual([
    "Counted Friday's 20 open cases",
    "Set aside 2 billing cases logged twice",
  ]);
});

it("sets the lines a step smaller than the outcome, in the body ink", async () => {
  await expect.poll(partsOfStep).toContain("work-step-basis");
  const style = getComputedStyle(part(".work-step-basis"));
  expect([style.fontSize, style.lineHeight, style.listStyleType]).toEqual(["13px", "20px", "disc"]);
  expect(style.color).toBe(getComputedStyle(part(".work-step-outcome")).color);
  expect(getComputedStyle(part(".work-step-outcome")).fontSize).toBe("15px");
});
