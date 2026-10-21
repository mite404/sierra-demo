# Foundations

The hand-made primitives every other feature is built from: buttons, a disclosure, icon buttons, a
menu, a modal, and a text field. They carry Kay's focus, hover and disabled states, so a
regression here shows up everywhere.

## Sub-features

- `button-states` shows the button in its default and small sizes and held states.
- `disclosure-toggle` opens and folds a section.
- `icon-button-states` shows labelled icon buttons, including disabled.
- `menu-keyboard` opens a menu, moves with arrow keys, skips disabled items, closes on Escape.
- `modal-focus` traps Tab inside the dialog, closes on Escape, and returns focus to its opener.
- `text-field-states` shows rest, hover, focus, filled and disabled fields.

## How to get to it (user POV)

- These appear inside every card, the thread, and the compose box.
- In Storybook: `foundations-button--{default,small}`, `foundations-disclosure--{open,folded}`,
  `foundations-icon-button--default`, `foundations-menu--{attach,share,with-disabled-item}`,
  `foundations-modal--default`, `foundations-text-field--{on-paper,inside-recap-and-needs-you}`.

## Driving it with Storybook

Preconditions:

- Doctor is OK on port 6106.

- **Disclosure.** Load `foundations-disclosure--folded`. Click `button "How I got this"`; its
  content appears and the button reports expanded. Click again to fold.
- **Icon buttons.** Load `foundations-icon-button--default`. It shows `button "Share this card"`,
  `button "Copy link"`, `button "Open in a new tab"` and `button "Unavailable" [disabled]`.
- **Menu.** Load `foundations-menu--with-disabled-item` and click `button "Attach"`. It becomes
  `[expanded]`; `menu "Attach"` lists `menuitem "Add images & files ⌘U"` and
  `menuitem "Take screenshot" [disabled]`, and focus is on the first item. ArrowDown keeps focus
  on it (the disabled item is skipped). Escape closes and focus is back on `button "Attach"`.
- **Modal.** Load `foundations-modal--default`, click `button "Cancel"` to close the dialog it
  opens with, then click `button "Open modal"`. `dialog "Pause the thread?"` appears with
  `button "Cancel"` and `button "Continue"`, and focus must be inside it. Press Tab repeatedly;
  focus stays inside. Press Escape; the dialog closes and focus is back on `button "Open modal"`.
- **Text field.** Load `foundations-text-field--on-paper`. It shows `textbox "Rest"`,
  `textbox "Hover (held)"`, `textbox "Focus (held)"`, `textbox "Filled"` and a disabled field.
- **Proof.** `shoot.mjs` on every id above. For keyboard behavior, write a `play` function; a
  screenshot cannot show where focus went.

## Gotchas

- The Button and Text field stories hold hover and focus with `data-preview` attributes, so a
  screenshot shows those states without a real pointer. Real hover still needs a pointer move.
- Focus rings show only after keyboard input (`data-input` on the root, set by
  `trackInputModality`). A click-driven screenshot has no ring; press Tab first to see it.
- `foundations-modal--default` renders the dialog open on load with focus on `<body>`, so Escape
  does nothing until focus is inside. Its screenshot proves the layout, not the behavior.
- As of 2026-09-26 the modal did not move focus into the dialog on open, so Escape failed right
  after opening. If focus is still on the opener, that bug is back.
