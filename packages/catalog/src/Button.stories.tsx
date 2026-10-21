import type { Meta, StoryObj } from "@storybook/react-vite";

// A plain story over the shared .btn classes, so every state can be compared side by side.
function ButtonStates({ label, size }: { label: string; size: "default" | "small" }) {
  const className = size === "small" ? "btn btn-sm" : "btn";
  return (
    <div style={{ display: "grid", gap: 20, padding: 32, background: "var(--bg)" }}>
      {[
        ["Rest", undefined],
        ["Hover (held)", "hover"],
        ["Focus (held)", "focus"],
      ].map(([name, preview]) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span className="muted" style={{ width: 110, fontSize: 12 }}>
            {name}
          </span>
          <button className={className} data-preview={preview}>
            {label}
          </button>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <span className="muted" style={{ width: 110, fontSize: 12 }}>
          Disabled
        </span>
        <button className={className} disabled>
          {label}
        </button>
      </div>
    </div>
  );
}

const meta = {
  title: "Foundations/Button",
  component: ButtonStates,
  parameters: { layout: "fullscreen" },
  argTypes: { size: { control: "inline-radio", options: ["default", "small"] } },
} satisfies Meta<typeof ButtonStates>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The yaklabs.ai "Apply for this role" button: outline at rest, dark green on hover. */
export const Default: Story = { args: { label: "Show my work", size: "default" } };

/** Compact size used inside cards and dialogs. */
export const Small: Story = { args: { label: "Show my work", size: "small" } };
