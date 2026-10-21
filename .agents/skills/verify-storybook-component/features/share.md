# Share

Any card can be shared on its own. The share menu on the card copies or opens a public link; the
link carries the card in its `#` fragment, and the public page renders that one card, not the
conversation. A garbled link gets an honest notice.

## Sub-features

- `share-menu` opens from `Share this card` with copy and open actions.
- `share-copy` copies the public link.
- `share-open` opens the public page in a new tab.
- `share-page-catalog` renders a shared catalog card.
- `share-page-interactive` renders a shared interactive card whose slider still works.
- `share-page-broken` explains a garbled or incomplete link.

## How to get to it (user POV)

- Click `button "Share this card"` on any card in the thread or catalog.
- Open a share link; it lands on the public page.
- In Storybook: `share-public-page--{from-link,interactive-card,catalog-card,broken-link}` and
  `foundations-menu--share`.

## Driving it with Storybook

Preconditions:

- Doctor is OK on port 6106.

- **Menu.** Load `catalog-approved-answers--trend` and click `button "Share this card"`. It becomes
  `[expanded]` and `menu "Share this card"` lists `menuitem "Copy public link"` and
  `menuitem "Open public page"`. Escape closes it.
- **Catalog page.** Load `share-public-page--catalog-card`. The `main` holds the trend card with its
  `heading "A clearer view of the week" [level=2]`.
- **Interactive page.** Load `share-public-page--interactive-card`. The profit card renders and its
  slider changes the figure.
- **Broken link.** Load `share-public-page--broken-link`. `main` holds
  `heading "This link doesn’t contain a card." [level=2]` and
  `Shared from Kay. Only this view is shared, not the conversation.`
- **Proof.** `shoot.mjs` on the four `share-public-page--*` ids.

## Gotchas

- `share-public-page--from-link` reads the page's own `#` fragment. Loaded directly it has none,
  so it shows the broken-link notice. That is correct, not a regression. To prove it, click
  `menuitem "Open public page"` from a card story and drive the tab that opens.
- `Copy public link` needs clipboard permission, which headless Chromium does not grant, and the
  button currently reports "Link copied" even when no clipboard exists. Report `share-copy` as
  verified-unreachable; do not trust the toast.
- The page says "Kay" while the lab says "Fieldnotes". Known naming split, not a verification
  failure.
