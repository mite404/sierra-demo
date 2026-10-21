import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatThreadPanel } from "./ChatThreadPanel";
import type { Thread, ThreadMessage } from "./thread";
import { centerInScroller } from "./threadReveal";

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

// Enough turns that the first ones scroll out of sight and the last cannot centre on its own.
const TURNS = 24;
const long: Thread = {
  title: "A long morning",
  messages: Array.from({ length: TURNS }, (_, i): ThreadMessage => ({
    id: `t-${i}`,
    role: i % 2 === 0 ? "user" : "agent",
    text: `Turn ${i}: the week ran close to the one before it, with the weekend carrying it.`,
    time: "9:00",
  })),
};

function scroller(): HTMLElement {
  const found = host.querySelector<HTMLElement>(".thread-scroll");
  if (!found) throw new Error("no thread");
  return found;
}

function turn(id: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(`[data-turn-id="${id}"]`);
  if (!found) throw new Error(`no turn ${id}`);
  return found;
}

function offCentre(el: HTMLElement, target: HTMLElement): number {
  const view = el.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  return box.top + box.height / 2 - (view.top + view.height / 2);
}

// Resolves once `el` has stopped moving: a smooth scroll has arrived, though its `scrollend` may
// still be a frame away.
async function settled(el: HTMLElement): Promise<void> {
  let last = -1;
  while (el.scrollTop !== last) {
    last = el.scrollTop;
    // oxlint-disable-next-line no-await-in-loop -- one frame between two readings
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

it("keeps the runway through a jump started the frame the scroll before it arrives", async () => {
  flushSync(() => {
    root.render(<ChatThreadPanel thread={long} />);
  });
  const el = scroller();
  const last = turn(`t-${TURNS - 1}`);
  // The first jump heads for the top. The second starts the frame it arrives, before the
  // browser has said `scrollend`; the last turn needs runway, and the first scroll's end must
  // not hand it back while the second is still on its way into it.
  centerInScroller(el, turn("t-2"));
  await settled(el);
  centerInScroller(el, last);
  await vi.waitFor(
    () => {
      expect(Math.abs(offCentre(el, last))).toBeLessThan(40);
    },
    { timeout: 4000 },
  );
  await settled(el);
  expect(Math.abs(offCentre(el, last))).toBeLessThan(40);
  expect(el.style.getPropertyValue("--jump-runway")).not.toBe("");
});

it("hands the runway back once the reader scrolls it out of view, moving nothing", async () => {
  flushSync(() => {
    root.render(<ChatThreadPanel thread={long} />);
  });
  const el = scroller();
  const last = turn(`t-${TURNS - 1}`);
  centerInScroller(el, last);
  await vi.waitFor(
    () => {
      expect(Math.abs(offCentre(el, last))).toBeLessThan(40);
    },
    { timeout: 4000 },
  );
  await settled(el);
  // The reader scrolls away from the turn, with the natural end in view.
  el.scrollTop = 0;
  await vi.waitFor(() => {
    expect(el.style.getPropertyValue("--jump-runway")).toBe("");
  });
  await settled(el);
  expect(el.scrollTop).toBe(0);
});
