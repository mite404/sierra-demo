import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp } from "vitest/browser";
import { CardHeader } from "./CardHeader";
import { scenarios } from "./fixtures";
import "./tokens.css";

// The DevTools session the playwright provider opens. The provider declares it this way, but
// the catalog does not depend on the provider, so the one method used here is declared again.
declare module "vitest/browser" {
  interface CDPSession {
    send(method: string, params?: object): Promise<unknown>;
  }
}

type Point = { x: number; y: number };

let host: HTMLElement;
let root: Root;
let heading: HTMLElement;

// A point in this frame, where the page that holds the frame sends touches.
function onPage({ x, y }: Point): Point {
  const frame = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { x: frame.left + x, y: frame.top + y };
}

async function touch(type: "touchStart" | "touchMove" | "touchEnd", at?: Point): Promise<void> {
  await cdp().send("Input.dispatchTouchEvent", {
    type,
    touchPoints: at ? [{ ...onPage(at), id: 1 }] : [],
  });
}

beforeEach(async () => {
  await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  host = document.createElement("section");
  host.className = "card";
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <CardHeader
      title="Closed cases"
      drag={{
        card: { v: 1, kind: "catalog", payload: scenarios.trend.payload },
        title: "Closed cases",
      }}
    />,
  );
  heading = await vi.waitFor(() => {
    const header = host.querySelector("header");
    if (!header) throw new Error("the header has not rendered yet");
    return header;
  });
});

afterEach(async () => {
  root.unmount();
  host.remove();
  await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
});

describe("a card header under a finger", () => {
  it("lifts the card instead of scrolling the page", async () => {
    // The page hears how the touch ended, wherever the pointer is held.
    const heard: string[] = [];
    const listening = new AbortController();
    for (const type of ["pointercancel", "pointerup"])
      window.addEventListener(
        type,
        () => {
          heard.push(type);
        },
        { capture: true, signal: listening.signal },
      );
    const box = heading.getBoundingClientRect();
    const start = { x: box.left + 20, y: box.top + box.height / 2 };

    await touch("touchStart", start);
    for (let step = 1; step <= 10; step++)
      // oxlint-disable-next-line no-await-in-loop -- each move lands before the next, as a finger's do
      await touch("touchMove", { x: start.x + step * 3, y: start.y + step * 3 });
    expect(document.documentElement).toHaveAttribute("data-carrying", "card");
    await touch("touchEnd");
    listening.abort();
    expect(heard).toEqual(["pointerup"]);
    expect(document.documentElement).not.toHaveAttribute("data-carrying");
  });
});
