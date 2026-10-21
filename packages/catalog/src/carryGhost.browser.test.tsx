import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { armCarry, type Carried } from "./carry";
import "./tokens.css";
import "./primitives.css";
import "./thread.css";

// The DevTools session the playwright provider opens. The provider declares it this way, but
// the catalog does not depend on the provider, so the one method used here is declared again.
declare module "vitest/browser" {
  interface CDPSession {
    send(method: string, params?: object): Promise<unknown>;
  }
}

type Point = { x: number; y: number };

// An element and its box as [left, top, width, height], from the corner of the element measured.
type Placed = { name: string; box: number[] };

const carried: Carried = { kind: "text", text: "Last week's profit by day" };

// Size containers nested as a thread's are, each with queries of its own, for a lift that has
// to answer every one of them at its own width: `outer` 600px wide, `inner` 380px inside its
// padding, and 50cqw of the nearest, `inner`, is 190px.
const NESTED_CONTAINERS = `
  .probe-outer { container: outer / inline-size; width: 600px; }
  .probe-inner { container: inner / inline-size; width: 400px; padding: 0 10px; }
  .probe-card { width: 50cqw; }
  .probe-card > * { height: 1px; }
  @container outer (min-width: 500px) { .probe-outer-wide { height: 11px; } }
  @container inner (max-width: 480px) { .probe-inner-narrow { height: 13px; } }
  @container (max-width: 380px) { .probe-nearest-narrow { height: 17px; } }
`;

// Takes down what the test drew; every test ends with it.
let unmount = () => {};

// Draws `ui` into a host of its own on the page and returns the host.
function mount(ui: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => {
    root.render(ui);
  });
  unmount = () => {
    root.unmount();
  };
  return host;
}

function find(root: Element, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`nothing matches ${selector}`);
  return element;
}

// A card in a thread as ChatThreadPanel draws one: the panel and its scroll area are the size
// containers `panel` and `thread`, and the card is carried by its header, as CardHeader does.
function CardInThread() {
  return (
    <section className="thread-panel">
      <div className="thread-scroll">
        <article className="turn turn-agent">
          <section className="card" data-context="thread">
            <header
              className="card-heading"
              data-carry=""
              onPointerDown={(event) => {
                const lift = event.currentTarget.closest(".card");
                if (lift instanceof HTMLElement) armCarry(event, { carried, lift });
              }}
            >
              <h2>Last week&apos;s profit by day</h2>
            </header>
            <div className="chart" />
            <footer>
              <span>Demo store sales · Sep 14-20</span>
              <button type="button" className="btn">
                Show my work
              </button>
            </footer>
          </section>
        </article>
      </div>
    </section>
  );
}

// Every element in `root`, with its box relative to the root's corner.
function layoutOf(root: Element): Placed[] {
  const origin = root.getBoundingClientRect();
  return [root, ...root.querySelectorAll("*")].map((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { name: element.localName, box: [left - origin.left, top - origin.top, width, height] };
  });
}

// Where the picture on the pointer is laid out apart from `home`, by more than half a pixel:
// one line per element, so a failure names what moved.
function driftFrom(home: Element): string[] {
  const picture = document.querySelector(".carry-ghost [data-carry-picture]");
  if (!picture) return ["no picture rides the pointer"];
  const expected = layoutOf(home);
  const actual = layoutOf(picture);
  if (actual.length !== expected.length)
    return [`${actual.length} elements on the pointer, ${expected.length} at home`];
  return expected.flatMap(({ name, box }, i) =>
    box.some((value, j) => Math.abs(value - actual[i].box[j]) > 0.5)
      ? [`${name}: [${box.join(", ")}] at home, [${actual[i].box.join(", ")}] on the pointer`]
      : [],
  );
}

// A point in this frame, where the page that holds the frame sends the mouse.
function onPage({ x, y }: Point): Point {
  const frame = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { x: frame.left + x, y: frame.top + y };
}

async function mouse(type: string, at: Point, buttons: number): Promise<void> {
  await cdp().send("Input.dispatchMouseEvent", {
    type,
    ...onPage(at),
    button: "left",
    buttons,
    clickCount: 1,
  });
}

// Presses the mouse in the middle of `grip` and moves it past the lift, as a hand carries a
// card, then measures the picture on the pointer against `home` and lets go.
async function carriedDrift(grip: Element, home: Element): Promise<string[]> {
  const box = grip.getBoundingClientRect();
  const start = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const away = { x: start.x + 30, y: start.y + 20 };
  await mouse("mousePressed", start, 1);
  await mouse("mouseMoved", away, 1);
  const drift = driftFrom(home);
  await mouse("mouseReleased", away, 0);
  return drift;
}

afterEach(() => {
  unmount();
  document.body.replaceChildren();
});

describe("a card carried out of a narrow thread", () => {
  it("rides the pointer laid out as it is at home, in compact density", async () => {
    const card = find(mount(<CardInThread />), ".card");
    expect(getComputedStyle(find(card, "footer")).flexDirection).toBe("column");

    expect(await carriedDrift(find(card, ".card-heading"), card)).toEqual([]);
  });
});

describe("a carry lifted inside nested size containers", () => {
  it("answers each container's queries and cq units at that container's own width", async () => {
    const host = mount(
      <>
        <style>{NESTED_CONTAINERS}</style>
        <div className="probe-outer">
          <div className="probe-inner">
            <div
              className="probe-card"
              onPointerDown={(event) => {
                armCarry(event, { carried, lift: event.currentTarget });
              }}
            >
              <div className="probe-outer-wide" />
              <div className="probe-inner-narrow" />
              <div className="probe-nearest-narrow" />
            </div>
          </div>
        </div>
      </>,
    );
    const card = find(host, ".probe-card");
    const heights = [...card.children].map((probe) => probe.getBoundingClientRect().height);
    expect([card.getBoundingClientRect().width, ...heights]).toEqual([190, 11, 13, 17]);

    expect(await carriedDrift(card, card)).toEqual([]);
  });
});
