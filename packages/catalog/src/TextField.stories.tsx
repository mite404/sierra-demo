import type { Meta, StoryObj } from "@storybook/react-vite";

// Every state of the shared .field class, on each surface it lives on (ADR-043).
const STATES: [string, string | undefined, string][] = [
  ["Rest", undefined, ""],
  ["Hover (held)", "hover", ""],
  ["Focus (held)", "focus", ""],
  ["Filled", undefined, "The next 4 weeks"],
];

function FieldStates({
  placeholder,
  surface,
}: {
  placeholder: string;
  surface: "paper" | "attention";
}) {
  return (
    <div
      className={surface === "attention" ? "attention-surface" : undefined}
      style={{
        display: "grid",
        gap: 20,
        padding: 32,
        background: surface === "paper" ? "var(--bg)" : undefined,
      }}
    >
      {STATES.map(([name, preview, value]) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span className="muted" style={{ width: 110, fontSize: 12 }}>
            {name}
          </span>
          <input
            className="field"
            style={{ maxWidth: 320 }}
            data-preview={preview}
            placeholder={placeholder}
            defaultValue={value}
            aria-label={name}
          />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <span className="muted" style={{ width: 110, fontSize: 12 }}>
          Disabled
        </span>
        <input
          className="field"
          style={{ maxWidth: 320 }}
          placeholder={placeholder}
          disabled
          aria-label="Disabled"
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Foundations/Text field",
  component: FieldStates,
  parameters: { layout: "fullscreen" },
  argTypes: { surface: { control: "inline-radio", options: ["paper", "attention"] } },
} satisfies Meta<typeof FieldStates>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The button's outline and 4px corners, as a place to type. */
export const OnPaper: Story = {
  args: { placeholder: "How many weeks ahead should it forecast?", surface: "paper" },
};

/** Inside the Recap and Needs you cards, the grey surfaces for what needs the user's attention. */
export const InsideRecapAndNeedsYou: Story = {
  args: { placeholder: "How many weeks ahead should it forecast?", surface: "attention" },
};
