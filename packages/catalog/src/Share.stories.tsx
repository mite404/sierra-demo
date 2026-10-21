import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { z } from "zod";
import { encodeCard } from "./share";
import { ShareView } from "./ShareView";
import { profitCard, threads } from "./thread";
import { sealThread } from "./threadShare";
import { scenarios } from "./fixtures";

const meta = {
  title: "Share/Public page",
  component: ShareView,
  parameters: { layout: "fullscreen" },
  // The link is an encoded card or a thread key read once as the page opens, and the loader is
  // a stand-in for the network: each story is a different link, not a knob.
  argTypes: { hash: { table: { disable: true } }, loadThread: { table: { disable: true } } },
} satisfies Meta<typeof ShareView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** What a share link opens: the card comes from this page's own link (ADR-064). */
export const FromLink: Story = {};

/** An interactive card shared on its own; its slider still works. */
export const InteractiveCard: Story = {
  args: { hash: "#" + encodeCard({ v: 1, kind: "interactive", payload: profitCard }) },
};

/** A static catalog card shared on its own. */
export const CatalogCard: Story = {
  args: { hash: "#" + encodeCard({ v: 1, kind: "catalog", payload: scenarios.trend.payload }) },
};

/** A garbled or edited link: an honest notice, never a broken view. */
export const BrokenLink: Story = { args: { hash: "#c=garbled" } };

// A thread shared until well past any run of the stories, sealed as the app seals it.
const sharedThread = sealThread({
  v: 1,
  title: threads.profit.title,
  messages: threads.profit.messages,
  expiresAt: "2099-01-01T09:00:00.000Z",
});

/** A thread made public for a while (ADR-131): read-only, its end said beneath it. */
export const SharedThread: Story = {
  loaders: [() => sharedThread],
  render: (_, { loaded }) => {
    const { sealed, key } = z
      .object({ sealed: z.instanceof(Uint8Array), key: z.string() })
      .parse(loaded);
    return (
      <ShareView
        hash={`#t=story-share-0001.${key}`}
        loadThread={() => Promise.resolve(new Uint8Array(sealed))}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole("heading", { name: threads.profit.title })).toBeVisible();
    await expect(
      page.getByText(
        /Shared from Kay until \w+ \d+ \w+ at \d+:\d{2}; after that this link stops working/,
      ),
    ).toBeVisible();
    await expect(page.queryByRole("button", { name: "Share this card" })).toBeNull();
    await expect(page.queryByRole("textbox")).toBeNull();
  },
};

/** A shared thread whose time ran out or that was taken down: an honest notice. */
export const EndedThread: Story = {
  args: {
    hash: "#t=story-share-0002.key",
    loadThread: () => Promise.reject(new Error("The share has ended")),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText("This shared thread has ended.")).toBeVisible();
  },
};
