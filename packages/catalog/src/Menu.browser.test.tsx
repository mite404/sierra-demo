import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Menu, type TriggerProps } from "./Menu";
import "./tokens.css";

let host: HTMLElement;
let root: Root;

function renderTrigger(props: TriggerProps) {
  return <button {...props}>Share</button>;
}

function trigger(): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>("button[aria-haspopup=menu]");
  if (!found) throw new Error("no menu trigger rendered");
  return found;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => {
    root.render(
      <Menu
        label="Share this card"
        items={[{ label: "Copy public link", onSelect: () => {} }]}
        trigger={renderTrigger}
      />,
    );
  });
});

afterEach(() => {
  root.unmount();
  host.remove();
});

it("points aria-controls at the list only while the list exists", async () => {
  expect(trigger().hasAttribute("aria-controls")).toBe(false); // closed: nothing to point at

  await userEvent.click(trigger());
  const id = String(trigger().getAttribute("aria-controls")); // → the open list's id
  expect(document.querySelector(`#${CSS.escape(id)}`)?.getAttribute("role")).toBe("menu");

  await userEvent.keyboard("{Escape}");
  expect(trigger().hasAttribute("aria-controls")).toBe(false); // closed again
});
