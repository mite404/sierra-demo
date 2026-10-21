import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "./IconButton";
import { ExternalIcon, LinkIcon, ShareIcon } from "./icons";

function Row() {
  return (
    <div style={{ display: "flex", gap: 12, padding: 16, background: "var(--paper)" }}>
      <IconButton label="Share this card">
        <ShareIcon />
      </IconButton>
      <IconButton label="Copy link">
        <LinkIcon />
      </IconButton>
      <IconButton label="Open in a new tab">
        <ExternalIcon />
      </IconButton>
      <IconButton label="Unavailable" disabled>
        <ShareIcon />
      </IconButton>
    </div>
  );
}

const meta = {
  title: "Foundations/Icon button",
  component: Row,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Row>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A 28px square, one icon, a required label that is also its tooltip. */
export const Default: Story = {};
