import { useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { acceptCarry, armCarry, useCarryTarget, type Carried, type CarryTarget } from "./carry";

const carried: Carried = { kind: "text", text: "Saturday leads at every level" };

// A mouse event at a point, the way the browser would send it.
function pointer(type: string, x: number, y: number, buttons = 0): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  });
}

function middleOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// A fixed box on the page, so every point in these tests is known.
function place(name: string, left: number, top: number): HTMLElement {
  const element = document.createElement("div");
  element.dataset.name = name;
  element.textContent = name;
  Object.assign(element.style, {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: "120px",
    height: "60px",
  });
  document.body.append(element);
  return element;
}

// A handle that lifts itself, as a card header lifts its card.
function handle(name: string, left: number, top: number): HTMLElement {
  const element = place(name, left, top);
  element.addEventListener("pointerdown", (event) => {
    armCarry(event, { carried, lift: element });
  });
  return element;
}

// Takes a carry from the middle of `from` to the middle of `to` and lets go there.
function carryTo(from: HTMLElement, to: HTMLElement): void {
  const start = middleOf(from);
  const end = middleOf(to);
  from.dispatchEvent(pointer("pointerdown", start.x, start.y, 1));
  to.dispatchEvent(pointer("pointermove", end.x, end.y, 1));
  to.dispatchEvent(pointer("pointerup", end.x, end.y));
}

function ghosts(): string[] {
  return [...document.querySelectorAll(".carry-ghost")].map((ghost) => ghost.textContent);
}

// Errors the page reports as uncaught. While a test listens for them, the runner logs them
// instead of failing the run.
let reported: unknown[] = [];
const report = (event: ErrorEvent) => {
  reported.push(event.error);
};

beforeEach(() => {
  reported = [];
  window.addEventListener("error", report);
});

afterEach(() => {
  window.removeEventListener("error", report);
  document.body.replaceChildren();
});

describe("a press on a handle inside another handle", () => {
  it("carries the inner one and still reaches the page", () => {
    const outer = handle("outer", 20, 20);
    const inner = handle("inner", 0, 0);
    Object.assign(inner.style, { position: "absolute", left: "10px", top: "10px", width: "40px" });
    outer.append(inner);
    const pressesHeard: (EventTarget | null)[] = [];
    const hear = (event: Event) => {
      pressesHeard.push(event.target);
    };
    document.addEventListener("pointerdown", hear);

    const start = middleOf(inner);
    inner.dispatchEvent(pointer("pointerdown", start.x, start.y, 1));
    inner.dispatchEvent(pointer("pointermove", start.x + 20, start.y, 1));
    expect(ghosts()).toEqual(["inner"]);
    expect(inner).toHaveAttribute("data-lifted");
    expect(outer).not.toHaveAttribute("data-lifted");
    inner.dispatchEvent(pointer("pointerup", start.x + 20, start.y));
    document.removeEventListener("pointerdown", hear);
    expect(pressesHeard).toEqual([inner]);
  });
});

describe("a carry the window's blur cancels", () => {
  it("lets a click from the keyboard through, but not the release's", async () => {
    const card = handle("card", 20, 20);
    const send = document.createElement("button");
    send.textContent = "Send";
    let sent = 0;
    send.addEventListener("click", () => {
      sent += 1;
    });
    document.body.append(send);

    const start = middleOf(card);
    card.dispatchEvent(pointer("pointerdown", start.x, start.y, 1));
    card.dispatchEvent(pointer("pointermove", start.x + 20, start.y, 1));
    expect(document.documentElement).toHaveAttribute("data-carrying", "text");
    window.dispatchEvent(new Event("blur"));
    expect(document.documentElement).not.toHaveAttribute("data-carrying");

    send.focus();
    await userEvent.keyboard("{Enter}");
    expect(sent).toBe(1);

    const end = middleOf(send);
    send.dispatchEvent(pointer("pointerup", end.x, end.y));
    send.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(sent).toBe(1);
  });
});

// A target that mounts its element only once it is ready, as a canvas waits for its data, and
// writes down every carry dropped on it.
function LateTarget({ ready, dropped }: { ready: number | null; dropped: string[] }) {
  const ref = useRef<HTMLElement>(null);
  useCarryTarget(ref, {
    over: () => true,
    leave: () => {},
    drop: () => {
      dropped.push(`drop on ${ready}`);
    },
  });
  if (ready === null) return <p>Loading</p>;
  return (
    <section
      key={ready}
      ref={ref}
      aria-label="Late target"
      style={{ position: "fixed", left: 300, top: 20, width: 120, height: 60 }}
    />
  );
}

function lateTarget(): HTMLElement {
  const target = document.querySelector<HTMLElement>("[aria-label='Late target']");
  if (!target) throw new Error("the target has not mounted");
  return target;
}

describe("useCarryTarget", () => {
  it("takes carries on an element that mounts after it, and on the one that replaces it", () => {
    const card = handle("card", 20, 20);
    const host = place("host", 0, 200);
    const root = createRoot(host);
    const dropped: string[] = [];
    const render = (ready: number | null) => {
      flushSync(() => {
        root.render(<LateTarget ready={ready} dropped={dropped} />);
      });
    };

    render(null);
    render(1);
    carryTo(card, lateTarget());
    render(2);
    carryTo(card, lateTarget());
    root.unmount();
    expect(dropped).toEqual(["drop on 1", "drop on 2"]);
  });
});

describe("a card that moves between the press and the lift", () => {
  it("rides the pointer by the point it was taken at", () => {
    const card = handle("card", 20, 20);
    card.dispatchEvent(pointer("pointerdown", 80, 50, 1));
    card.style.top = "60px";
    card.dispatchEvent(pointer("pointermove", 100, 50, 1));
    const ghost = document.querySelector<HTMLElement>(".carry-ghost");
    expect(ghost?.style.transform).toBe("translate(40px, 20px)");
    card.dispatchEvent(pointer("pointerup", 100, 50));
  });
});

describe("a press on an element that is gone by the lift", () => {
  it("still lifts cleanly, the picture on the pointer", () => {
    const card = handle("card", 20, 20);
    const line = document.createElement("p");
    line.textContent = "a line the thread re-renders";
    card.replaceChildren(line);
    const start = middleOf(line);

    line.dispatchEvent(pointer("pointerdown", start.x, start.y, 1));
    line.remove();
    card.dispatchEvent(pointer("pointermove", start.x + 20, start.y, 1));
    expect(reported).toEqual([]);
    expect(document.querySelector<HTMLElement>(".carry-ghost")?.style.transform).toMatch(
      /^translate\(/,
    );
    card.dispatchEvent(pointer("pointerup", start.x + 20, start.y));
  });
});

describe("a carry whose target throws", () => {
  it("still ends, and the next carry starts clean", () => {
    const first = handle("first", 20, 20);
    const second = handle("second", 20, 120);
    const spot = place("target", 300, 20);
    const failure = new Error("the target could not take it");
    const throwing: CarryTarget = {
      over: () => true,
      leave: () => {},
      drop: () => {
        throw failure;
      },
    };
    const stop = acceptCarry(spot, throwing);

    carryTo(first, spot);
    expect(reported).toEqual([failure]);
    expect(document.documentElement).not.toHaveAttribute("data-carrying");
    expect(first).not.toHaveAttribute("data-lifted");
    expect(ghosts()).toEqual([]);

    const start = middleOf(second);
    second.dispatchEvent(pointer("pointerdown", start.x, start.y, 1));
    second.dispatchEvent(pointer("pointermove", start.x + 20, start.y, 1));
    expect(ghosts()).toEqual(["second"]);
    expect(second).toHaveAttribute("data-lifted");
    second.dispatchEvent(pointer("pointerup", start.x + 20, start.y));
    expect(ghosts()).toEqual([]);
    stop();
  });
});
