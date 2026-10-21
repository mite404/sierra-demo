import { describe, expect, it } from "vitest";
import { paneAfterPress } from "./layouts";

describe("the layout a press on the switch asks for", () => {
  it("picks the layout pressed", () => {
    expect(paneAfterPress(["canvas"])).toBe("canvas");
    expect(paneAfterPress(["browser"])).toBe("browser");
    expect(paneAfterPress(["thread"])).toBe("thread");
  });

  it("closes an open side pane pressed again back to the thread", () => {
    // Pressing the pressed item leaves the toggle group holding nothing.
    expect(paneAfterPress([])).toBe("thread");
  });

  it("ignores anything that is not a layout", () => {
    expect(paneAfterPress(["tab"])).toBe("thread");
  });
});
