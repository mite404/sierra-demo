import { describe, expect, it } from "vitest";
import { chooseStories } from "./run.ts";

const ALL = ["button--default", "field--on-paper", "disclosure--open"];
const DEFAULT_STORIES = [
  "foundations-button--default",
  "foundations-text-field--on-paper",
  "foundations-text-field--inside-recap-and-needs-you",
  "foundations-disclosure--folded",
  "foundations-disclosure--open",
];

describe("chooseStories", () => {
  it("defaults to the built-in story set when nothing is requested", async () => {
    const selected = await chooseStories(
      { engines: ["chromium"], themes: ["light"], mode: "comparison" },
      DEFAULT_STORIES,
      0,
      "/tmp",
    );
    expect(selected).toEqual(DEFAULT_STORIES);
  });

  it("honors an explicit story list", async () => {
    const selected = await chooseStories(
      {
        engines: ["chromium"],
        themes: ["light"],
        mode: "comparison",
        stories: ["button--default"],
      },
      ALL,
      0,
      "/tmp",
    );
    expect(selected).toEqual(["button--default"]);
  });

  it("adds the production app shell only when explicitly requested", async () => {
    const selected = await chooseStories(
      {
        engines: ["chromium"],
        themes: ["light"],
        mode: "comparison",
        stories: ["button--default"],
        app: true,
      },
      ALL,
      0,
      "/tmp",
    );
    expect(selected).toEqual(["button--default", "app-shell--demo"]);
  });

  it("selects every indexed story with --all", async () => {
    const selected = await chooseStories(
      { engines: ["chromium"], themes: ["light"], mode: "comparison", all: true },
      ALL,
      0,
      "/tmp",
    );
    expect(selected).toEqual(ALL);
  });

  it("rejects an unindexed story id", async () => {
    await expect(
      chooseStories(
        {
          engines: ["chromium"],
          themes: ["light"],
          mode: "comparison",
          stories: ["not-a-real-story"],
        },
        ALL,
        0,
        "/tmp",
      ),
    ).rejects.toThrow(/unknown Storybook IDs/);
  });

  it("rejects a duplicated story id", async () => {
    await expect(
      chooseStories(
        {
          engines: ["chromium"],
          themes: ["light"],
          mode: "comparison",
          stories: ["button--default", "button--default"],
        },
        ALL,
        0,
        "/tmp",
      ),
    ).rejects.toThrow(/duplicated/);
  });

  it("rejects an empty explicit selection", async () => {
    await expect(
      chooseStories(
        { engines: ["chromium"], themes: ["light"], mode: "comparison", stories: [] },
        ALL,
        0,
        "/tmp",
      ),
    ).rejects.toThrow(/empty/);
  });
});
