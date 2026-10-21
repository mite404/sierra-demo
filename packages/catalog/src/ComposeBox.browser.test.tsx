import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ComposeBox } from "./ComposeBox";
import "./tokens.css";
import "./thread.css";

let host: HTMLDivElement;
let root: Root;

function Composer({ initialDraft = "" }: { initialDraft?: string }) {
  const [draft, setDraft] = useState(initialDraft);
  return (
    <ComposeBox
      draft={draft}
      onDraftChange={setDraft}
      onSend={() => {
        setDraft("");
      }}
    />
  );
}

function field(): HTMLTextAreaElement {
  const found = host.querySelector("textarea");
  if (!found) throw new Error("no message field");
  return found;
}

beforeEach(() => {
  host = document.createElement("div");
  host.style.cssText = "width: 600px; height: 400px; display: flex; align-items: end";
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  root.unmount();
  host.remove();
});

it("grows upward on typing and paste, caps at six lines, and shrinks on deletion and send", async () => {
  flushSync(() => {
    root.render(<Composer />);
  });
  const message = field();
  const bottom = message.parentElement?.getBoundingClientRect().bottom;
  expect(message.clientHeight).toBe(44);
  await userEvent.type(message, "one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three");
  expect(message.clientHeight).toBeGreaterThan(60);
  expect(message.clientHeight).toBeLessThan(70);
  expect(message.scrollHeight).toBe(message.clientHeight);
  expect(message.parentElement?.getBoundingClientRect().bottom).toBe(bottom);

  await userEvent.fill(message, "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight");
  await userEvent.keyboard("{Control>}a{/Control}");
  await userEvent.copy();
  await userEvent.clear(message);
  expect(message.clientHeight).toBe(44);
  await userEvent.click(message);
  await userEvent.paste();
  expect(message.value).toBe("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight");
  expect(message.clientHeight).toBeGreaterThanOrEqual(130);
  expect(message.clientHeight).toBeLessThanOrEqual(131);
  expect(message.scrollHeight).toBeGreaterThan(message.clientHeight);
  expect(message.parentElement?.getBoundingClientRect().bottom).toBe(bottom);

  await userEvent.keyboard("{Enter}");
  expect(message.value).toBe("");
  expect(message.clientHeight).toBe(44);
});

it("sizes an initial draft and reflows unchanged text when the composer width changes", async () => {
  const draft =
    "Please compare this month's revenue with last month's revenue and explain the biggest differences.";
  flushSync(() => {
    root.render(<Composer initialDraft={draft} />);
  });
  const message = field();
  host.querySelector("form")?.style.setProperty("width", "100%");
  host.style.width = "600px";
  await vi.waitFor(() => {
    expect(message.clientHeight).toBe(44);
  });
  host.style.width = "220px";
  await vi.waitFor(() => {
    expect(message.clientHeight).toBeGreaterThan(80);
  });
  expect(message.scrollHeight).toBe(message.clientHeight);
  host.style.width = "600px";
  await vi.waitFor(() => {
    expect(message.clientHeight).toBe(44);
  });
  expect(message.value).toBe(draft);
});
