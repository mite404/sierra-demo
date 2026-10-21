import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ChatThreadPanel } from "./ChatThreadPanel";
import type { Thread, ThreadMessage } from "./thread";

// A morning of questions, long enough that the first ones scroll out of sight.
const ASKED = [
  [
    "9:02",
    "How did profit do last week across the warehouses, compared with September?",
    "Profit rose 12% on the week, led by Saturday.",
  ],
  ["9:04", "Which day had the best margin?", "Saturday: 41% margin on the highest sales."],
  ["9:07", "Show me refunds by day", "Refunds peaked on Monday at 3.1% of sales."],
  ["9:11", "Why was Monday so high?", "A late shipment was refunded in one batch on Monday."],
  ["9:15", "Compare with the week before", "Sales were up 8%, and the margin held at 38%."],
  ["9:20", "What should I restock first?", "Restock the olive oil: it sold out by Saturday noon."],
  ["9:26", "Draft a note to the team 📝", "Here is a short note on the week's margin and refunds."],
] as const;

const morning: Thread = {
  title: "Monday numbers",
  messages: ASKED.flatMap(([time, asked, answered], i): ThreadMessage[] => [
    { id: `ask-${i}`, role: "user", text: asked, time },
    { id: `answer-${i}`, role: "agent", text: answered, time },
  ]),
};

// The thread's scrolling turns and its reading tools, found from the story's canvas, once the
// pointer is over the thread: the tools follow the pointer, so the story moves it onto the turns
// first, as a reader would.
async function parts(canvasElement: HTMLElement) {
  const scroller = canvasElement.querySelector<HTMLElement>(".thread-scroll");
  const bar = canvasElement.querySelector<HTMLElement>(".reading-tools");
  if (!scroller || !bar) throw new Error("the thread or its reading tools did not render");
  await userEvent.hover(scroller);
  return { scroller, bar, tools: within(bar) };
}

// Search, once the pointer on the bookmark has unfolded the bar to show it.
async function unfold(tools: Awaited<ReturnType<typeof parts>>["tools"]) {
  await userEvent.hover(tools.getByRole("button", { name: "Your requests" }));
  return tools.findByRole("button", { name: "Search this thread" });
}

// A bar's computed opacity: 0 while it is clear, 1 once it has faded up.
const opacity = (bar: HTMLElement) => Number(getComputedStyle(bar).opacity);

// A computed colour's alpha: 1 for an opaque one. Chromium serialises a color-mix as
// `color(srgb r g b / a)` and a plain colour as `rgb(...)` or `rgba(...)`.
function alphaOf(color: string): number {
  const slash = /\/\s*([\d.]+)\s*\)$/u.exec(color);
  if (slash) return Number(slash[1]);
  const rgba = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/u.exec(color);
  return rgba ? Number(rgba[1]) : 1;
}

// Whether the turn with this id sits wholly inside the visible thread.
function wholeInView(scroller: HTMLElement, turnId: string): boolean {
  const turn = scroller.querySelector(`[data-turn-id="${turnId}"]`);
  if (!turn) throw new Error(`no turn ${turnId}`);
  const view = scroller.getBoundingClientRect();
  const box = turn.getBoundingClientRect();
  return box.top >= view.top && box.bottom <= view.bottom;
}

// Whether the jump to the request with this id glows it and frames it as a jump should
// (ADR-159): a request that was already in view (`wasInView`) stays exactly where it was, its
// glow saying where it is; one out of view lands in the middle of the visible thread, or, when
// the thread cannot scroll up that far (a turn near its start), in full view at the top. A turn
// near the end still centers: the jump adds room below the end (threadReveal.ts).
async function expectLandedOn(
  scroller: HTMLElement,
  turnId: string,
  before: { wasInView: boolean; scrollTop: number },
) {
  const turn = scroller.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
  if (!turn) throw new Error(`no turn ${turnId}`);
  await expect(turn.dataset.flash).toBe("true");
  if (before.wasInView) {
    await expect(scroller.scrollTop).toBe(before.scrollTop);
    return;
  }
  await waitFor(async () => {
    const view = scroller.getBoundingClientRect();
    const box = turn.getBoundingClientRect();
    if (scroller.scrollTop < 1) {
      await expect(box.top).toBeGreaterThanOrEqual(view.top);
      await expect(box.bottom).toBeLessThanOrEqual(view.bottom);
    } else {
      // The scroller's padding band shifts the centre a little; a jump lands well within this.
      const offCentre = box.top + box.height / 2 - (view.top + view.height / 2);
      await expect(Math.abs(offCentre)).toBeLessThan(40);
    }
  });
}

// Where a jump to the turn with this id starts from: whether the turn is in view, and the scroll.
const standBefore = (scroller: HTMLElement, turnId: string) => ({
  wasInView: wholeInView(scroller, turnId),
  scrollTop: scroller.scrollTop,
});

// Whether a search step landed on its words in the turn with this id: in a user's message they
// sit in the middle of the visible thread (or in full view near its start), anywhere else just
// in view (`framing`); selected as a drag would select them, with the ring around them alone, and
// the turn they sit in does not glow.
async function expectFoundIn(
  scroller: HTMLElement,
  turnId: string,
  words: string,
  framing: "centered" | "in view",
) {
  const turn = scroller.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
  if (!turn) throw new Error(`no turn ${turnId}`);
  const selected = [...(CSS.highlights.get("thread-search-current") ?? [])];
  await expect(selected).toHaveLength(1);
  const range = selected[0];
  if (!(range instanceof Range)) throw new Error("the selected match is not a range");
  await expect(range.toString().toLowerCase()).toBe(words);
  await expect(turn.contains(range.commonAncestorContainer)).toBe(true);
  await expect(turn.dataset.flash).toBeUndefined();
  const rings = [...scroller.querySelectorAll<HTMLElement>(".search-ring")];
  await expect(rings.length).toBeGreaterThan(0);
  const ring = rings[0].getBoundingClientRect();
  const box = range.getBoundingClientRect();
  await expect(Math.abs(ring.left - box.left)).toBeLessThan(1);
  await expect(Math.abs(ring.width - box.width)).toBeLessThan(1);
  await waitFor(async () => {
    const view = scroller.getBoundingClientRect();
    const now = range.getBoundingClientRect();
    if (framing === "in view" || scroller.scrollTop < 1) {
      await expect(now.top).toBeGreaterThanOrEqual(view.top);
      await expect(now.bottom).toBeLessThanOrEqual(view.bottom);
    } else {
      const offCentre = now.top + now.height / 2 - (view.top + view.height / 2);
      await expect(Math.abs(offCentre)).toBeLessThan(40);
    }
  });
}

const meta = {
  title: "Thread/Reading tools",
  component: ChatThreadPanel,
  parameters: { layout: "centered" },
  args: { thread: morning, width: 560 },
  argTypes: {
    thread: { table: { disable: true } },
  },
} satisfies Meta<typeof ChatThreadPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The reading tools float at the right just above the compose box, and follow the pointer: up
 * while it is over the thread's turns. At rest they are one bookmark on a translucent wash; the
 * pointer on it unfolds the bar leftward to show Search too.
 */
export const Overview: Story = {
  play: async ({ canvasElement }) => {
    await parts(canvasElement);
  },
};

/**
 * The bar rests as the bookmark alone and unfolds while the pointer is on it, then folds again.
 * The bookmark never moves: Search opens to its left.
 */
export const FoldsToTheBookmark: Story = {
  play: async ({ canvasElement }) => {
    const { tools } = await parts(canvasElement);
    const bookmark = tools.getByRole("button", { name: "Your requests" });
    await expect(tools.queryByRole("button", { name: "Search this thread" })).toBeNull();
    const before = bookmark.getBoundingClientRect().left;

    await unfold(tools);
    await expect(bookmark.getBoundingClientRect().left).toBe(before);

    await userEvent.unhover(bookmark);
    await userEvent.hover(canvasElement.ownerDocument.body);
    await waitFor(async () => {
      await expect(tools.queryByRole("button", { name: "Search this thread" })).toBeNull();
    });
  },
};

/**
 * The small bar keeps a denser translucent backing in every state, with opaque glyphs and
 * the request list's blur so the conversation does not compete with the controls.
 */
export const StaysTranslucent: Story = {
  play: async ({ canvasElement }) => {
    const { bar, tools } = await parts(canvasElement);
    const collapsedBackground = getComputedStyle(bar, "::before").backgroundColor;
    const collapsedBlur = getComputedStyle(bar, "::before").backdropFilter;
    await expect(alphaOf(getComputedStyle(bar).backgroundColor)).toBeGreaterThan(0);
    await expect(alphaOf(getComputedStyle(bar).backgroundColor)).toBeLessThan(1);
    await userEvent.click(tools.getByRole("button", { name: "Your requests" }));
    const list = within(document.body).getByRole("menu", { name: "Your requests" });
    const surface = getComputedStyle(list);
    await expect(collapsedBackground).toBe(surface.backgroundColor);
    await expect(collapsedBlur).toBe(surface.backdropFilter);
    await expect(getComputedStyle(bar, "::before").backgroundColor).toBe(surface.backgroundColor);
    const background = surface.backgroundColor;
    const blur = surface.backdropFilter;
    await expect(alphaOf(getComputedStyle(list).backgroundColor)).toBeLessThan(1);
    await waitFor(async () => {
      await expect(opacity(bar)).toBe(1);
    });
    await expect(alphaOf(getComputedStyle(bar).backgroundColor)).toBeLessThan(1);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await unfold(tools));
    await expect(tools.getByRole("searchbox", { name: "Search this thread" })).toHaveFocus();
    await expect(getComputedStyle(bar).backgroundColor).toBe(collapsedBackground);
    await expect(alphaOf(getComputedStyle(bar).backgroundColor)).toBeLessThan(1);
    await expect(getComputedStyle(bar, "::before").backgroundColor).toBe(background);
    await expect(getComputedStyle(bar, "::before").backdropFilter).toBe(blur);
  },
};

/**
 * One thread's tools at a time: across two threads, only the one the pointer is over shows its
 * bar, fading up over 300ms as the pointer arrives and back as it leaves; over the compose box
 * it stays clear, so it never sits over what the reader is typing.
 */
export const FollowsThePointer: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 24 }}>
      <ChatThreadPanel {...args} width={420} />
      <ChatThreadPanel
        {...args}
        thread={{ ...args.thread, title: "Tuesday numbers" }}
        width={420}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const panels = [...canvasElement.querySelectorAll<HTMLElement>(".thread-panel")];
    const scrollers = panels.map((panel) => panel.querySelector<HTMLElement>(".thread-scroll"));
    const bars = panels.map((panel) => panel.querySelector<HTMLElement>(".reading-tools"));
    const [firstScroller, secondScroller] = scrollers;
    const [firstBar, secondBar] = bars;
    const secondBox = panels[1]?.querySelector<HTMLElement>(".compose-box textarea");
    if (!firstScroller || !secondScroller || !firstBar || !secondBar || !secondBox)
      throw new Error("two threads did not render");
    await userEvent.hover(secondScroller);
    await waitFor(async () => {
      await expect(opacity(secondBar)).toBe(1);
      await expect(opacity(firstBar)).toBe(0);
    });
    await userEvent.hover(secondBox);
    await waitFor(async () => {
      await expect(opacity(secondBar)).toBe(0);
    });
    await userEvent.hover(firstScroller);
    await waitFor(async () => {
      await expect(opacity(firstBar)).toBe(1);
      await expect(opacity(secondBar)).toBe(0);
    });
  },
};

/**
 * The bookmark lists every request the user sent by its first 48 characters and its time; the
 * full request shows on hover. Picking one centers that turn and makes it glow, and the bar folds
 * back to the bookmark once the pointer moves on.
 */
export const JumpToARequest: Story = {
  play: async ({ canvasElement }) => {
    const { scroller, tools } = await parts(canvasElement);
    await unfold(tools);
    await userEvent.click(tools.getByRole("button", { name: "Your requests" }));
    const list = within(document.body).getByRole("menu", { name: "Your requests" });
    const items = within(list).getAllByRole("menuitem");
    await expect(items).toHaveLength(ASKED.length);
    await expect(items[1]).toHaveTextContent("Which day had the best margin?9:04 AM");
    const outOfView = standBefore(scroller, "ask-1");
    await expect(outOfView.wasInView).toBe(false);
    await userEvent.click(items[1]);
    await expectLandedOn(scroller, "ask-1", outOfView);

    // A request already in view stays where it is; only its glow says where it is.
    await userEvent.click(tools.getByRole("button", { name: "Your requests" }));
    const reopened = within(document.body).getByRole("menu", { name: "Your requests" });
    const inView = standBefore(scroller, "ask-1");
    await expect(inView.wasInView).toBe(true);
    await userEvent.click(within(reopened).getAllByRole("menuitem")[1]);
    await expectLandedOn(scroller, "ask-1", inView);

    // The list closed under the pointer, so no leave reached the bar; moving on still folds it.
    await userEvent.hover(scroller);
    await waitFor(async () => {
      await expect(tools.queryByRole("button", { name: "Search this thread" })).toBeNull();
    });
  },
};

/** An Alt-click (Option on a Mac) on the bookmark skips the list: straight to the latest. */
export const AltClickForTheLatest: Story = {
  play: async ({ canvasElement }) => {
    const { scroller, tools } = await parts(canvasElement);
    scroller.scrollTop = 0;
    // One session, so the held Alt is still down when the click lands.
    await expect(wholeInView(scroller, `ask-${ASKED.length - 1}`)).toBe(false);
    const user = userEvent.setup();
    await user.keyboard("{Alt>}");
    await user.click(tools.getByRole("button", { name: "Your requests" }));
    await user.keyboard("{/Alt}");
    await expect(within(document.body).queryByRole("menu")).toBeNull();
    await expectLandedOn(scroller, `ask-${ASKED.length - 1}`, {
      wasInView: false,
      scrollTop: 0,
    });
  },
};

/**
 * Search finds the words in any turn, as an editor's find does: every match tinted, the one
 * stepped to selected and ringed, in the middle of the thread. Enter steps to the next match and
 * Shift+Enter back, both wrapping; Escape closes the search, takes its marks away and hands the
 * focus back to its button.
 */
export const SearchTheThread: Story = {
  play: async ({ canvasElement }) => {
    const { scroller, tools } = await parts(canvasElement);
    await userEvent.click(await unfold(tools));
    const field = tools.getByRole("searchbox", { name: "Search this thread" });
    await expect(field).toHaveFocus();

    await userEvent.type(field, "margin");
    await expect(tools.getByRole("status")).toHaveTextContent("4 matches");
    await expect(CSS.highlights.get("thread-search")?.size).toBe(4);
    await userEvent.keyboard("{Enter}");
    await expect(tools.getByRole("status")).toHaveTextContent("1 of 4");
    await expectFoundIn(scroller, "ask-1", "margin", "centered");

    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await expect(tools.getByRole("status")).toHaveTextContent("4 of 4");
    await expectFoundIn(scroller, "answer-6", "margin", "in view");

    await userEvent.keyboard("{Escape}");
    await expect(tools.queryByRole("searchbox")).toBeNull();
    await expect(CSS.highlights.get("thread-search")?.size ?? 0).toBe(0);
    await expect(CSS.highlights.get("thread-search-current")?.size ?? 0).toBe(0);
    await expect(tools.getByRole("button", { name: "Search this thread" })).toHaveFocus();
  },
};

/** No turn holds the words: the count says so and the steps stay off. */
export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const { tools } = await parts(canvasElement);
    await userEvent.click(await unfold(tools));
    await userEvent.type(tools.getByRole("searchbox"), "invoices");
    await expect(tools.getByRole("status")).toHaveTextContent("No matches");
    await expect(tools.getByRole("button", { name: "Next match" })).toBeDisabled();
    await expect(tools.getByRole("button", { name: "Previous match" })).toBeDisabled();
  },
};

/**
 * A main thread stands on its pane with no title bar (ADR-138); the tools keep the same corner,
 * at the pane's edge rather than the text column's.
 */
export const OnAMainPane: Story = {
  args: { bare: true, width: undefined },
  parameters: { layout: "fullscreen" },
  play: async ({ canvasElement }) => {
    await parts(canvasElement);
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
};
