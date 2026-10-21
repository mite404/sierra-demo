import { createRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { Agent, AgentEvent } from "./agent";
import { ChatThreadPanel } from "./ChatThreadPanel";
import type { ReplyChunk } from "./reply";
import { threads, type ThreadHandle } from "./thread";

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  root.unmount();
  host.remove();
});

// One reply, driven by hand: `chunk` delivers words or an event, `fail` breaks it off, `finish`
// ends it with nothing more to say. Each call to `respond` pushes a fresh one, so a test can hold
// several replies open at once and drive each on its own. It never listens for Stop, as a slow
// source would not, so Stop has to show without it.
type ControlledReply = {
  event: AgentEvent;
  chunk: (chunk: ReplyChunk) => void;
  fail: (error: unknown) => void;
  finish: () => void;
};

function controlledAgent(): { agent: Agent; replies: ControlledReply[] } {
  const replies: ControlledReply[] = [];
  const agent: Agent = {
    respond(event: AgentEvent) {
      let deliver: ((result: IteratorResult<ReplyChunk>) => void) | undefined;
      let raise: ((error: unknown) => void) | undefined;
      const next = () =>
        new Promise<IteratorResult<ReplyChunk>>((resolve, reject) => {
          deliver = resolve;
          raise = reject;
        });
      replies.push({
        event,
        chunk: (value) => deliver?.({ value, done: false }),
        fail: (error) => raise?.(error),
        finish: () => deliver?.({ value: "", done: true }),
      });
      return { [Symbol.asyncIterator]: () => ({ next }) };
    },
  };
  return { agent, replies };
}

function pendingRows(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(".turn-pending")];
}

function thinkingToggle(): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(".turn-thinking .disclosure-header");
  if (!found) throw new Error("no Thinking toggle");
  return found;
}

function field(): HTMLTextAreaElement {
  const found = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');
  if (!found) throw new Error("no compose box");
  return found;
}

it("shows a quiet Thinking indicator while a reply is pending, and clears it on the first content", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });

  await userEvent.type(field(), "And next week?{Enter}");
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(1);
  });
  expect(pendingRows()[0]?.textContent).toContain("Thinking");
  expect(host.textContent).not.toContain("Saturday leads.");

  replies[0]?.chunk("Saturday leads.");
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(0);
  });
  expect(host.textContent).toContain("Saturday leads.");
  replies[0]?.finish();
});

it("replaces streamed summaries behind a Thinking toggle that is the wait until words come", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });

  await userEvent.type(field(), "And next week?{Enter}");
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(1);
  });
  replies[0]?.chunk({ kind: "thinking", text: "Check the trend." });
  const toggle = await vi.waitFor(thinkingToggle);
  expect(pendingRows()).toHaveLength(0);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).toContain("Thinking…");
  expect(toggle.querySelector(".agent-tree")).not.toBeNull();
  expect(host.querySelector(".turn-thinking-text")).toBeNull();

  await userEvent.click(toggle);
  replies[0]?.chunk({ kind: "thinking", text: "They want next week." });
  await vi.waitFor(() => {
    expect(host.querySelector(".turn-thinking-text")?.textContent).toBe("They want next week.");
  });

  replies[0]?.chunk("Saturday leads.");
  await vi.waitFor(() => {
    expect(toggle.querySelector(".agent-tree")).toBeNull();
  });
  expect(toggle.textContent).toBe("Thinking");
  expect(thinkingToggle()).toBe(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(
    host.querySelector(".turn-thinking")?.parentElement?.querySelector(".quiet-prose")?.textContent,
  ).toBe("Saturday leads.");
  replies[0]?.finish();
  await vi.waitFor(() => {
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
  });
  await userEvent.click(toggle);
  expect(host.querySelector(".turn-thinking-text")).toBeNull();
  await userEvent.click(toggle);
  expect(host.querySelector(".turn-thinking-text")?.textContent).toBe("They want next week.");
});

it("keeps interleaved thinking on its own reply, including updates while folded", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });
  await userEvent.type(field(), "First?{Enter}");
  await userEvent.type(field(), "Second?{Enter}");
  replies[1]?.chunk({ kind: "thinking", text: "Second only." });
  await vi.waitFor(() => {
    expect(host.querySelectorAll(".turn-thinking")).toHaveLength(1);
  });
  replies[0]?.chunk({ kind: "thinking", text: "First plan." });
  await vi.waitFor(() => {
    expect(host.querySelectorAll(".turn-thinking")).toHaveLength(2);
  });
  const toggles = [
    ...host.querySelectorAll<HTMLButtonElement>(".turn-thinking .disclosure-header"),
  ];
  expect(toggles).toHaveLength(2);
  const first = toggles[0];
  const second = toggles[1];
  await userEvent.click(first);
  await vi.waitFor(() => {
    expect(first.closest(".turn-thinking")?.textContent).toContain("First ");
  });
  await userEvent.click(first);
  replies[0]?.chunk({ kind: "thinking", text: "First only." });
  await userEvent.click(second);
  expect(second.closest(".turn-thinking")?.querySelector("p")?.textContent).toBe("Second only.");
  await userEvent.click(first);
  await vi.waitFor(() => {
    expect(first.closest(".turn-thinking")?.querySelector("p")?.textContent).toBe("First only.");
  });
  replies[0]?.chunk("First answer.");
  replies[1]?.chunk("Second answer.");
  await vi.waitFor(() => {
    expect(host.textContent).toContain("First answer.");
    expect(host.textContent).toContain("Second answer.");
  });
  replies[0]?.finish();
  replies[1]?.finish();
});

it("clears the indicator on a reply that fails before any content, leaving no stale animation", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });

  await userEvent.type(field(), "And next week?{Enter}");
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(1);
  });

  replies[0]?.fail(new Error("the gateway refused"));
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(0);
  });
  expect(host.textContent).toContain("Could not start");
  expect(host.textContent).toContain("Your request is still here; try again when you're ready.");
  expect(host.querySelector('[aria-busy="true"]')).toBeNull();
});

it("tracks each pending reply on its own, not one shared flag", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });

  await userEvent.type(field(), "First?{Enter}");
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(1);
  });
  await userEvent.type(field(), "Second?{Enter}");
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(2);
  });

  // The second reply lands first; only its own indicator clears, the first's stays put.
  replies[1]?.chunk("Second answer.");
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(1);
  });
  expect(host.textContent).toContain("Second answer.");
  expect(host.textContent).not.toContain("First answer.");

  replies[0]?.chunk("First answer.");
  await vi.waitFor(() => {
    expect(pendingRows()).toHaveLength(0);
  });
  expect(host.textContent).toContain("First answer.");
  replies[0]?.finish();
  replies[1]?.finish();
});

function agentTurns(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(".turn-agent")];
}

function button(name: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
}

it("stops every reply in flight at once, marking each stopped, even one whose source is slow", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });

  await userEvent.type(field(), "First?{Enter}");
  await userEvent.type(field(), "Second?{Enter}");
  await vi.waitFor(() => {
    expect(replies).toHaveLength(2);
  });
  replies[0]?.chunk({ kind: "step", step: { id: "a", label: "North", status: "running" } });
  replies[1]?.chunk("Partly said.");
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Partly said.");
  });

  const stop = button("Stop");
  if (!stop) throw new Error("no Stop while replies stream");
  await userEvent.click(stop);
  await vi.waitFor(() => {
    expect(host.textContent?.match(/Stopped by you/g)).toHaveLength(2);
  });
  expect(host.querySelector('[aria-busy="true"]')).toBeNull();
  expect(button("Stop")).toBeNull();
  expect(host.textContent).toContain("Partly said.");
  expect(host.textContent).toContain("1 check · 1 needs attention");

  // A chunk that arrives after Stop changes nothing.
  replies[1]?.chunk(" More words.");
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(host.textContent).not.toContain("More words.");
});

it("tries a cut-off reply again as a new turn, with the same request and no second bubble", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });

  await userEvent.type(field(), "And next week?{Enter}");
  await vi.waitFor(() => {
    expect(replies).toHaveLength(1);
  });
  replies[0]?.chunk("Monday looks");
  // Each reply takes its next chunk only once it has folded the last one.
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Monday looks");
  });
  replies[0]?.fail(new Error("the line dropped"));
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Interrupted · Incomplete answer");
  });

  const users = host.querySelectorAll(".turn-user").length;
  const retry = [...host.querySelectorAll("button")].find(
    (each) => each.textContent === "Try again",
  );
  if (!retry) throw new Error("no Try again");
  await userEvent.click(retry);
  await vi.waitFor(() => {
    expect(replies).toHaveLength(2);
  });
  expect(replies[1]?.event).toEqual(replies[0]?.event);
  replies[1]?.chunk("Monday looks quiet.");
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Monday looks quiet.");
  });
  expect(host.querySelectorAll(".turn-user")).toHaveLength(users);
  expect(host.textContent).toContain("Interrupted · Incomplete answer");
  replies[1]?.finish();
});

it("docks a question from the stream, and shows the answer with the question it answered", async () => {
  const { agent, replies } = controlledAgent();
  const handle = createRef<ThreadHandle>();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} ref={handle} />);
  });

  await userEvent.type(field(), "Plan the forecast{Enter}");
  await vi.waitFor(() => {
    expect(replies).toHaveLength(1);
  });
  replies[0]?.chunk({
    kind: "question",
    question: {
      question: "How many weeks ahead should it forecast?",
      options: [{ label: "Four weeks" }],
      answer: { placeholder: "Or type a number of weeks" },
    },
  });
  await vi.waitFor(() => {
    expect(host.querySelector('[aria-label="Needs attention"]')).not.toBeNull();
  });
  replies[0]?.finish();

  handle.current?.answer("Four weeks");
  await vi.waitFor(() => {
    expect(host.querySelector('[aria-label="Your answers"]')?.textContent).toBe(
      "How many weeks ahead should it forecast?Four weeks",
    );
  });
  expect(host.querySelector('[aria-label="Needs attention"]')).toBeNull();
  expect(replies[1]?.event).toEqual({ kind: "answer", text: "Four weeks" });
  replies[1]?.finish();
});

it("sends a malformed question from the stream back to the agent, never to the dock", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });

  await userEvent.type(field(), "Plan the forecast{Enter}");
  await vi.waitFor(() => {
    expect(replies).toHaveLength(1);
  });
  replies[0]?.chunk({ kind: "question", question: { question: "" } });
  await vi.waitFor(() => {
    expect(replies).toHaveLength(2);
  });
  expect(replies[1]?.event.kind).toBe("question-rejected");
  expect(host.querySelector('[aria-label="Needs attention"]')).toBeNull();
  replies[0]?.finish();
  replies[1]?.finish();
});

it("lets a host set the draft and send it in one go", async () => {
  const { agent, replies } = controlledAgent();
  const handle = createRef<ThreadHandle>();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} ref={handle} />);
  });

  handle.current?.setDraft("Scripted request");
  handle.current?.send();
  await vi.waitFor(() => {
    expect(replies).toHaveLength(1);
  });
  expect(replies[0]?.event).toMatchObject({ kind: "message", text: "Scripted request" });
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Scripted request");
  });
  expect(field().value).toBe("");
  replies[0]?.finish();
});

it("lets a host step a card by its stop's label, and the choice rides with the next message", async () => {
  const { agent, replies } = controlledAgent();
  const handle = createRef<ThreadHandle>();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.profit} agent={agent} ref={handle} />);
  });
  const slider = host.querySelector<HTMLInputElement>('input[type="range"]');
  expect(slider?.getAttribute("aria-valuetext")).toBe("Gross profit");

  flushSync(() => {
    handle.current?.choose("Net profit");
  });
  expect(slider?.getAttribute("aria-valuetext")).toBe("Net profit");
  expect(host.textContent).toContain("Net profit · Sep 14–20");

  flushSync(() => {
    handle.current?.choose("No such measure");
  });
  expect(slider?.getAttribute("aria-valuetext")).toBe("Net profit");

  handle.current?.setDraft("What about the drop?");
  handle.current?.send();
  await vi.waitFor(() => {
    expect(replies).toHaveLength(1);
  });
  expect(replies[0]?.event).toMatchObject({
    kind: "message",
    attachments: [{ state: { measure: "Net profit" } }],
  });
  // Sent, the card keeps the view the agent now knows.
  expect(slider?.getAttribute("aria-valuetext")).toBe("Net profit");
  replies[0]?.finish();
});

it("leaves no turn behind for a reply that ends having said nothing", async () => {
  const { agent, replies } = controlledAgent();
  flushSync(() => {
    root.render(<ChatThreadPanel thread={threads.trend} agent={agent} />);
  });
  const before = agentTurns().length;

  await userEvent.type(field(), "Anything?{Enter}");
  await vi.waitFor(() => {
    expect(agentTurns()).toHaveLength(before + 1);
  });
  replies[0]?.chunk({ kind: "activity", text: "Thinking it over." });
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Thinking it over.");
  });
  replies[0]?.finish();
  await vi.waitFor(() => {
    expect(agentTurns()).toHaveLength(before);
  });
});
