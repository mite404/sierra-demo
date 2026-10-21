import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentTree } from "./AgentTree";
import { AgentWorking } from "./AgentWorking";
import { InLine, Labeled, Stage } from "./motionStage";

const SPEEDS = [1500, 1800, 2000, 2200, 2500];

const meta = {
  title: "Motion/Agent tree",
  component: AgentTree,
  parameters: { layout: "centered" },
  argTypes: {
    duration: { control: { type: "range", min: 100, max: 3000, step: 50 } },
    // Only a screen reader hears it; a control that changes nothing on screen reads as broken.
    label: { table: { disable: true } },
  },
  args: { duration: 2000 },
  decorators: [(Story) => <Stage>{Story()}</Stage>],
} satisfies Meta<typeof AgentTree>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The three-pill tree at its real size, climbing. Scrub the duration in Controls. */
export const Default: Story = {};

/** The same climb at five lengths, side by side, to pick the pacing by eye. */
export const Speeds: Story = {
  // Each glyph here has its own fixed length, so the duration control would do nothing.
  parameters: { controls: { exclude: ["duration"] } },
  render: () => (
    <>
      {SPEEDS.map((ms) => (
        <Labeled key={ms} caption={`${ms}ms`}>
          <AgentTree duration={ms} />
        </Labeled>
      ))}
    </>
  ),
};

/** Beside the working wave at the same speed: one palette, one pacing, two shapes. */
export const WithWave: Story = {
  render: (args) => (
    <>
      <Labeled caption="tree">
        <AgentTree duration={args.duration} />
      </Labeled>
      <Labeled caption="wave">
        <AgentWorking duration={args.duration} />
      </Labeled>
    </>
  ),
};

/** In place, beside a line of text as in a thread or the sidebar; opens at the shipped default. */
export const InContext: Story = {
  render: (args) => (
    <InLine>
      <AgentTree {...args} />
    </InLine>
  ),
};
