import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, assert, beforeEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { scenarios } from "./fixtures";
import type { AgentMessage } from "./reply";
import { AgentTurn } from "./Turns";
import "./tokens.css";
import "./thread.css";

let host: HTMLElement;
let root: Root;

const lateContent = [
  { label: "words", selector: ".quiet-prose", message: { text: "Tuesday leads." } },
  {
    label: "work",
    selector: ".work-details",
    message: { text: "", work: { steps: [], logs: ["Read the totals."], narration: [] } },
  },
  { label: "card", selector: ".card", message: { text: "", payload: scenarios.trend.payload } },
] satisfies {
  label: string;
  selector: string;
  message: Pick<AgentMessage, "text" | "work" | "payload">;
}[];

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  root.unmount();
  host.remove();
});

function render(message: AgentMessage) {
  flushSync(() => {
    root.render(<AgentTurn message={message} cardsCarry={false} onChoose={() => {}} />);
  });
}

it("shows saved reasoning above the answer on the turn's first paint", () => {
  render({
    id: "saved",
    role: "agent",
    time: "09:16",
    text: "Tuesday leads.",
    thinking: "Seven exceeds three and two.",
  });
  expect(host.querySelector("article")?.firstElementChild?.className).toBe("turn-thinking");
});

it.each(lateContent)(
  "keeps existing $label in place when the first thinking delta arrives late",
  async ({ message: content, selector }) => {
    const message: AgentMessage = {
      id: "late",
      role: "agent",
      time: "09:16",
      streaming: true,
      ...content,
    };
    render(message);
    const existing = host.querySelector(selector);
    assert(existing instanceof HTMLElement, "The answer content did not render");
    const before = existing.getBoundingClientRect().top;

    render({ ...message, thinking: "Check Tuesday. " });
    const toggle = host.querySelector<HTMLButtonElement>(".turn-thinking button");
    assert(toggle instanceof HTMLButtonElement, "The Thinking toggle did not render");
    expect(existing.getBoundingClientRect().top).toBe(before);
    await userEvent.click(toggle);
    expect(host.querySelector(".turn-thinking-text")?.textContent).toBe("Check Tuesday. ");
    expect(existing.getBoundingClientRect().top).toBe(before);

    render({ ...message, thinking: "Check Tuesday. Seven commits.", streaming: false });
    expect(host.querySelector(".turn-thinking button")).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(".turn-thinking-text")?.textContent).toBe(
      "Check Tuesday. Seven commits.",
    );
    expect(existing.getBoundingClientRect().top).toBe(before);
  },
);
