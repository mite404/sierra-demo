import { describe, expect, it } from "vitest";
import { brief } from "../demo/scenarios/brief";
import { at, type Script } from "../demo/script";
import { DEMO_WORLD } from "./demo";
import { ids } from "./ids";
import { childOf, scriptsOf, show, worldOf } from "./spec";

// A script whose one reply starts a child it does not declare.
const stray: Script = {
  ...brief,
  id: "stray",
  children: {},
  beats: [
    { kind: "user", after: 0, text: "Go" },
    {
      kind: "reply",
      events: [
        at(0, { kind: "step", step: { id: "x", label: "X", status: "running", threadId: "x" } }),
      ],
    },
  ],
};

describe("worldOf", () => {
  it("proves the Demo whole, its shows in sidebar order", () => {
    expect(scriptsOf(DEMO_WORLD).map((script) => ids.show(script.id))).toEqual([
      "demo-brief",
      "demo-interrupted",
      "demo-returned",
    ]);
  });

  it("refuses an id declared twice", () => {
    const twice = {
      projects: [{ id: ids.project, name: "Demo", threads: [show(brief), show(brief)] }],
    } as const;
    expect(() => worldOf(twice)).toThrow(/declares "demo-brief" twice/);
  });

  it("refuses a step that names a child its script does not declare", () => {
    const bad = { projects: [{ id: ids.project, name: "Demo", threads: [show(stray)] }] } as const;
    expect(() => worldOf(bad)).toThrow(/names no child "x"/);
  });
});

describe("childOf", () => {
  it("names a child under its main, as the addresses always have", () => {
    expect(childOf(brief, "workload")).toMatchObject({
      id: "demo-brief-workload",
      title: "Weekly workload",
    });
  });
});
