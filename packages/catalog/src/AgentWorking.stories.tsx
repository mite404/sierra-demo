import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentWorking } from "./AgentWorking";
import { InLine, Labeled, Stage } from "./motionStage";

const SPEEDS = [1500, 1800, 2000, 2200, 2500];
const VARIANTS = [
  { pattern: "wave", cells: 4 },
  { pattern: "orbit", cells: 4 },
  { pattern: "wave", cells: 6 },
  { pattern: "orbit", cells: 6 },
] as const;

const meta = {
  title: "Motion/Agent working",
  component: AgentWorking,
  parameters: { layout: "centered" },
  argTypes: {
    duration: { control: { type: "range", min: 100, max: 3000, step: 50 } },
    pattern: { control: "inline-radio", options: ["wave", "orbit"] },
    cells: { control: "inline-radio", options: [4, 6] },
    // Only a screen reader hears it; a control that changes nothing on screen reads as broken.
    label: { table: { disable: true } },
  },
  args: { duration: 2000, pattern: "wave", cells: 4 },
  decorators: [(Story) => <Stage>{Story()}</Stage>],
} satisfies Meta<typeof AgentWorking>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The glyph at its real size, looping. Scrub the duration, pattern and cells in Controls. */
export const Default: Story = {};

/** Clockwise from the top left square: a comet with a trail, no rest. */
export const Orbit: Story = { args: { pattern: "orbit" } };

/** Six squares, two columns of three, in the same 12px height, running the wave. */
export const Six: Story = { args: { cells: 6 } };

/** Six squares on the clockwise orbit: every square sits on the ring, so the lap has six stops. */
export const SixOrbit: Story = { args: { cells: 6, pattern: "orbit" } };

/** All four variants side by side at the same speed, to compare. */
export const Compare: Story = {
  // Every variant is shown at once, so only the shared duration is a live control here.
  parameters: { controls: { exclude: ["pattern", "cells"] } },
  render: (args) => (
    <>
      {VARIANTS.map(({ pattern, cells }) => (
        <Labeled key={`${pattern}-${cells}`} caption={`${pattern}, ${cells}`}>
          <AgentWorking duration={args.duration} pattern={pattern} cells={cells} />
        </Labeled>
      ))}
    </>
  ),
};

/** The same glyph at five speeds, side by side, to pick the timing by eye. */
export const Speeds: Story = {
  // Each glyph here has its own fixed length, so the duration control would do nothing; pattern
  // and cells stay live, to compare the speeds of any variant.
  parameters: { controls: { exclude: ["duration"] } },
  render: (args) => (
    <>
      {SPEEDS.map((ms) => (
        <Labeled key={ms} caption={`${ms}ms`}>
          <AgentWorking duration={ms} pattern={args.pattern} cells={args.cells} />
        </Labeled>
      ))}
    </>
  ),
};

/** In place, beside a line of text as in a thread or the sidebar; opens at the shipped default. */
export const InContext: Story = {
  render: (args) => (
    <InLine>
      <AgentWorking {...args} />
    </InLine>
  ),
};
