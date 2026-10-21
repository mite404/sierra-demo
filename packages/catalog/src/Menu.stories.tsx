import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "./IconButton";
import { ExternalIcon, FilesIcon, LinkIcon, ScreenIcon, ShareIcon } from "./icons";
import { Menu } from "./Menu";

const meta = {
  title: "Foundations/Menu",
  component: Menu,
  parameters: {
    layout: "centered",
    // The audit script moves each control and expects the story to change; placement only shows
    // once the menu opens, so it is checked by opening it instead.
    controlsAudit: { onInteraction: ["placement"] },
  },
  argTypes: {
    // Placement applies when the menu opens: change it, then open the menu to see it move.
    placement: { control: "inline-radio", options: ["above-start", "below-end"] },
    // The items carry icons and handlers, and the label only names the list for a screen reader.
    items: { table: { disable: true } },
    label: { table: { disable: true } },
    trigger: { table: { disable: true } },
  },
} satisfies Meta<typeof Menu>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The compose box's attach menu: opens above the paperclip, with a shortcut hint. */
export const Attach: Story = {
  args: {
    label: "Attach",
    placement: "above-start",
    items: [
      { label: "Add images & files", icon: <FilesIcon />, shortcut: "⌘U", onSelect: () => {} },
      { label: "Take screenshot", icon: <ScreenIcon />, onSelect: () => {} },
    ],
    trigger: (props) => (
      <button {...props} className="btn btn-sm" style={{ marginTop: 120 }}>
        Attach
      </button>
    ),
  },
};

/** A card's share menu: opens below the icon, aligned to its right edge. */
export const Share: Story = {
  args: {
    label: "Share this card",
    placement: "below-end",
    items: [
      { label: "Copy public link", icon: <LinkIcon />, onSelect: () => {} },
      { label: "Open public page", icon: <ExternalIcon />, onSelect: () => {} },
    ],
    trigger: (props) => (
      <IconButton {...props} label="Share this card">
        <ShareIcon />
      </IconButton>
    ),
  },
};

/** An unavailable item stays visible, dimmed, with its reason on hover. */
export const WithDisabledItem: Story = {
  args: {
    ...Attach.args,
    items: [
      { label: "Add images & files", icon: <FilesIcon />, shortcut: "⌘U", onSelect: () => {} },
      {
        label: "Take screenshot",
        icon: <ScreenIcon />,
        disabled: true,
        hint: "This browser cannot capture the screen",
        onSelect: () => {},
      },
    ],
  },
};
