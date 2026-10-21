import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { CatalogCard } from "./CatalogCard";
import { App } from "./App";
import { scenarios } from "./fixtures";
// A card in a thread is styled by the thread's sheet, which the app always has around it; the
// card alone does not load it, so without this the context control would change nothing.
import "./thread.css";

const meta = {
  title: "Catalog/Approved answers",
  component: CatalogCard,
  // Draggable turns the header into a handle: a grab cursor and a carry, seen by dragging it.
  parameters: { controlsAudit: { onInteraction: ["draggable"] } },
  argTypes: {
    // Where the card lives: the full page, or a thread, which hides the page-only notes.
    context: { control: "inline-radio", options: ["page", "thread"] },
    // Slots the host fills with its own controls; the catalog has nothing to put there.
    leading: { table: { disable: true } },
    trailing: { table: { disable: true } },
  },
  // The card's own defaults, said out loud so each control starts on its real value rather
  // than an empty radio or a "Set boolean" button.
  args: { context: "page", shareable: true, draggable: false },
} satisfies Meta<typeof CatalogCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const hidden = { table: { disable: true } };
// The empty and rejected states have no header, so there is no share button or drag to toggle.
const stateCard: Pick<Story, "argTypes"> = {
  argTypes: { shareable: hidden, draggable: hidden },
};
// A rejected card says the same thing whatever its payload holds, short of a valid one, so its
// payload has nothing to show either.
const rejectedCard: Pick<Story, "argTypes"> = {
  argTypes: { ...stateCard.argTypes, payload: hidden },
};

export const Trend: Story = { args: { payload: scenarios.trend.payload } };
export const Snapshot: Story = {
  args: { payload: scenarios.snapshot.payload },
};
export const Comparison: Story = {
  args: { payload: scenarios.comparison.payload },
};
export const Commits: Story = {
  args: {
    context: "thread",
    payload: {
      catalogVersion: "1",
      component: "BarChart",
      props: {
        title: "This week's commits",
        source: "Supplied commit counts",
        unit: " commits ",
        variant: "comparison",
        rows: [
          { label: "Mon", value: 3 },
          { label: "Tue", value: 7 },
          { label: "Wed", value: 2 },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("commits", { exact: true })).toBeVisible();
    await expect(canvas.queryByText("cases", { exact: true })).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("img", { name: "This week's commits. Values available in the data table." }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "View data table" }));
    await expect(canvas.getByRole("columnheader", { name: "Value (commits)" })).toBeVisible();
    await expect(canvas.getByRole("row", { name: "Mon 3" })).toBeVisible();
    await expect(canvas.getByRole("row", { name: "Tue 7" })).toBeVisible();
    await expect(canvas.getByRole("row", { name: "Wed 2" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Show chart" }));
  },
};
export const ExactValues: Story = {
  args: { payload: scenarios.table.payload },
};
export const SparseFallback: Story = {
  args: { payload: scenarios.sparse.payload },
};
export const MissingData: Story = {
  args: { payload: scenarios.missing.payload },
};
export const Empty: Story = { ...stateCard, args: { payload: scenarios.empty.payload } };
export const Unsupported: Story = {
  ...rejectedCard,
  args: { payload: scenarios.unsupported.payload },
};
export const UnsafeProps: Story = {
  ...rejectedCard,
  args: { payload: scenarios.unsafe.payload },
};
/** The Lab's component navigation renders each preview without Storybook controls. */
export const ComponentGallery: Story = {
  args: { payload: scenarios.trend.payload },
  parameters: { controls: { disable: true } },
  render: () => <App />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = within(canvas.getByRole("navigation", { name: "Component catalog" }));
    await expect(canvas.getByRole("link", { name: "Component Lab" })).toBeVisible();
    await expect(nav.queryByRole("button", { name: /Agent working/i })).toBeNull();
    for (const group of ["Foundations", "Catalog", "Motion", "Thread", "Share"]) {
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    }
    for (const component of [
      "Button",
      "Disclosure",
      "Icon Button",
      "Menu",
      "Modal",
      "Text Field",
      "Approved Answers",
      "Agent Thinking Animation",
      "Chat Thread Panel",
      "Reading Tools",
      "Public Share Page",
    ]) {
      const link = nav.getByRole("button", { name: component });
      await userEvent.click(link);
      await expect(link).toHaveAttribute("aria-current", "page");
      const preview = within(canvas.getByRole("region", { name: `${component} preview` }));
      await expect(preview.getByRole("heading", { name: component, level: 1 })).toBeVisible();
      if (component === "Disclosure") {
        await userEvent.click(preview.getByRole("button", { name: "How I got this" }));
        await expect(preview.getByText(/Read last week's orders/)).toBeVisible();
      }
      if (component === "Menu") {
        await userEvent.click(preview.getByRole("button", { name: "Open menu" }));
        await userEvent.click(preview.getByRole("menuitem", { name: "Second item" }));
        await expect(preview.getByText("Second item selected")).toBeVisible();
      }
      if (component === "Modal") {
        await userEvent.click(preview.getByRole("button", { name: "Open modal" }));
        await waitFor(() =>
          expect(preview.getByRole("dialog", { name: "Pause the thread?" })).toBeVisible(),
        );
        await userEvent.keyboard("{Escape}");
        await expect(preview.queryByRole("dialog")).toBeNull();
      }
      if (component === "Reading Tools") {
        await userEvent.unhover(link);
        const bookmark = preview.getByRole("button", { name: "Your requests" });
        await expect(bookmark).toBeVisible();
        await expect(preview.queryByRole("button", { name: "Search this thread" })).toBeNull();
        await expect(preview.queryByRole("textbox", { name: "Message" })).toBeNull();
        await userEvent.click(bookmark);
        await waitFor(() =>
          expect(preview.getByRole("menu", { name: "Your requests" })).toBeVisible(),
        );
        await userEvent.keyboard("{Escape}");
      }
      if (component === "Public Share Page") {
        await expect(preview.getByText(/Only this view is shared/)).toBeVisible();
      }
    }
    await userEvent.click(nav.getByRole("button", { name: "Button" }));
  },
};
