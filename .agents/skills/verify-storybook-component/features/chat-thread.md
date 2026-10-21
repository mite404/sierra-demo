# Chat thread

The thread panel is where a user talks to the agent: user messages as tinted bubbles, agent
replies with catalog cards, a compose box with attach and dictate, a recap after the user has been
away, and a card that asks the user a question when the agent is waiting on them.

## Sub-features

- `thread-messages` shows user and agent messages as labelled articles in order.
- `thread-compose` sends a typed message; Send is disabled while the box is empty.
- `thread-attach` opens the attach menu with files and screenshot.
- `thread-recap` shows a "previously on" recap after idle time.
- `thread-awaiting` shows an awaiting-input card with choices and a free-text answer.
- `thread-interactive` renders an interactive card (the profit slider) inside the thread.
- `thread-fallbacks` shows the refusal notice in context.
- `thread-narrow` lays all of this out in a narrow panel.
- `thread-reading` searches the thread and jumps to any request the user sent (ADR-143).

## How to get to it (user POV)

- The panel is the product surface; `apps/web` renders it on `/` through the runtime worker. In
  Storybook: `Thread/Chat thread
  panel`, stories `thread-chat-thread-panel--{standard,next-to-split-pane,fallbacks,
  fallbacks-narrow,recap-after-idle,awaiting-input,awaiting-input-narrow,awaiting-input-malformed,reply-fails,
  recently-active,inactive-thread,interactive-profit,interactive-profit-narrow}`.

## Driving it with Storybook

Preconditions:

- Doctor is OK on port 6106.

- **Messages.** Load `thread-chat-thread-panel--standard`. The tree has
  `region "Service desk weekly review"` containing `article "You, 9:02"`, `article "Agent, 9:02"`,
  `article "You, 9:04"` and `article "Agent, 9:04"`, each agent article holding a card.
- **Compose.** `textbox "Message"` has placeholder `What would you like to do?` and
  `button "Send"` is `[disabled]`. Type a message; Send enables. Press Enter to send.
- **Attach.** Click `button "Attach"`. It becomes `[expanded]` and `menu "Attach"` lists
  `menuitem "Add images & files ⌘U"` and `menuitem "Take screenshot"`. Escape closes it.
- **Recap.** Load `thread-chat-thread-panel--recap-after-idle`. `region "Recap"` holds a `status`
  reading `Recap · 12 min since your last message`, `button "Dismiss recap"`, and one button per
  recorded outcome. Compare with `--recently-active` (no recap) and `--inactive-thread`.
- **Reply fails.** Load `thread-chat-thread-panel--reply-fails`; its agent throws before a word
  arrives. Its play function types into `textbox "Message"`, presses Enter, and expects the text
  "I couldn't finish that reply. Try again in a moment." with no `article` left `aria-busy`. The
  cause reaches the console as a warning, never the thread (ADR-040).
- **Awaiting input.** Load `thread-chat-thread-panel--awaiting-input`. `region "Needs attention"`
  holds `radiogroup "A forecast view isn't in the catalog yet. How should I handle it?"` with
  `radio "1 Request a forecast view …"`, the typed answer `textbox "How many weeks ahead should it
  forecast?"` and `radio "3 Chat about a plan to capture a different selection of sales data"`;
  `button "Submit"` is `[disabled]` until a row is selected. Number keys and the arrows select a
  row, focusing the textbox selects row 2, and Enter sends the selection.
  `--awaiting-input-malformed` must show a safe notice, not a broken card.
- **Interactive card.** Load `thread-chat-thread-panel--interactive-profit`.
  `region "Last week's sales"` holds `heading "Last week's profit by day"` and
  `slider "Gross profit"` at its first stop, with the text `Gross profit was $57.2k`. Focus the
  slider and press ArrowRight: its value text becomes `Operating profit` and the text reads
  `Operating profit was $34.1k`. ArrowLeft returns to gross.
- **Reading tools.** Load `thread-reading-tools--overview` (`Thread/Reading tools`).
  `group "Reading tools"` holds `button "Search this thread"`, and `button "Your requests"`
  once the pointer is on the bar. Click Your requests: `menu "Your requests"` lists one `menuitem`
  per request, e.g.
  `Which day had t…9:04` (it opens upward, from the bar above the compose box); pick one and that
  turn gets `data-flash` and lands centred. Alt-click
  the button: no menu, the latest request glows. Click Search: `searchbox "Search this thread"`
  takes the focus; type `margin` and `status` reads `4 matches`, Enter makes it `1 of 4`,
  Shift+Enter wraps to `4 of 4`, Escape closes it and focuses the search button again. The
  stories `--jump-to-a-request`, `--alt-click-for-the-latest`, `--search-the-thread` and
  `--no-matches` encode all of this as play functions; `--on-a-main-pane` is the bare layout.
- **Proof.** `shoot.mjs` on every id above, and the `-narrow` ids with `--width 420`.

## Gotchas

- The panel defaults to `labAgent`, a scripted stand-in for the model. Its replies are fixtures,
  so asserting on reply wording is asserting on a fixture.
- `Add images & files ⌘U` hard-codes the Mac shortcut label although the handler also accepts
  Ctrl+U.
- `Take screenshot` calls `getDisplayMedia`, which headless Chromium cannot grant. Opening the
  menu is provable; capturing is verified-unreachable here.
- The typed-answer row is a `<label>` around its textbox, not a radio: a radio cannot contain a
  control (axe `nested-interactive`). So the group has two radios and a textbox; the radios carry
  `aria-posinset` and `aria-setsize` so they count all three rows. Its `data-selected` still marks
  the chosen row. If you touch `AwaitingInputCard`, re-run `pnpm test:stories` and re-read this
  recipe's handles against the new markup.
- The reading tools rest as `button "Search this thread"` alone (fine pointers only):
  `button "Your requests"` is folded away and hidden, so `getByRole` cannot find it until the
  pointer is on the bar. Hover Search first (the stories' `unfold` helper), or Tab to it.
  `FoldsToSearch` proves the fold; a touch screen keeps the bar unfolded.
- A jump to a turn near either end cannot centre it: the scroll stops at the end. Assert "in
  full view at that end" there, as `expectLandedOn` in `ReadingTools.stories.tsx` does.
- `--dock-space` is set from JavaScript, so the compose box position depends on a rendered dock.
  Screenshot after the story settles, not on first paint.
