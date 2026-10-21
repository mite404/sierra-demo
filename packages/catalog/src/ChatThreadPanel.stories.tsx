import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { Agent } from "./agent";
import type { ReplyChunk } from "./reply";
import { useCarryTarget } from "./carry";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { scenarios, trend } from "./fixtures";
import { threads } from "./thread";

// A fixed clock keeps idle-time stories deterministic.
const NOW = Date.UTC(2026, 8, 25, 9, 16);
const MINUTE = 60_000;

const meta = {
  title: "Thread/Chat thread panel",
  component: ChatThreadPanel,
  // cardsCarry turns each card's header into a handle: a grab cursor and a carry, seen by
  // dragging a card, so the controls audit leaves it to a hand check.
  parameters: { layout: "centered", controlsAudit: { onInteraction: ["cardsCarry"] } },
  argTypes: {
    // The three a viewer can turn and see: the column's width, whether it draws its own frame,
    // and whether a card's header can carry it out onto a canvas.
    width: {
      control: { type: "range", min: 320, max: 900, step: 10 },
      description: "Panel width in px. Unset is the standard column: 80 characters plus gutters.",
    },
    // Each story picks its thread, its agent and its clock; as controls they are raw data, a
    // test clock, or slots the host fills, and the draft is read once as the thread opens.
    thread: { table: { disable: true } },
    activity: { table: { disable: true } },
    now: { table: { disable: true } },
    dictation: { table: { disable: true } },
    agent: { table: { disable: true } },
    initialDraft: { table: { disable: true } },
    empty: { table: { disable: true } },
    headerActions: { table: { disable: true } },
    hostAsk: { table: { disable: true } },
    leading: { table: { disable: true } },
    // A callback: the Actions tab logs each rename, so it has no control of its own.
    onRename: { table: { disable: true } },
    // A host's slot and a host's handle: nothing a viewer can turn.
    footnote: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  // The panel's own defaults, said out loud: an unset cardsCarry is on, so the checkbox starts
  // ticked and the first click turns carrying off instead of setting what was already true.
  args: { cardsCarry: true, bare: false },
} satisfies Meta<typeof ChatThreadPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 80 characters of text plus 20px gutters: the standard thread column. */
export const Standard: Story = { args: { thread: threads.trend } };

/** A narrow thread beside an open split pane: cards switch to compact density. */
export const NextToSplitPane: Story = {
  args: { thread: threads.trend, width: 420 },
};

/**
 * A thread on the canvas can be renamed in place (ADR-089): the title opens as a field on a
 * click, Enter keeps the new name, Escape keeps the old one.
 */
export const Renamable: Story = {
  args: { thread: threads.trend, width: 420, onRename: fn() },
  play: async ({ args, canvasElement }) => {
    const header = canvasElement.querySelector<HTMLElement>(".thread-header");
    if (!header) throw new Error("the thread did not render");
    await userEvent.click(within(header).getByRole("button", { name: args.thread.title }));
    const field = within(header).getByRole("textbox", { name: "Thread title" });
    await userEvent.clear(field);
    await userEvent.type(field, "Weekend margins{Enter}");
    await expect(args.onRename).toHaveBeenCalledWith("Weekend margins");
    await expect(within(header).getByRole("button", { name: args.thread.title })).toBeVisible();

    await userEvent.click(within(header).getByRole("button", { name: args.thread.title }));
    await userEvent.type(within(header).getByRole("textbox"), " scrapped{Escape}");
    await expect(args.onRename).toHaveBeenCalledTimes(1);
    await expect(within(header).getByRole("button", { name: args.thread.title })).toBeVisible();
  },
};

// A mouse event at a point, the way the browser would send it.
function pointer(type: string, x: number, y: number, buttons = 0): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  });
}

function middleOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// A stand-in for the compose canvas, pinned where the pointer can reach it at any viewport
// size: it takes whatever is carried to it and lists what it heard, once per change.
function CarryTarget() {
  const ref = useRef<HTMLElement>(null);
  // Each line keeps its place in the log, which only grows, as its key.
  const [heard, setHeard] = useState<{ n: number; line: string }[]>([]);
  const [landed, setLanded] = useState<string>();
  const hear = (line: string) => {
    setHeard((log) => (log.at(-1)?.line === line ? log : [...log, { n: log.length, line }]));
  };
  useCarryTarget(ref, {
    over: (carried) => {
      hear(`over ${carried.kind}`);
      return true;
    },
    leave: () => {
      hear("leave");
    },
    drop: (carried) => {
      hear(`drop ${carried.kind}`);
      setLanded(JSON.stringify(carried));
    },
  });
  return (
    <section
      ref={ref}
      aria-label="Carry target"
      data-landed={landed}
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 10,
        width: 200,
        padding: 8,
        border: "1px dashed var(--soft-ink)",
        background: "var(--paper)",
        color: "var(--ink)",
        fontSize: 12,
      }}
    >
      <p style={{ margin: 0 }}>Drop a card or a highlight here</p>
      <ol aria-label="Heard" style={{ margin: 0, paddingLeft: 18 }}>
        {heard.map(({ n, line }) => (
          <li key={n}>{line}</li>
        ))}
      </ol>
    </section>
  );
}

function heardBy(target: HTMLElement): string[] {
  return within(target)
    .queryAllByRole("listitem")
    .map((item) => item.textContent);
}

// The first card's header, the card itself, and the target, once the thread has rendered.
function carryScene(canvasElement: HTMLElement) {
  const handle = canvasElement.querySelector<HTMLElement>(".card-heading[data-carry]");
  const card = handle?.closest(".card");
  if (!handle || !(card instanceof HTMLElement)) throw new Error("no card to carry");
  const target = within(canvasElement).getByRole("region", { name: "Carry target" });
  const box = handle.getBoundingClientRect();
  return { handle, card, target, start: { x: box.left + 20, y: box.top + 20 } };
}

const withCarryTarget: Story["render"] = (args) => (
  <>
    <ChatThreadPanel {...args} />
    <CarryTarget />
  </>
);

/**
 * A card carried by its header rides the pointer whole (ADR-089): past the lift the closed hand
 * holds everywhere, the card left behind dims, and the release hands the target the same
 * envelope a share link holds.
 */
export const CardCarry: Story = {
  args: { thread: threads.trend },
  render: withCarryTarget,
  play: async ({ canvasElement }) => {
    const { handle, card, target, start } = carryScene(canvasElement);
    const html = document.documentElement;
    const drop = middleOf(target);

    const down = pointer("pointerdown", start.x, start.y, 1);
    handle.dispatchEvent(down);
    await expect(down.defaultPrevented).toBe(true);
    handle.dispatchEvent(pointer("pointermove", start.x + 3, start.y, 1));
    await expect(html).not.toHaveAttribute("data-carrying");

    target.dispatchEvent(pointer("pointermove", drop.x, drop.y, 1));
    await expect(html).toHaveAttribute("data-carrying", "card");
    await expect(getComputedStyle(target).cursor).toBe("grabbing");
    await expect(card).toHaveAttribute("data-lifted");
    await expect(getComputedStyle(card).opacity).toBe("0.35");
    const ghost = document.querySelector<HTMLElement>(".carry-ghost");
    if (!ghost) throw new Error("nothing rides the pointer");
    await expect(getComputedStyle(ghost).opacity).toBe("0.85");
    await expect(getComputedStyle(ghost).pointerEvents).toBe("none");
    const field = within(canvasElement).getByRole("textbox", { name: "Message" });
    field.focus();
    field.blur();
    await expect(html).toHaveAttribute("data-carrying", "card");

    target.dispatchEvent(pointer("pointerup", drop.x, drop.y));
    await expect(html).not.toHaveAttribute("data-carrying");
    await expect(card).not.toHaveAttribute("data-lifted");
    await expect(getComputedStyle(card).opacity).toBe("1");
    await expect(ghost).not.toBeInTheDocument();
    await waitFor(() => expect(heardBy(target)).toEqual(["over card", "drop card"]));
    await expect(JSON.parse(target.dataset.landed ?? "null")).toEqual({
      kind: "card",
      card: { v: 1, kind: "catalog", payload: scenarios.trend.payload },
      title: within(handle).getByRole("heading").textContent,
    });
  },
};

/** Escape puts a carried card back: the target hears it leave, and the release drops nothing. */
export const CardCarryCancels: Story = {
  args: { thread: threads.trend },
  render: withCarryTarget,
  play: async ({ canvasElement }) => {
    const { handle, card, target, start } = carryScene(canvasElement);
    const drop = middleOf(target);

    handle.dispatchEvent(pointer("pointerdown", start.x, start.y, 1));
    target.dispatchEvent(pointer("pointermove", drop.x, drop.y, 1));
    await expect(card).toHaveAttribute("data-lifted");
    await userEvent.keyboard("{Escape}");
    await expect(document.documentElement).not.toHaveAttribute("data-carrying");
    await expect(card).not.toHaveAttribute("data-lifted");

    target.dispatchEvent(pointer("pointerup", drop.x, drop.y));
    await waitFor(() => expect(heardBy(target)).toEqual(["over card", "leave"]));
    await expect(target).not.toHaveAttribute("data-landed");
  },
};

// What the thread's styles decide for how an element looks, all but the dimming of the card
// left behind.
function looks(element: Element): string {
  const style = getComputedStyle(element);
  return [
    style.fontFamily,
    style.fontSize,
    style.lineHeight,
    style.color,
    style.backgroundColor,
    style.margin,
    style.transform,
  ].join(" / ");
}

/**
 * The card that rides the pointer is the card as the thread shows it: the same type, spacing,
 * colours and height, though it is drawn outside the thread, and it holds still.
 */
export const CardCarryPicture: Story = {
  args: { thread: threads.profit },
  render: withCarryTarget,
  play: async ({ canvasElement }) => {
    const { handle, card, start } = carryScene(canvasElement);
    await Promise.all(card.getAnimations({ subtree: true }).map(async (played) => played.finished));
    handle.dispatchEvent(pointer("pointerdown", start.x, start.y, 1));
    handle.dispatchEvent(pointer("pointermove", start.x + 20, start.y + 20, 1));
    const picture = document.querySelector(".carry-ghost .card");
    if (!picture) throw new Error("nothing rides the pointer");

    await expect([picture, ...picture.querySelectorAll("*")].map(looks)).toEqual(
      [card, ...card.querySelectorAll("*")].map(looks),
    );
    await expect(picture.getBoundingClientRect().height).toBe(card.getBoundingClientRect().height);
    handle.dispatchEvent(pointer("pointerup", start.x + 20, start.y + 20));
  },
};

/** Fallbacks and catalog limits must stay honest at thread size too. */
export const Fallbacks: Story = { args: { thread: threads.fallbacks } };

export const FallbacksNarrow: Story = {
  args: { thread: threads.fallbacks, width: 420 },
};

/** Active thread, 12 minutes since the user's last message: the recap appears. */
export const RecapAfterIdle: Story = {
  args: {
    thread: threads.trend,
    now: NOW,
    activity: { active: true, lastUserInputAt: NOW - 12 * MINUTE },
  },
};

/** The agent is blocked on a question (ADR-039): numbered choices above the compose box.
 *  Pick the branch, type an answer in the card, or chat about something else. */
export const AwaitingInput: Story = { args: { thread: threads.awaiting } };

export const AwaitingInputNarrow: Story = {
  args: { thread: threads.awaiting, width: 420 },
};

/** A malformed question never becomes a card (ADR-040): the error goes back to the agent,
 *  which streams a plain ask instead. Here the way out was written into the one-line
 *  typed-answer row, where it would not fit. */
export const AwaitingInputMalformed: Story = { args: { thread: threads.malformed } };

/** Only 4 minutes idle: no recap yet. */
export const RecentlyActive: Story = {
  args: {
    thread: threads.trend,
    now: NOW,
    activity: { active: true, lastUserInputAt: NOW - 4 * MINUTE },
  },
};

/** Idle but finished: an inactive thread has nothing new to recap. */
export const InactiveThread: Story = {
  args: {
    thread: threads.trend,
    now: NOW,
    activity: { active: false, lastUserInputAt: NOW - 40 * MINUTE },
  },
};

/** Dictation takes over the thread: a large center-playhead waveform, typing paused. */
export const Dictation: Story = {
  args: { thread: threads.trend, dictation: { open: true } },
};

/** An open microphone picker takes Escape first; the next Escape cancels dictation itself. */
export const DictationPickerEscapes: Story = {
  args: { thread: threads.trend, dictation: { open: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /System Default/ }));
    // The dialog rises in from opacity 0, and on that first frame nothing inside it counts as
    // visible; wait it out rather than assert once.
    await waitFor(async () => {
      await expect(canvas.getByRole("listbox", { name: "Choose microphone" })).toBeVisible();
    });
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("listbox", { name: "Choose microphone" })).toBeNull();
    await waitFor(async () => {
      await expect(canvas.getByRole("dialog")).toBeVisible();
    });
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("dialog")).toBeNull();
  },
};

export const DictationNarrow: Story = {
  args: { thread: threads.trend, dictation: { open: true }, width: 420 },
};

/** Uses your real microphone; the browser asks for permission first. */
export const DictationLiveMicrophone: Story = {
  args: { thread: threads.trend, dictation: { open: true, source: "microphone" } },
};

/** Interactive card (ADR-029): a stepped slider walks gross to net profit; the chart and
 *  the agent's sentence update instantly, and the choice rides along with the next message. */
export const InteractiveProfit: Story = { args: { thread: threads.profit } };

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

// The thread lands on its latest turn as it mounts and stays pinned there as its fonts load, and
// any scroll closes an open menu (Menu), so a menu opened before those scrolls arrive would close
// by itself: wait for the fonts, then for frames with no scroll in them.
async function scrollsSettled(): Promise<void> {
  await document.fonts.ready;
  let scrolled = true;
  const note = () => {
    scrolled = true;
  };
  window.addEventListener("scroll", note, true);
  while (scrolled) {
    scrolled = false;
    await nextFrame();
    await nextFrame();
  }
  window.removeEventListener("scroll", note, true);
}

/**
 * A press on a card's header closes its open share menu, as a press anywhere else does: the
 * header claims the press for a carry without hiding it from the page.
 */
export const ShareMenuClosesOnHeaderPress: Story = {
  args: { thread: threads.profit },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [share] = canvas.getAllByRole("button", { name: "Share this card" });
    const header = share?.closest("header");
    if (!share || !header) throw new Error("no card to share");
    await scrollsSettled();
    await userEvent.click(share);
    const menu = canvas.getByRole("menu", { name: "Share this card" });
    await waitFor(() => expect(menu).toBeVisible());

    await userEvent.click(within(header).getByRole("heading"));
    await expect(canvas.queryByRole("menu")).toBeNull();
    await expect(document.documentElement).not.toHaveAttribute("data-carrying");
  },
};

export const InteractiveProfitNarrow: Story = {
  args: { thread: threads.profit, width: 420 },
};

// An agent whose reply breaks off before a word arrives: a refused gateway, a dropped line.
const brokenAgent: Agent = {
  respond(): AsyncIterable<string> {
    throw new Error("The gateway replied 401");
  },
};

/**
 * A reply that fails before a word ends the turn in plain words instead of a bubble that streams
 * forever: it could not start, the request is still there, and Try again asks for it again.
 */
export const ReplyFails: Story = {
  args: { thread: threads.trend, agent: brokenAgent },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "And next week?{Enter}");
    await expect(await canvas.findByText("Could not start")).toBeVisible();
    await expect(
      canvas.getByText(
        "I couldn't finish that reply. Your request is still here; try again when you're ready.",
      ),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeVisible();
    await waitFor(async () => {
      await expect(canvas.queryByRole("article", { busy: true })).toBeNull();
    });
  },
};

// An agent whose iterator never yields: the wait stays on screen instead of ending on its own,
// so the indicator can be seen rather than caught mid-blink. It ends only if the panel unmounts.
const thinkingAgent: Agent = {
  respond(_event, signal) {
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise<IteratorResult<string>>((resolve) => {
              signal.addEventListener(
                "abort",
                () => {
                  resolve({ value: "", done: true });
                },
                {
                  once: true,
                },
              );
            }),
        };
      },
    };
  },
};

/** A reply's iterator running with nothing to show yet (ADR-041): the working glyph and a quiet,
 *  factual line - never a guessed tool name, since the real runtime has no tool events. */
export const ReplyThinking: Story = {
  args: { thread: threads.trend, agent: thinkingAgent },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "And next week?{Enter}");
    await expect(await canvas.findByText("Thinking…")).toBeVisible();
  },
};

// Approach snapshots arrive before answer prose, as in the Live Playground.
const thinkingStream: ReplyChunk[] = [
  { kind: "thinking", text: "They want next week's cases." },
  {
    kind: "thinking",
    text: "They want next week's cases. I plan to account for the rising trend.",
  },
  {
    kind: "thinking",
    text: "They want next week's cases. I plan to use the rising trend, with a caveat that it may not hold.",
  },
  "Next week should land a little above this one, ",
  { kind: "text", text: "if the rise holds." },
];

/** Approach summaries (ADR-167) stay folded and settle to plain "Thinking" once words arrive. */
export const ReplyStreamsThinking: Story = {
  args: { thread: threads.trend, agent: scriptedAgent(thinkingStream, 600) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "And next week?{Enter}");
    const toggle = await canvas.findByRole("button", { name: "Thinking" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(await canvas.findByText(/They want next week's cases\./)).toBeVisible();
  },
};

/** Summaries from a later model round stay below the answer already being read. */
export const ReplyThinksAfterWords: Story = {
  args: {
    thread: threads.trend,
    agent: scriptedAgent(
      [
        "Tuesday leads with seven commits.",
        { kind: "thinking", text: "Check the supplied totals." },
        {
          kind: "thinking",
          text: "Check the supplied totals. I plan to compare Tuesday's seven with Monday's three and Wednesday's two.",
        },
      ],
      600,
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "Which day?{Enter}");
    const answer = await canvas.findByText("Tuesday leads with seven commits.");
    const toggle = await canvas.findByRole("button", { name: "Thinking" });
    await expect(
      answer.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    await userEvent.click(toggle);
    await expect(await canvas.findByText(/Check the supplied totals\./)).toBeVisible();
  },
};

// Highlights the first agent paragraph and rests the pointer on it until the thread shows the
// open hand.
async function readyHighlight(canvasElement: HTMLElement) {
  const scroller = canvasElement.querySelector<HTMLElement>(".thread-scroll");
  const paragraph = canvasElement.querySelector<HTMLElement>(".turn-agent p");
  if (!scroller || !paragraph) throw new Error("the thread did not render");
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  const box = range.getBoundingClientRect();
  // On the first line's text: quiet prose's 510px measure can wrap the paragraph, and the middle
  // of the whole highlight would then fall between two lines.
  const line = range.getClientRects().item(0) ?? box;
  const [x, y] = [line.left + 12, line.top + line.height / 2];

  // The thread starts watching the pointer in an effect, so the first move is repeated
  // until it is heard; a plain throw keeps the retries out of the console.
  await waitFor(() => {
    paragraph.dispatchEvent(pointer("pointermove", x, y));
    if (scroller.dataset.grab !== "ready") throw new Error("the thread is not listening yet");
  });
  return { scroller, paragraph, range, box, x, y };
}

function highlighted(): string | undefined {
  return document.getSelection()?.toString();
}

/**
 * A highlight is something to pick up: an open hand over it, a closed one while it is held, and
 * the I-beam for as long as the highlight is still being made.
 */
export const HighlightGrab: Story = {
  args: { thread: threads.trend },
  play: async ({ canvasElement }) => {
    const { scroller, paragraph, range, box, x, y } = await readyHighlight(canvasElement);
    await expect(scroller).toHaveAttribute("data-grab", "ready");
    await expect(getComputedStyle(scroller).cursor).toBe("grab");

    paragraph.dispatchEvent(pointer("pointerdown", x, y, 1));
    await expect(scroller).toHaveAttribute("data-grab", "held");
    await expect(getComputedStyle(scroller).cursor).toBe("grabbing");

    document.dispatchEvent(pointer("pointerup", x, y));
    await expect(scroller).toHaveAttribute("data-grab", "ready");

    paragraph.dispatchEvent(pointer("pointermove", box.left - 40, y));
    await expect(scroller).not.toHaveAttribute("data-grab");
    await expect(getComputedStyle(scroller).cursor).not.toBe("grab");

    // The browser grows a selection under a held button and reports it on selectionchange;
    // the same events by hand, with the button down throughout.
    document.getSelection()?.removeAllRanges();
    paragraph.dispatchEvent(pointer("pointerdown", x, y, 1));
    document.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    paragraph.dispatchEvent(pointer("pointermove", x + 24, y, 1));
    await expect(scroller).not.toHaveAttribute("data-grab");
    await expect(getComputedStyle(scroller).cursor).not.toBe("grab");
    document.dispatchEvent(pointer("pointerup", x + 24, y));
    await expect(scroller).toHaveAttribute("data-grab", "ready");
  },
};

/**
 * A highlight carries its text (ADR-089): a quote chip rides the pointer, the highlight stays
 * where it was, and the target gets the words. A click on the highlight, with no carry, clears
 * it as it always has, and the browser's own drag never starts inside the thread.
 */
export const HighlightCarry: Story = {
  args: { thread: threads.trend },
  render: withCarryTarget,
  play: async ({ canvasElement }) => {
    const { paragraph, x, y } = await readyHighlight(canvasElement);
    const target = within(canvasElement).getByRole("region", { name: "Carry target" });
    const drop = middleOf(target);
    const words = paragraph.textContent;

    const down = pointer("pointerdown", x, y, 1);
    paragraph.dispatchEvent(down);
    await expect(down.defaultPrevented).toBe(true);
    target.dispatchEvent(pointer("pointermove", drop.x, drop.y, 1));
    await expect(document.documentElement).toHaveAttribute("data-carrying", "text");
    await expect(document.querySelector(".carry-ghost .carry-quote")).toHaveTextContent(
      `“${words}”`,
    );
    await expect(highlighted()).toBe(words);

    target.dispatchEvent(pointer("pointerup", drop.x, drop.y));
    await expect(document.documentElement).not.toHaveAttribute("data-carrying");
    await expect(document.querySelector(".carry-ghost")).toBeNull();
    await waitFor(() => expect(heardBy(target)).toEqual(["over text", "drop text"]));
    await expect(JSON.parse(target.dataset.landed ?? "null")).toEqual({
      kind: "text",
      text: words,
    });
    await expect(highlighted()).toBe(words);

    paragraph.dispatchEvent(pointer("pointermove", x, y));
    paragraph.dispatchEvent(pointer("pointerdown", x, y, 1));
    paragraph.dispatchEvent(pointer("pointerup", x, y));
    paragraph.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: x, clientY: y, detail: 1 }),
    );
    await expect(highlighted()).toBe("");
    await expect(heardBy(target)).toEqual(["over text", "drop text"]);

    const drag = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    paragraph.dispatchEvent(drag);
    await expect(drag.defaultPrevented).toBe(true);
  },
};

// Resolves after `ms`, or at once when the reply is stopped.
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}

// A stand-in agent that streams `chunks` one every `paceMs`, and stops when told to.
function scriptedAgent(chunks: ReplyChunk[], paceMs: number): Agent {
  return {
    async *respond(_event, signal) {
      for (const chunk of chunks) {
        // oxlint-disable-next-line no-await-in-loop -- a stream waits between its chunks
        await pause(paceMs, signal);
        if (signal.aborted) return;
        yield chunk;
      }
    },
  };
}

// The weekly brief as it streams: narration first, the checks as steps, the finding in words
// with its emphasis, a card between paragraphs, and the logs behind it all.
const briefStream: ReplyChunk[] = [
  { kind: "activity", text: "Reading this week's cases." },
  { kind: "step", step: { id: "workload", label: "Weekly workload", status: "running" } },
  { kind: "log", text: "fixture:workload rows=7 source=demo-service-desk" },
  { kind: "activity", text: "Checking the workload by day." },
  {
    kind: "step",
    step: {
      id: "workload",
      label: "Weekly workload",
      status: "done",
      outcome: "Closed cases by day, Sep 14–20: the peak was Saturday at 62.",
      evidence: scenarios.table.payload,
      threadId: "workload-check",
    },
  },
  { kind: "activity", text: "Writing the brief." },
  "Closed cases rose from 24 on Monday to ",
  { kind: "text", text: "a peak of 62", mark: "strong" },
  { kind: "text", text: " on Saturday", mark: "strong" },
  { kind: "text", text: ", then eased on Sunday." },
  { kind: "card", payload: scenarios.trend.payload },
  { kind: "text", text: "The weekend carried the week. " },
  { kind: "text", text: "Success ran a person short from Wednesday.", mark: "em" },
  { kind: "block", block: "heading" },
  { kind: "text", text: "What needs you" },
  { kind: "block", block: "item" },
  { kind: "text", text: "Approve weekend cover", mark: "strong" },
  { kind: "text", text: " for Success before Friday." },
  { kind: "log", text: "check:weekly-workload status=done peak=Sat:62" },
];

// The thread's scrolling turns, once rendered.
function scrollerIn(canvasElement: HTMLElement): HTMLElement {
  const scroller = canvasElement.querySelector<HTMLElement>(".thread-scroll");
  if (!scroller) throw new Error("the thread did not render");
  return scroller;
}

/**
 * A structured reply (ADR-139, ADR-140): findings in semibold, an aside in real italics, a card
 * between paragraphs, a heading and a list, and its work folded above them, labelled finished.
 */
export const Structured: Story = {
  args: { thread: threads.brief },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("a peak of 62 on Saturday").tagName).toBe("STRONG");
    await expect(canvas.getByRole("heading", { name: "What needs you" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: /Work finished/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  },
};

/** The same reply beside an open split pane: prose keeps its measure, cards go compact. */
export const NarrowStructured: Story = { args: { thread: threads.brief, width: 420 } };

/**
 * A reply streaming in: narration while nothing is said, steps as they run and finish, then the
 * words, set as they will stay, with a card between paragraphs. While it streams the compose box
 * offers Stop beside Send, and sending stays open.
 */
export const Streaming: Story = {
  args: { thread: threads.trend, agent: scriptedAgent(briefStream, 250) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "Give me the weekly brief{Enter}",
    );
    await expect(await canvas.findByRole("button", { name: "Stop" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Send" })).toBeInTheDocument();
    await expect(await canvas.findByText("Reading this week's cases.")).toBeVisible();
    await waitFor(
      async () => {
        await expect(canvas.queryByRole("article", { busy: true })).toBeNull();
      },
      { timeout: 10_000 },
    );
    await expect(canvas.getByText("a peak of 62 on Saturday").tagName).toBe("STRONG");
    await expect(canvas.getByRole("button", { name: /Work finished/ })).toHaveTextContent(
      "1 check",
    );
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
  },
};

// The team comparison twice under one id: a draft while its check runs, then the settled card.
const settledTeams = {
  ...trend,
  component: "BarChart",
  props: {
    ...trend.props,
    title: "Cases by team",
    variant: "comparison",
    rows: [
      { label: "Support", value: 84 },
      { label: "Success", value: 56 },
      { label: "Operations", value: 71 },
    ],
  },
};
const draftTeams = {
  ...settledTeams,
  props: {
    ...settledTeams.props,
    title: "Cases by team (draft)",
    rows: settledTeams.props.rows.slice(0, 2),
  },
};
const replacedStream: ReplyChunk[] = [
  { kind: "step", step: { id: "teams", label: "Cases by team", status: "running" } },
  "Here is each team's count so far.",
  { kind: "card", payload: draftTeams, id: "teams" },
  { kind: "text", text: "Support leads either way." },
  { kind: "step", step: { id: "teams", label: "Cases by team", status: "done" } },
  { kind: "card", payload: settledTeams, id: "teams" },
];

/**
 * A card sent again under its id (ADR-147, widened): the draft chart shown while its check runs
 * becomes the settled one in the same place, the same card on screen, not a second one below.
 */
export const CardReplaced: Story = {
  args: { thread: threads.trend, agent: scriptedAgent(replacedStream, 300) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "Compare teams{Enter}");
    const draft = await canvas.findByRole("heading", { name: "Cases by team (draft)" });
    const shown = draft.closest("section"); // → the card on screen
    const settled = await canvas.findByRole("heading", { name: "Cases by team" });
    await expect(settled.closest("section")).toBe(shown);
    await expect(canvas.queryByRole("heading", { name: "Cases by team (draft)" })).toBeNull();
    await expect(canvas.getByText("Support leads either way.")).toBeVisible();
  },
};

/**
 * What a reply could not do, said in its words (ADR-147, widened): the sentence in the prose's
 * voice, the request it offers quoted, and a button that sends it as the next message in one
 * click. The button waits while a reply streams, and what the user was writing stays put.
 */
export const Limitation: Story = {
  args: {
    thread: threads.limited,
    agent: scriptedAgent(["Here it is as bars. ", "Thursday stands out."], 400),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("The catalog has no pie chart, so I didn't draw one."),
    ).toBeVisible();
    const box = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(box, "Half a thought");
    const recover = canvas.getByRole("button", { name: "Show it as a bar chart" });
    await expect(recover).toHaveAccessibleDescription(/Show first response times as a bar chart/);
    await userEvent.click(recover);
    await waitFor(async () => {
      await expect(canvas.getAllByRole("article", { name: "You" })).toHaveLength(2);
    });
    await expect(canvas.getAllByRole("article", { name: "You" })[1]).toHaveTextContent(
      "Show first response times as a bar chart",
    );
    await expect(recover).toBeDisabled();
    await expect(await canvas.findByText(/Thursday stands out\./)).toBeVisible();
    await waitFor(async () => {
      await expect(recover).toBeEnabled();
    });
    await expect(box).toHaveValue("Half a thought");
  },
};

/**
 * A reply cut off partway keeps its words, says it is incomplete and why, and offers Try again.
 * Trying again asks for the same request as a new reply below; the cut-off one keeps its label.
 */
export const Interrupted: Story = {
  args: {
    thread: threads.interrupted,
    agent: scriptedAgent(["North closed 84 cases, Central 71 and South 63."], 50),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Interrupted · Incomplete answer")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(
      await canvas.findByText("North closed 84 cases, Central 71 and South 63."),
    ).toBeVisible();
    await expect(canvas.getByText("Interrupted · Incomplete answer")).toBeVisible();
    await expect(canvas.getAllByRole("article", { name: /^You/ })).toHaveLength(1);
    await expect(canvas.getAllByRole("article", { name: /^Agent/ })).toHaveLength(2);
  },
};

/** A reply the user stopped: what finished stays, it says who stopped it, and no Try again. */
export const Cancelled: Story = {
  args: { thread: threads.cancelled },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Stopped by you")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Try again" })).toBeNull();
  },
};

/**
 * A reply that could not start where asking again cannot help, such as a missing sign-in: it
 * says why, and offers no Try again that would only fail the same way.
 */
export const RetryWithheld: Story = {
  args: { thread: threads["no-retry"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Could not start")).toBeVisible();
    await expect(canvas.getByText(/answers signed-in users only/)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Try again" })).toBeNull();
  },
};

/**
 * The POC's model budget spent mid-visit (ADR-164): it says the budget is spent and the 3
 * scripted Demos still play, and offers no Try again that would only fail the same way.
 */
export const CreditRanOut: Story = {
  args: { thread: threads.credit },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Could not start")).toBeVisible();
    await expect(canvas.getByText(/3 scripted Demos still play/)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Try again" })).toBeNull();
  },
};

/** Answers to the agent's questions (ADR-039): one surface, each question over its answer. */
export const AnsweredQuestions: Story = {
  args: { thread: threads.answered },
  play: async ({ canvasElement }) => {
    const answers = within(within(canvasElement).getByRole("article", { name: "Your answers" }));
    await expect(answers.getAllByRole("term")).toHaveLength(2);
    await expect(answers.getByText("Four weeks")).toBeVisible();
  },
};

/**
 * Work details open: each step's state in a word, its outcome, the lines that say how it was
 * found, and its evidence, a branch marking the one that ran as a child thread. Technical details
 * stay folded until asked for.
 */
export const WorkDetailsOpen: Story = {
  args: { thread: threads.brief },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Work finished/ }));
    await expect(canvas.getByText("Weekly workload")).toBeVisible();
    await expect(canvas.getByText("Child thread:")).toBeInTheDocument();
    const [workload] = canvas.getAllByRole("list", { name: "How this was found" });
    await expect(within(workload).getAllByRole("listitem")).toHaveLength(2);
    await expect(workload).toHaveTextContent("Took the busiest day's count as the peak");
    const technical = canvas.getByRole("button", { name: "Technical details" });
    await expect(technical).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(technical);
    const logs = canvas.getByText(/check:weekly-workload status=done/);
    await expect(logs).toBeVisible();
    await expect(canvas.getByText("Checking the workload by day.")).toBeVisible();
    // Opening the nested disclosure brings the logs clear of the compose box (ADR-038).
    const compose = canvas.getByRole("textbox", { name: "Message" }).closest("form");
    if (!compose) throw new Error("no compose box");
    await waitFor(async () => {
      await expect(logs.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        compose.getBoundingClientRect().top,
      );
    });
  },
};

/**
 * Work with no steps, only its technical lines: they sit straight inside Work details, with no
 * second Technical details disclosure inside the first.
 */
export const WorkDetailsWithoutSteps: Story = {
  args: {
    thread: {
      title: "Held invoices",
      messages: [
        { id: "u1", role: "user", time: "9:02", text: "Hold both invoices for review." },
        {
          id: "a1",
          role: "agent",
          time: "9:02",
          text: "Both are marked for review.",
          work: {
            steps: [],
            logs: ["hold:south S-1187 S-1203 status=review"],
            narration: [],
            summary: "Held both invoices for review",
          },
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Held both invoices for review/ }));
    await expect(canvas.getByText("hold:south S-1187 S-1203 status=review")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Technical details" })).toBeNull();
  },
};

/** A long pasted request folds past eight lines behind a fade; Show more opens it whole. */
export const TallRequest: Story = {
  args: { thread: threads["long-request"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const more = await canvas.findByRole("button", { name: "Show more" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    await expect(canvas.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(canvas.getByText(/Thanks!/)).toBeVisible();
  },
};

// A reply that narrates and keeps writing until it is stopped, so its status can be seen.
const endlessAgent: Agent = {
  async *respond(_event, signal) {
    yield { kind: "activity", text: "Checking every region's refunds." };
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a stream waits between its chunks
      await pause(400, signal);
      if (signal.aborted) return;
      yield "Still counting. ";
    }
  },
};

// Sends a request to the endless agent and scrolls to the top while its reply streams, then
// waits for the running status to show; returns its Jump to latest button.
async function scrollUpWhileStreaming(canvasElement: HTMLElement): Promise<HTMLElement> {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "Check refunds{Enter}");
  await canvas.findByRole("article", { busy: true });
  scrollerIn(canvasElement).scrollTop = 0;
  return canvas.findByRole("button", { name: "Jump to latest" });
}

/**
 * Scrolled up while a reply streams (ADR-142): the running status shows by the compose box, at
 * the left of the reading tools, naming what the agent is doing.
 */
export const StatusStrip: Story = {
  args: { thread: threads.brief, agent: endlessAgent },
  play: async ({ canvasElement }) => {
    const jump = await scrollUpWhileStreaming(canvasElement);
    // The strip names what the agent is doing, beside the way back to it.
    await expect(jump.parentElement).toHaveTextContent("Checking every region's refunds.");
    await expect(jump).toBeVisible();
  },
};

/**
 * Jump to latest goes back to the streaming reply and the status gives way; Stop then ends the
 * reply, which says who stopped it.
 */
export const StatusStripJumps: Story = {
  args: { thread: threads.brief, agent: endlessAgent },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await scrollUpWhileStreaming(canvasElement));
    await waitFor(
      async () => {
        await expect(canvas.queryByRole("button", { name: "Jump to latest" })).toBeNull();
      },
      { timeout: 3000 },
    );
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(await canvas.findByText("Stopped by you")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
  },
};
