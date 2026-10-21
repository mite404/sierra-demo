import { describe, expect, it } from "vitest";
import {
  LIFT_PX,
  stepCarry,
  type Carried,
  type CarryEffect,
  type CarryInput,
  type CarryPoint,
  type CarryState,
  type CarryTarget,
} from "./carry";

const carried: Carried = { kind: "text", text: "Saturday leads at every level" };
const from = { x: 100, y: 100 };
const far = { x: 140, y: 120 };

// Targets are compared by identity, so each stub stands for a different place on the page.
function target(): CarryTarget {
  return { over: () => true, leave: () => {}, drop: () => {} };
}
const canvas = target();
const sidebar = target();

const idle: CarryState = { phase: "idle" };
const armed: CarryState = { phase: "armed", pointerId: 1, from, carried };
const carrying: CarryState = { phase: "carrying", pointerId: 1, carried, hover: null };
const hovering = (accepted: boolean): CarryState => ({
  ...carrying,
  hover: { target: canvas, accepted },
});

const press: CarryInput = { kind: "press", pointerId: 1, at: from, carried };
const move = (at: CarryPoint, over: CarryTarget | null, pointerId = 1): CarryInput => ({
  kind: "move",
  pointerId,
  at,
  target: over,
});
const release = (pointerId = 1): CarryInput => ({ kind: "release", pointerId, at: far });
const answer = (by: CarryTarget, accepted: boolean): CarryInput => ({
  kind: "answer",
  target: by,
  accepted,
});

type Row = {
  name: string;
  state: CarryState;
  input: CarryInput;
  next: CarryState;
  effects: CarryEffect[];
};

// Rows where `state` hears each input and nothing happens.
function ignores(phase: string, state: CarryState, inputs: [string, CarryInput][]): Row[] {
  return inputs.map(([what, input]) => ({
    name: `${phase} ignores ${what}`,
    state,
    input,
    next: state,
    effects: [],
  }));
}

const secondPointer: [string, CarryInput][] = [
  ["a second pointer's press", { ...press, pointerId: 2 }],
  ["a second pointer's move", move(far, sidebar, 2)],
  ["a second pointer's release", release(2)],
  ["a second pointer's cancel", { kind: "pointercancel", pointerId: 2 }],
];

const rows: Row[] = [
  { name: "idle arms on a press", state: idle, input: press, next: armed, effects: [] },
  ...ignores("idle", idle, [
    ["a move", move(far, canvas)],
    ["a release", release()],
    ["pointercancel", { kind: "pointercancel", pointerId: 1 }],
    ["Escape or blur", { kind: "cancel" }],
    ["an answer", answer(canvas, true)],
  ]),

  {
    name: "armed stays armed on a move short of the lift",
    state: armed,
    input: move({ x: from.x + LIFT_PX - 1, y: from.y }, canvas),
    next: armed,
    effects: [],
  },
  {
    name: "armed lifts at the lift distance, over nothing",
    state: armed,
    input: move({ x: from.x + LIFT_PX, y: from.y }, null),
    next: carrying,
    effects: [{ kind: "lift" }, { kind: "follow", at: { x: from.x + LIFT_PX, y: from.y } }],
  },
  {
    name: "armed lifts past the lift distance and asks the target under it",
    state: armed,
    input: move(far, canvas),
    next: hovering(false),
    effects: [
      { kind: "lift" },
      { kind: "follow", at: far },
      { kind: "over", target: canvas, carried, at: far },
    ],
  },
  ...(
    [
      ["as a click on a release without a lift", release()],
      ["on pointercancel", { kind: "pointercancel", pointerId: 1 }],
      ["on Escape or blur", { kind: "cancel" }],
    ] satisfies [string, CarryInput][]
  ).map(([how, input]) => ({
    name: `armed ends ${how}`,
    state: armed,
    input,
    next: idle,
    effects: [{ kind: "end", lifted: false }] satisfies CarryEffect[],
  })),
  ...ignores("armed", armed, [...secondPointer, ["a stray answer", answer(canvas, true)]]),

  {
    name: "carrying moves the picture and asks the target it enters",
    state: carrying,
    input: move(far, canvas),
    next: hovering(false),
    effects: [
      { kind: "follow", at: far },
      { kind: "over", target: canvas, carried, at: far },
    ],
  },
  {
    name: "carrying asks the same target again on every move",
    state: hovering(true),
    input: move(far, canvas),
    next: hovering(false),
    effects: [
      { kind: "follow", at: far },
      { kind: "over", target: canvas, carried, at: far },
    ],
  },
  {
    name: "carrying between targets leaves the old before asking the new",
    state: hovering(true),
    input: move(far, sidebar),
    next: { ...carrying, hover: { target: sidebar, accepted: false } },
    effects: [
      { kind: "follow", at: far },
      { kind: "leave", target: canvas },
      { kind: "over", target: sidebar, carried, at: far },
    ],
  },
  {
    name: "carrying off a target leaves it",
    state: hovering(true),
    input: move(far, null),
    next: carrying,
    effects: [
      { kind: "follow", at: far },
      { kind: "leave", target: canvas },
    ],
  },
  {
    name: "carrying records a target's acceptance",
    state: hovering(false),
    input: answer(canvas, true),
    next: hovering(true),
    effects: [],
  },
  {
    name: "carrying records a target's refusal",
    state: hovering(true),
    input: answer(canvas, false),
    next: hovering(false),
    effects: [],
  },
  {
    name: "carrying drops on an accepting target at release",
    state: hovering(true),
    input: release(),
    next: idle,
    effects: [
      { kind: "drop", target: canvas, carried, at: far },
      { kind: "end", lifted: true },
    ],
  },
  {
    name: "carrying released over a refusing target leaves it and drops nothing",
    state: hovering(false),
    input: release(),
    next: idle,
    effects: [
      { kind: "leave", target: canvas },
      { kind: "end", lifted: true },
    ],
  },
  {
    name: "carrying released over nothing just ends",
    state: carrying,
    input: release(),
    next: idle,
    effects: [{ kind: "end", lifted: true }],
  },
  ...(
    [
      ["on Escape or blur", { kind: "cancel" }],
      ["on pointercancel", { kind: "pointercancel", pointerId: 1 }],
    ] satisfies [string, CarryInput][]
  ).map(([how, input]) => ({
    name: `carrying cancels ${how}, and the target hears leave`,
    state: hovering(true),
    input,
    next: idle,
    effects: [
      { kind: "leave", target: canvas },
      { kind: "end", lifted: true },
    ] satisfies CarryEffect[],
  })),
  ...ignores("carrying", hovering(false), [
    ...secondPointer,
    ["an answer from a target it has left", answer(sidebar, true)],
  ]),
];

describe("stepCarry", () => {
  it.each(rows)("$name", ({ state, input, next, effects }) => {
    expect(stepCarry(state, input)).toEqual([next, effects]);
  });

  it("carries a press through a lift and a refusal to a drop", () => {
    const inputs: CarryInput[] = [
      press,
      move(far, sidebar),
      answer(sidebar, false),
      move(far, canvas),
      answer(canvas, true),
      release(),
    ];
    const effects: CarryEffect["kind"][] = [];
    let state: CarryState = idle;
    for (const input of inputs) {
      const [next, out] = stepCarry(state, input);
      state = next;
      effects.push(...out.map((effect) => effect.kind));
    }
    expect(state).toEqual(idle);
    expect(effects).toEqual(["lift", "follow", "over", "follow", "leave", "over", "drop", "end"]);
  });
});
