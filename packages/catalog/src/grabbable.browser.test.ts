import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { markGrabbableHighlight } from "./grabbable";

const WORDS = "Saturday leads at every level of the store";

let thread: HTMLElement;
let paragraph: HTMLElement;
let stop: () => void;

function highlighted(): string {
  return document.getSelection()?.toString() ?? "";
}

beforeEach(() => {
  thread = document.createElement("div");
  thread.style.font = "20px/1.6 monospace";
  paragraph = document.createElement("p");
  paragraph.style.margin = "0";
  paragraph.textContent = WORDS;
  thread.append(paragraph);
  document.body.append(thread);
  stop = markGrabbableHighlight(thread);
});

afterEach(() => {
  stop();
  thread.remove();
  document.getSelection()?.removeAllRanges();
});

describe("markGrabbableHighlight, driven by a real mouse", () => {
  it("keeps the word a double-click selects", async () => {
    await userEvent.dblClick(paragraph, { position: { x: 30, y: 10 } });
    expect(highlighted()).toBe("Saturday");
  });

  it("keeps the paragraph a triple-click selects", async () => {
    await userEvent.tripleClick(paragraph, { position: { x: 30, y: 10 } });
    expect(highlighted().trim()).toBe(WORDS);
  });

  it("keeps a highlight dragged out to a point inside it", async () => {
    // Twelve pixels a character: the release sits two pixels inside the sixth, and the
    // highlight ends after it.
    await userEvent.dragAndDrop(paragraph, paragraph, {
      sourcePosition: { x: 1, y: 10 },
      targetPosition: { x: 70, y: 10 },
    });
    expect(highlighted()).toBe("Saturd");
  });

  it("clears a highlight that was already there when it is clicked", async () => {
    await userEvent.dragAndDrop(paragraph, paragraph, {
      sourcePosition: { x: 1, y: 10 },
      targetPosition: { x: 70, y: 10 },
    });
    await userEvent.click(paragraph, { position: { x: 30, y: 10 } });
    expect(highlighted()).toBe("");
  });
});
