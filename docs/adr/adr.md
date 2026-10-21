# Architecture Decision Records

## Start here

For a reader, or an agent summarizing this log, three threads carry the design engineering:

- The system, not the model, decides what renders: ADR-014 (`resolve()` in
  `packages/catalog/src/catalog.ts`) and ADR-157 (`toolsFor()` and `REMOVE_AFTER` in
  `apps/gateway/src/playgroundTools.ts`).
- Agent work reads as outcomes, not logs: ADR-139 (`workLabel()` in
  `packages/catalog/src/reply.ts`).
- Craft is checked, not eyeballed: ADR-065 (`packages/catalog/src/tokens.test.ts`) and ADR-086
  (`tools/verify-ui-drift` and axe on every Storybook story, both gating CI).

## How this log works

The log is append-only: records are numbered in the order they were decided, newest at the bottom.
A record is never rewritten. A later change is a dated "Amended" paragraph inside it, or a new
record that supersedes it, so the reasoning stays visible as it changed. Early records are a
sentence or two; later ones carry the measurements and the alternatives weighed. A quote marked
"(Ethan: ...)" is the decision as it was given.
When a status changes, its line is updated in place and keeps the record's original date.
Status is one of: Accepted; Proposed; Watch (decided for now, revisit as we learn); Superseded (by
ADR-N); Not built (decided, never implemented).

## ADR-001 - Focus on agent legibility

2026-09-24 - Accepted.
Of the three problems in the posting, we build the demo around making agent work legible.
It is the product's core promise, it shows timing, hierarchy, and progressive disclosure directly,
and it can be demoed with scripted data.

## ADR-002 - Treat Glass as inferred DNA for Kay

2026-09-24 - Superseded by ADR-078 (the docs are now read; see `docs/05-kay-stack-and-data.md`).
The Kay docs were unreachable from this environment, so Kay's vocabulary and surfaces come from
search snippets, with Ramp's Glass as the likely ancestor.
Anything inferred from Glass is labeled as inferred and must be checked against docs.meetkay.ai
before the interview.

## ADR-003 - The user's input never moves

2026-09-24 - Accepted; amended 2026-10-07 for automatic compose expansion.
The compose field's bottom stays anchored, and streamed output never pushes the input down.
Typing, pasting, or dictating a longer draft grows the field upward from its existing two-line
height to six visible lines. Beyond six lines, the field scrolls internally. Removing text or
sending returns the space to the conversation. No expansion control or setting is needed.
People proofread as they type, so longer drafts should be readable without moving the send controls.

## ADR-004 - Recognition over recall for skills

2026-09-24 - Superseded by ADR-009.
Typing `/` shows a filterable list of skills inline, and the chosen skill appears as a visible chip
before sending.
Users never need to memorize skill names or wait for "loading skill" to confirm.

## ADR-005 - Summaries are views over structured events

2026-09-24 - Accepted.
The agent records typed events (tool called, file changed, message sent), and every summary is
rendered from those events, with each line linking to its evidence.
We avoid a second model narrating the first after the fact, because that narration can drop or
invent details.
Amended 2026-10-01: built as `recapOf()` (`packages/catalog/src/transcript.ts`), a view over
the steps a reply recorded, each item naming its turn and step (ADR-153, ADR-158).

## ADR-006 - Outcomes first, steps second

2026-09-24 - Accepted.
Agent work is shown by what changed in the world (sent, changed, spent, waiting on you), with the
step-by-step trace one disclosure layer down.
Amended 2026-10-01: built as the one disclosure above each reply, labelled by `workLabel()`
(`packages/catalog/src/reply.ts`) with the outcome, its steps one layer down (ADR-139).

## ADR-007 - Confirmation weight matches irreversibility

2026-09-24 - Superseded by ADR-010.
Reversible actions take a tap; irreversible ones use hold-to-confirm, with the hold getting longer
as the consequence grows.
The playful interaction doubles as a signal of how much the action matters.

## ADR-008 - Legible work becomes remixable work

2026-09-24 - Not built.
A finished run renders as a reactive recipe (like marimo) where editing an upstream step re-runs the
steps after it, and any run can be saved as a skill.
This ties legibility to the success metric: users creating their own workflows and skills.
Amended 2026-10-01: cut for the demo's scope (Ethan); no run renders as a recipe or saves as a
skill.

## ADR-009 - Skills match from plain language, confirmed as a chip

2026-09-24 - Accepted.
Typing plain words (e.g. "create watcher workflow") shows matching skills in a popup above the
input; Tab applies one, and Enter sends as typed unless the user arrowed into the popup.
The matched words become a chip inside the compose box (Backspace turns it back into text), so users
get natural language and visible confirmation without memorizing a `/` command, which remains an
optional power-user shortcut.
Principle: no special syntax to invoke a skill, but immediate confirmation that it is applied, so
the user is never left wondering what the agent will do with their message.

## ADR-010 - Tap to choose, hold to ship with your defaults

2026-09-24 - Accepted.
Tapping an action opens its options; pressing and holding skips the options and runs with the user's
saved defaults, which appear inside the fill bar as it fills (release early to cancel), and the fill
takes longer for actions that are harder to undo.
After the same choices repeat, the options panel suggests "hold to skip this next time", and hold
falls back to opening the panel when a default looks wrong for the current context.
This keeps full agency on tap and adds throughput on hold, modeled on Amp's hold-to-ship.

## ADR-011 - Documents autosave; agent edits are named versions

2026-09-24 - Accepted.
New documents and artifacts save automatically, with an auto-generated title in a predictable place,
matching the Google Docs habits of knowledge workers.
Every agent edit is recorded as an attributed, restorable version, and when the user is editing at
the same time, agent changes land as suggestions instead of overwriting their text.
This sets the product-wide line: changes inside Kay are automatic and reversible, while effects that
leave Kay (send, share, publish) are deliberate (ADR-010).

## ADR-012 - Pin to lock what you like

2026-09-24 - Accepted.
Users can pin a whole document or a single section (pin icon appears in the margin on hover), and
the agent treats pinned text as locked: it never rewrites it and says when it left pinned text
alone.
Unpinned text may be edited directly and restored from version history (ADR-011); pinned text only
ever receives suggestions.

## ADR-013 - Agent edits are reviewed as a redline

2026-09-24 - Not built.
Proposed changes render as a redline, with strikethrough for removed text and a non-formatting
marker (underline or highlight tint, not bold) for added text, so the signal never depends on
red/green or collides with real formatting.
Each change is accepted or rejected individually from a review panel; on accept, struck text
collapses away (~200ms) and the new text settles to normal styling.
Open: inline redline plus a review-list panel, versus a side-by-side compose panel; prototype both.
Amended 2026-10-01: cut for the demo's scope (Ethan); no surface edits a document, so nothing is
reviewed as a redline.

## ADR-014 - Charts are tested catalog components; the LLM only describes data

2026-09-24 - Accepted.
Each chart type (`LineChart`, `BarChart`, and so on) is built and tested once as a Kay catalog
component, and the LLM only emits a validated data description (series, fields, a small set of
deliberate options such as reference lines), never new chart code.
Requests outside the catalog get an honest fallback ("I can show this as a table") instead of
improvised UI.
The engine is Recharts (mature, shadcn's default) hidden behind the catalog, so switching to
TanStack Charts later touches only the catalog.

## ADR-015 - Catalog components vary by options, split by purpose

2026-09-25 - Accepted.
Variations such as reference lines, stacking, and annotations are optional, individually tested
props on one component (e.g. `LineChart`), which the LLM fills as data and never as nested JSX,
because props compose while variant components multiply.
A new component is justified only when the purpose or data shape changes (e.g. `Sparkline` inline in
text, or `BudgetVsActual`).

## ADR-016 - Watch the catalog's long tail

2026-09-25 - Watch.
The line between "an option on an existing component" and "outside the catalog" will keep moving as
users ask for things we did not predict.
Every out-of-catalog fallback is logged with what was asked, and recurring requests are promoted to
new options or components, so the catalog grows from real demand; revisit the fallback rate and the
option budget per component regularly.

## ADR-017 - Kay suggests skills from repeated patterns

2026-09-25 - Accepted.
When a user repeats a similar request, Kay suggests turning it into a skill, but only at a natural
pause after a run completes, showing the evidence ("asked 3 times: Mon, Wed, today") and opening the
draft as an editable recipe (ADR-008) before anything is saved.
Suggestions offer "Not now" and "Don't suggest this" and are frequency-capped; this is ADR-016's
feedback loop at the scale of one user, inspired by Hermes agent.

## ADR-018 - "Previously on": a recap when the user returns

2026-09-25 - Superseded by ADR-027.
After time away (time since last input plus the window losing and regaining focus), a short
outcomes-first recap of the last runs appears above the compose box, rendered from recorded events
with links to evidence (ADR-005/006), inspired by Amp.
It overlays the conversation without moving the input (ADR-003) and collapses into a "Recap" chip as
soon as the user types.

## ADR-019 - A pop-out Kay for work across threads

2026-09-25 - Accepted.
A pop-out chat outside the thread list, summoned anywhere by a global shortcut, handles side
questions, status across threads and projects, and orchestration, inspired by Amp's Puck.
Threads are for doing a piece of work and the pop-out is for talking about your work; when a side
question becomes real work, it is handed off to a new thread visibly, and the user-facing name
avoids the word "orchestrator".

## ADR-020 - Edit and Remix open a linked new thread

2026-09-25 - Accepted.
Refining a skill or a chart/table starts a new thread so the original flow stays clean.
Both threads link to each other ("Remixed from" / "Remixed to"), and finishing the remix offers "Use
this in the original", which updates it as a named version (ADR-011), so forks never become orphans.

## ADR-021 - User messages are high-contrast landmarks

2026-09-25 - Superseded by ADR-025.
The user's messages render as contained cards with a distinct fill and weight (contrast without loud
colour), so they work as chapter headings when scrolling back.
While scrolling through a long answer, the question it answers stays pinned at the top of the
thread.

## ADR-022 - The scrollbar is a map of the conversation

2026-09-25 - Accepted.
Each turn is a marker on the scrollbar; hover shows the request and a turn summary built from
recorded events (ADR-005), and clicking jumps so the user's message lands vertically centered every
time (eye trace), inspired by Zed's Delta.
Markers are coloured by kind (user message, outcome, waiting on you), have generous hit targets, and
support bookmarking.

## ADR-023 - Catalog cards size to their panel, not the screen

2026-09-25 - Accepted.
Catalog components live inside a chat thread whose width depends on split panes, so they use
container queries with three densities: compact (under ~480px), standard (~480-720px), and expanded
(opened in the side pane).
Inside a thread, cards drop page-level framing (no repeated question, no large headings), offer
"Open in pane" for exploration, and reserve their final height before rendering so the conversation
never jumps (ADR-003).

## ADR-024 - Strict single-card selection before A2UI

2026-09-25 - Accepted.
The agent selects exactly one catalog card with required and optional props and a meaning-bearing
variant; one invented field rejects the whole card.
This answers "can the goal be reached without A2UI?" with yes, and makes every failure loud and
specific, which speeds up iteration; A2UI-style component trees and streaming stay out until a real
need appears.

## ADR-025 - User messages rest on the thread as tinted bubbles

2026-09-25 - Accepted.
The thread background stays dominant; the user's message is a soft tinted surface on top of it,
right-aligned at up to 85% width with a hairline border and the time below, so it is recognised as
"you" by shape and position rather than heavy contrast.
A full-width dark treatment was tried and read as a section header; findability when scrolling back
comes from the scrollbar map (ADR-022), and the question being answered still stays pinned at the
top while scrolling a long answer.

## ADR-026 - One compose box everywhere: attach left, dictate and send right

2026-09-25 - Accepted.
Every chat compose field is the shared `ComposeBox`: a paperclip attach button on the far left, and
a microphone for dictation directly left of the send button.
It floats directly under the conversation with no divider line above it. Its bottom stays anchored
while longer drafts grow upward to six lines (ADR-003, amended).

## ADR-027 - Recap after ten idle minutes on an active thread

2026-09-25 - Accepted; "Needs you" items moved out by ADR-039.
When a thread is still active and the user has sent nothing for 10 minutes or more, a recap of
recorded outcomes appears above the compose box, "Needs you" items first, each jumping to its
evidence turn (ADR-005/006, ADR-022), inspired by Amp's recap.
It overlays the conversation without moving the input, collapses to a chip while the user types,
stays dismissed for the current idle stretch, and uses no decorative ribbon or badge.

## ADR-028 - Dictation takes over the thread as a modal

2026-09-25 - Accepted.
Tapping the mic opens a modal over the thread with a dimmed backdrop and a disabled compose box,
which tells non-technical users plainly that typing is paused while recording.
Its large waveform works like a DAW with the playhead locked to the center: new audio enters at the
playhead and scrolls right to left, with a dotted line for the empty timeline ahead (after Amp's
waveform); a live transcript preview, a microphone picker, Esc to cancel, and Enter or Done to
insert complete it.

## ADR-029 - Interactive cards react in the runtime, never through the model

2026-09-25 - Accepted.
Catalog cards may carry controls (switch, stepped slider, numeric slider) bound to precomputed data
and to live text templates, and Kay's runtime updates the chart and the agent's sentence instantly
on every change, with no model call per interaction (after marimo's reactive elements).
Controls must fit the data (sliders need a numeric range or labeled stops; two meanings become a
switch), the agent says when it translated a request into a different control, and a "Show recipe"
view reveals the steps whose controls become skill settings (ADR-008, ADR-017).

## ADR-030 - Every interactive surface reports its state back

2026-09-25 - Accepted.
When the user changes an interactive card or custom view, its current state attaches to their next
message as a visible, removable chip (e.g. "Net profit · Sep 14-20"), so the agent answers about
what the user is actually looking at.
This applies to catalog cards and to model-written custom views alike (the typed export is the
contract, after the "copy as JSON" pattern in Thariq Shihipar's HTML article), and it follows
ADR-009: no hidden context, and the user always sees what the agent will act on.

## ADR-031 - Interaction is conversation: the user's choices feed the agent

2026-09-25 - Accepted.
Meaningful choices the user makes in any interactive surface (card controls, accepting or rejecting
redline changes, pins, sorting on a bucket board) are fed back to the agent as structured, visible
input, so the chat becomes a live feedback loop where the user steers by doing, not only by writing.
This keeps users engaged and playing instead of checking out while reading walls of text, which
serves the goal of turning them into creators; only meaningful choices count (no hovers or scrolls,
and only a card's latest state), and every choice travels as a visible, removable chip (ADR-009,
ADR-030).

## ADR-032 - Two tiers of interactive surfaces

2026-09-25 - Accepted.
Tier 1 is catalog cards, static or interactive: Kay's catalog builds them, the agent only describes
data, controls, and live text, and everything invented is rejected (ADR-024, ADR-029); tier 2 is
custom views, model-written HTML (after Thariq Shihipar's HTML article) for throwaway personal
tools, sandboxed, styled with Kay's tokens, and visibly labeled as custom.
Both tiers return the user's choices to the agent through the same visible chip (ADR-030, ADR-031),
and custom views that keep recurring are promoted into tier 1 (ADR-016).
Addendum: [04-interactive-surfaces.md](../04-interactive-surfaces.md).

## ADR-033 - Brand type: Inter for the interface, Newsreader for display

2026-09-25 - Accepted.
Following yaklabs.ai's computed styles, Inter is the interface and body face and Newsreader the
display face (headlines, wordmark, thread titles), exposed as `--font-text` and `--font-display`
tokens with the site's fallback stacks.
Both are SIL Open Font License fonts bundled from @fontsource with optical sizing, so the desktop
app renders them offline; commercial fonts would never be committed, only referenced by name with a
free fallback.

## ADR-034 - Brand colour: sampled palette, semantic tokens, one derived green

2026-09-25 - Accepted.
The palette comes from yaklabs.ai's declared CSS: off-white `#f0efea`, ink `#252524`, body copy as a
solid `#4a4a47` (about 82% of the ink), a 0.72 ink step for meta text and borders (used here as a
solid tint), and the declared sage `#c7cfba` for soft tints; hero-photo greens come from Ethan's
Figma picks. (An earlier pixel-sampled pass read body copy as ink at 74% opacity; the CSS showed a
solid grey.)
Components use only semantic tokens (`--text-body`, `--line`, `--accent`, `--accent-soft`, and so
on), and the UI accent is an olive `#515e38` derived on the declared sage's hue (OKLCH 124°),
chosen over a forest-hue green so that buttons, charts, chips, and bubbles share one hue; it passes
6.1:1 on paper and under cream text.

## ADR-035 - Outline button after yaklabs.ai, as a starting point

2026-09-25 - Accepted.
The default text button copies the site's "Apply for this role" button from its computed styles:
14px medium Inter, 10px × 22px padding, 4px corners, and an ink outline at 0.72 at rest, with the
fill (forest `#242b24`, measured from a hover recording) and off-white text arriving over a 150ms
`ease` transition on hover; the border does not animate.
The site has no delay: the "beat" before the fill is the 150ms duration itself; duration, delay,
easing, and colours stay tokens (`--btn-*`) as Ethan's starting point for design iteration.

## ADR-036 - "Show my work", always collapsed by default

2026-09-25 - Accepted.
The toggle that reveals how an answer was produced is labelled "Show my work" (not "Show recipe",
which is builder jargon), and it always starts collapsed, on every card, in every context.
Kay's job is to earn enough trust that non-technical users never need to check the steps; the steps
stay one click away for anyone who wants them, and are still the source for skill settings (ADR-008,
ADR-017, ADR-029).

## ADR-037 - Anything that expands in the thread lands centered, never under the compose box

2026-09-25 - Superseded by ADR-038.
When a card, accordion, or menu inside the thread expands, the thread scrolls so the newly shown
content (with the control that toggles it) is fully visible and vertically centered in the visible
band above the compose box and any recap overlay; content taller than the band starts at its top,
and at the end of the thread it rests flush above the compose box rather than leaving an empty gap.
The thread owns this one rule and components opt in through a `reveal` hook, and jumping to a turn
uses the same calculation (ADR-022), so expanding and jumping always frame content the same way.

## ADR-038 - An expanded card rests 20px above the compose box, like the last card

2026-09-25 - Accepted.
When a card inside the thread would be clipped by the compose box (or by the card docked above it),
the thread scrolls just enough for the card's bottom to rest 20px above it, exactly where the last
card in the thread rests; a card that already fits does not move, one taller than the view starts at
its top, and the thread never scrolls up to reveal, because that would move away from the click.
The thread panel enforces this for every component by watching each turn grow right after a click or
key press inside it, so no component has to opt in; jump-to-turn still centers its target (ADR-022),
because a jump is navigation, not an expansion.

## ADR-039 - "Needs you": a question the agent waits on, separate from the recap

2026-09-25 - Accepted.
When the agent is blocked on the user, it emits a validated question (zod, fails closed) that floats
above the compose box as a "Needs you" card with numbered choices after Claude Code's question
prompt: the agent's branches, one concrete question answered by typing right in the card, and a way
out that the agent may word for the moment ("Chat about a plan to ...") and the host otherwise fills
with "Chat about something else", with keys 1 to N and no close button.
Each row asks something different, so the card never asks "what do you want to talk about?" twice.
Every text is at most two short sentences (120 characters, about three lines in the narrow card),
labels fit one line, and the typed-answer prompt fits its one-line field; a longer question means
the agent needs more context, so it asks in the thread instead (ADR-040).
The recap only reports what happened and never asks for anything, and the question shows as soon as
the agent is blocked rather than after idle time, because being blocked is not an idle state; while
a question is open, it takes the recap's place.

## ADR-040 - A malformed question goes back to the agent, never to the user

2026-09-25 - Accepted.
A question that fails the schema never becomes a card, not even part of one, and the user never sees
the error: the validation error goes back to the agent, which asks for what it needs in an ordinary
streamed reply, so a blocked agent is never silently stuck.
A bad question (irrelevant, or offering a path that makes no sense) should never be asked at all,
which is the model's and the prompt's job; the schema only guards shape, and generation should be
constrained to the same schema so a malformed one is rare.

## ADR-041 - One seam between the thread and whatever answers it

2026-09-25 - Accepted.
The thread only reports events to an `Agent` (the user sent a message, answered a question, or the
agent's question was rejected) and renders the reply that streams back as text chunks; it never
decides what the agent says.
The scripted lab stand-in (`labAgent.ts`) is the only fake left and is the default, so showing the
UI with a real model means passing another `Agent`, with the question schema shared between that
runtime and the UI (ADR-040).

## ADR-042 - What needs attention sits on a strong surface

2026-09-25 - Accepted.
The recap and the "Needs you" card use a warm grey, `#62625d` (Ethan's pick), so they stand apart
from every card in the thread, which all sit on the light paper; their text flips to cream (5.6:1),
with muted text at 90% cream (4.9:1) and a hover that darkens to `#3d423b` (Ethan's pick, the
palette's sage) rather than lightening, so text stays well above 4.5:1 (cream 9.4:1); light surfaces
keep their own lighter hover.
It is the lightest grey in its family where cream text still passes: `#51534b` felt jarring, and
`#8a8a85` failed with light text (3.2:1) and looked disabled with dark text.
The cards redefine the text tokens locally instead of carrying colours of their own, and the olive
send key inverts to cream because olive disappears on the grey.

## ADR-043 - A text field primitive with the button's outline

2026-09-25 - Accepted.
Places to type use one shared `.field` class with the outline button's 1px border and 4px corners
(ADR-035), so a field reads as part of the same family; surfaces tune it through `--field-*` tokens,
and the strong surface is a reusable `.surface-strong` class rather than per-component colours.
In the "Needs you" card, the typed answer uses it, with a placeholder greyer than the statements in
rows 1 and 3 so a question to answer is not mistaken for a choice; a faint recessed fill keeps that
greyer placeholder at 4.6:1, and the send key sits inside the field's right edge and takes room only
once there is text.

## ADR-044 - Focus is a warm mid grey

2026-09-25 - Accepted.
The focus ring, the compose box's focused border, and the focus glow use `#8a8a85` (Ethan's pick),
which clears the 3:1 a ring needs on the page (3.0:1) and on cards (3.3:1), replacing the olive
accent; the darkest hero green `#161d17` was tried first and read too heavy.
On the strong surface the grey is 1.8:1, so that surface keeps a cream ring (5.6:1), drawn inside
tiles so it sits against the tile.

## ADR-045 - "Needs you" is numbered tiles with Skip and Submit, and it folds

2026-09-25 - Accepted.
Choices are tiles a shade deeper than the card (separated by fill, not outlines), each with its
number on the left: the number's outline appears on hover and fills solid when selected, and
choosing is two steps, select (click, number key, arrows) then send (Enter or Submit), with Skip
beside Submit at the bottom right, after Claude's and Amp's question prompts.
The card stays dark so it catches the eye while the app waits on the user, and its header folds it
to one line (label, question, chevron), after Amp, so the user can read back through the thread
without dismissing the question.

## ADR-046 - Attention surfaces in light and dark mode

2026-09-25 - Accepted.
In light mode, the current mode, the recap and "Needs you" sit on a mid grey `#8a8a85` with the
darkest ink `#111411` (5.4:1, since the regular ink is 4.4:1 there), and choices are tiles of
`#cbcac4`, darker than the user's bubbles, with dark text (9.3:1); hovers lighten, as on every light
surface.
The dark card tried in light mode (`#62625d`, cream text, deeper tiles, sage hovers) is kept as dark
mode under `:root[data-theme="dark"]`, switchable from Storybook's toolbar; only the attention
surfaces are themed so far.

## ADR-047 - The sage tint means "you", and nothing else

2026-09-25 - Accepted.
The sage-green tint of the user's bubble is reserved for that bubble, so the colour always means
"this is what you said"; context chips, badges and tags use the neutral wash instead.
The tokens are named `--bubble-*` so the tint cannot be reused elsewhere by accident.

## ADR-048 - The app surface is the site's own background

2026-09-25 - Accepted.
The app's surface (the thread panel, its cards, and the compose box) uses `#f0efea`, yaklabs.ai's
page background, and the window around the app takes the lighter step it used to have (`#f8f8f6`),
so Kay reads as the same material as the website.
Text contrast is now measured against `#f0efea`, the darker of the two; everything still passes,
with the grey focus ring the closest at 3.0:1.

## ADR-049 - Adopt yaklabs.ai's token names and contrast pattern

2026-09-25 - Accepted.
The core tokens now use the site's own names and values, read from its stylesheet: `--paper`,
`--paper-deep`, `--ink`, `--soft-ink`, `--rule` (ink at 72%), `--hairline` (ink at 25%), `--blue`,
`--sage`, `--chalk`, `--moss`, `--rust`; colours the site does not declare keep a `--yak-` prefix so
their origin stays visible.
The contrast pattern follows the site too: two text inks (headings `--ink`, everything else
`--soft-ink`), two line weights (`--rule` for outlines, `--hairline` for borders), `--paper-deep`
for hover and inset fills, and `--blue` text selection; this retires our `--muted`, `--line`,
`--wash`, and `--text-body`, and corrects `--rule`, which we had at 21%.

## ADR-050 - Where yaklabs.ai and meetkay.ai differ, Kay's own site wins

2026-09-25 - Accepted.
The Design Engineer posting lives on meetkay.ai, Kay's product site, whose stylesheet declares the
same token names with some different values; since Kay is the product, its values win.
`--soft-ink` becomes meetkay.ai's `#5c5c57` (5.8:1 on paper) instead of yaklabs.ai's `#4a4a47`, so
body and secondary text sit visibly one step lighter than headings, as on the posting; meetkay.ai
also declares `--moss: #1d291f` (its filled submit button) and `--error: #9c3b2a`, not yet adopted.

## ADR-051 - Brand colours come only from declared CSS, never from pixels

2026-09-25 - Accepted.
The screen used to sample colours had a blue-light filter, so every colour picked from screenshots
or recordings as a brand fact is dropped: the hero-photo greens and cream and the measured button
hover fill `#242b24`; this amends ADR-034, ADR-035 and ADR-046.
The button hover uses the declared near-black green `#111411` until the site's hover rule is read
from its stylesheet, text on dark fills uses the declared paper `#f0efea`, darker greens are mixed
from declared values, and Ethan's warm greys stay as deliberate picks, flagged for a re-check with
the filter off.

## ADR-052 - The button's hover is the site's moss, read from its stylesheet

2026-09-25 - Accepted.
yaklabs.ai's rule is `.apply-jump:hover { background: var(--moss); border-color: var(--moss); color:
var(--paper) }`, so the outline button now fills with `--moss` `#263b30` (paper text 10.4:1), and
its border turns moss too, instantly, since only the fill and text colour are transitioned; this
replaces the provisional `#111411` from ADR-051 and the measured `#242b24` from ADR-035.
The button follows yaklabs.ai's `--moss`, not meetkay.ai's `#1d291f` (ADR-050), because it copies
that site's button; which moss the product uses elsewhere stays open.

## ADR-053 - The focus ring is for keyboard and assistive focus only

2026-09-25 - Accepted.
Browsers treat every focused text field as keyboard-focused, even after a click, so `:focus-visible`
rang a clicked field; `inputModality.ts` now records whether focus last came from Tab or a pointer
(`<html data-input>`), and a clicked field or compose box keeps its focused border without the ring.
Tab and assistive tools (no pointer yet) still get the ring.

## ADR-054 - The attention surface: pale card, paper tiles, dark hover

2026-09-25 - Accepted; amends ADR-046.
"Strong surface" is renamed the attention surface (`.attention-surface`, `--attention-*`); in light
mode the Recap and Needs you cards are `#d6d5cf` with ink text, rows hover to `#8a8a85` with their
text switched to `#111411` (the usual inks fail there), tiles are paper (the old `#cbcac4` was 1.1:1
against the new card), the focus ring inside is ink, and Submit fills with moss on hover.

## ADR-055 - Bars are flat

2026-09-25 - Accepted; supersedes design pillars 10 and 11.
The eased darker base on chart bars did not work with the colour scheme, so bars are one flat data
colour with 4px top corners; the bar colour itself is being chosen, and green is reserved for button
hovers.

## ADR-056 - The compose box is brighter than the app

2026-09-25 - Accepted.
The compose box uses `#f8f8f6` (`--compose-bg`), one step brighter than the app's paper, so the
place to type reads as the nearest, most active surface; the window around the app uses the same
colour.

## ADR-057 - Secondary text comes from the site's brand.css

2026-09-25 - Accepted; amends ADR-050 for this token.
yaklabs.ai loads a shared stylesheet, `/brand.css`, whose `--soft-ink` is `#565650`, while its pages
override it (`#4a4a47` inline on the homepage, `#5c5c57` on meetkay.ai's careers page); secondary
text adopts the brand file's value (6.4:1 on paper).
Only this token changed; the brand file's other small differences (`--hairline` at 24%, no `--rust`)
are left as they are.

## ADR-058 - Chart marks are neutral graphite

2026-09-25 - Accepted; completes ADR-055.
Bars, lines and legend keys use `#56564f` (`--yak-graphite`, Ethan's pick; 6.4:1 on paper), so green
stays reserved for button hovers; `#252525` read as black and `#c7cfba` failed the 3:1 a chart mark
needs and belongs to the user's bubble.
The stepped slider stays olive for now, pending a decision on moving it to ink.

## ADR-059 - Needs you parts from the Recap: paper card, grey pills, a header line

2026-09-25 - Accepted; amends ADR-054 for Needs you.
The Recap is done and keeps the pale attention card; Needs you now sits on the app's paper with its
option pills in the attention grey `#d6d5cf` (hover still `#8a8a85`), and a line under its header
marks the header as the fold control, with 8px between the header's hover fill and the line; folded,
there is no line.
Neither card shows a shadow on its top edge any more; the lift shows only below.

## ADR-060 - Needs you options rest on paper-deep and hover to the attention grey

2026-09-25 - Accepted; amends ADR-059.
Needs you option pills rest on brand.css's `--paper-deep` (`#e4e4df`, one step below the card's
paper) and hover to `#d6d5cf`, which is light enough that labels and details keep their usual inks
(10.4:1 and 5.0:1); the header and Skip share that hover, and the Recap keeps its `#8a8a85` hover.

## ADR-061 - Submit announces readiness with motion, and fills only on hover

2026-09-25 - Accepted.
Once a choice is made, Submit stays an outline: a second outline fades in from 8px outside and
closes onto the border in 450ms, its stroke thinning from 6px to 4px and then to 1px in the last
frames, and then it disappears, handing off to the real border so two outlines never overlap, so
becoming available is a motion rather than a colour, and the moss fill is left for hover alone;
before, a filled Submit and its moss hover were nearly the same.
It is CSS only (a pseudo-element created when `:disabled` stops matching starts the animation),
drawn as an inset shadow because border widths snap to whole pixels; under reduced motion the
outline simply appears.

## ADR-062 - Five primitives under every surface

2026-09-25 - Accepted.
Disclosure (accordion), Menu (popover), Modal, CardHeader and IconButton are shared primitives with
their own Foundations stories, so every surface builds from the same parts: the Needs you fold is a
Disclosure, dictation is a Modal, the compose attach and card share menus are Menus, and every
card's top is a CardHeader with a flush divider.
The Menu is fixed to the viewport beside its trigger and closes on scroll or resize, because the
compose row and cards clip their overflow and would otherwise cut it off.

## ADR-063 - Attach files or a screenshot from the compose box

2026-09-25 - Accepted.
The paperclip opens a menu with "Add images & files" (⌘U) and "Take screenshot"; the screenshot
uses the browser's screen-capture prompt (the user picks what is shared), grabs one frame and stops,
and attachments ride along with the next message as chips, which can be sent on their own.
The goal is less friction in the feedback loop: showing the agent what you see should take one
click, because non-technical people get better results, and enjoy the work more, when showing is
easier than describing.

## ADR-064 - Share one card as a public page

2026-09-25 - Accepted.
Every card has a share button that copies a link to, or opens, a standalone page showing only that
component, never the conversation; the card travels in the link's fragment (which never reaches a
server) and passes the same catalog check before rendering, so a garbled or edited link shows an
honest notice, and interactive cards stay interactive.
In the lab the page is `share.html` beside the app, or the Share/Public page story inside Storybook;
making it public means deploying either one.


## ADR-065 - Contrast is measured before a colour ships

2026-09-26 - Accepted.
Every colour change is checked in numbers, not by eye: text needs at least 4.5:1, and UI parts and
graphics (rings, outlines, chart marks) at least 3:1, measured against every surface the colour
touches, including hover, selected and dark mode; a requested colour that fails is flagged with its
ratio, and the nearest passing option, before it ships.
Colours that looked fine failed on measurement at least six times: `#8a8a85` with light text (3.2:1,
ADR-042), the grey focus ring on the attention card (1.8:1, ADR-044), the regular ink on the
`#8a8a85` hover (4.4:1, ADR-046), sage as a chart mark (ADR-058), and olive (2.0:1) and soft ink
(2.1:1) on that same hover; taste proposes, numbers dispose.

## ADR-066 - One writer per branch

2026-09-26 - Accepted.
Parallel sessions may read a branch freely, but only one writes to it at a time, and write ownership
passes explicitly, in a handoff that names the branch, its head commit and the open PR, so the new
writer starts by checking the repo against it.
Two sessions once pushed to the same branch and collided; read-only helpers such as the Figma token
watcher never push, so they need no handoff.

## ADR-067 - The question card is labelled "Needs attention" and fills only on hover

2026-09-26 - Accepted; amends ADR-059 and ADR-060.
The label reads "Needs attention" on a yak brown pill (`#d0ae7e`) with near-black brown text
(`#3b2612`, 6.8:1), both Ethan's picks, replacing the faint warn colours.
The card has no grey fill at rest: option pills lose their `--paper-deep` rest fill and take it as
their hover instead (ink 12.0:1, soft-ink 5.8:1), the `#d6d5cf` hover is gone from this card (the
Recap keeps it as its surface), and the header and Skip share the new hover; dark mode is unchanged.

## ADR-068 - The Needs attention pill is caution orange

2026-09-26 - Accepted; amends ADR-067.
The label's fill moves from yak brown `#d0ae7e` to an orange `#d19456` (`--yak-orange`, Ethan's
pick) so it reads as caution, not decoration, while the text stays `#3b2612` (5.5:1 on the new
fill).

## ADR-069 - Attention cards cast their shadow down and to the right

2026-09-26 - Accepted; amends ADR-059.
The Recap and Needs attention cards' shadow moves 8px right as well as 8px down (`8px 8px 16px
-8px`), so it shows equally on the bottom and right edges and not at all on the top or left, as if
lit from the top left; before, the right side was barely darker than the surface (5 levels against
19 at the bottom), so the card looked lifted only at its bottom edge.

## ADR-070 - The control you just clicked stays in view

2026-09-26 - Superseded by ADR-071.
When a click makes a card taller than the visible thread, the thread still starts the card at its
top, unless that would leave the clicked control under the compose box; then it scrolls until the
control rests 20px above the compose box, so a toggle such as "Show my work" can always be clicked
again to hide.
Before, opening the profit card's steps pushed "Hide my work" beneath the compose box, where a click
landed in the text field.

## ADR-071 - An expanded card always shows its bottom edge

2026-09-26 - Accepted; supersedes ADR-070 and amends ADR-038.
When a click grows a card and its bottom is clipped by any surface (the compose box, or the Recap or
Needs attention card docked over the thread), the thread scrolls up until the card's bottom edge
rests 20px above that surface, even if the card's top leaves the view; a card that is not clipped
does not move.
The bottom edge is the signal that everything in the card has been shown: without it, a
non-technical person is left wondering how to close the card, or waiting for the agent to say more.

## ADR-072 - Card footers are laid out in whole pixels, and toggles never change width

2026-09-26 - Accepted.
Every card toggle ("Show my work" / "Hide my work", "View data table" / "Show chart") is 128px wide,
which fits the widest label, so the button stays put when its label flips; before, it moved 6px (and
1.7px on catalog cards).
The source line and the button share a 17px line, so the 52px footer places the text exactly 7px
inside the 31px button, and both snap to the same pixel rows at any scroll position; before,
fractional sizes (a 16.5px text line, a 30.89px button) let a browser round the text a pixel
differently between the open and closed card.

## ADR-073 - Show my work's steps are whole pixels tall

2026-09-26 - Accepted; completes ADR-072.
The steps use a 20px line instead of 1.7 (20.4px), so the list is a whole number of pixels tall
(140px for six steps); the reveal scroll moves in whole pixels, so the footer now lands exactly
where it started (625.58px before opening and after), where the 154.34px list left it 0.34px lower
and could round the whole footer down a row.
Toggling also re-renders the card's chart, which redraws its bars without moving a pixel; memoizing
it is logged in `docs/LATER.md`.

## ADR-074 - Kay's architecture, as published

2026-09-26 - Watch.
From YakLabs' own pages (job posts, DPA, Data Use, Privacy Policy; details and sources in
`docs/05-kay-stack-and-data.md`): one TypeScript monorepo holds a React desktop app, a local daemon,
cloud services and plugins; the cloud is an API and an inference gateway on Fly.io with managed
Postgres, Cloudflare at the edge, and WorkOS for sign-in, and conversations, files and credentials
never leave the user's device.
The desktop shell is probably Electron but unconfirmed, and Rust or Go appears only as a
nice-to-have for the harness role; revisit if the interview says otherwise.

## ADR-075 - The slice keeps conversations on the device

2026-09-26 - Accepted.
Kay's DPA makes on-device storage "the primary control": conversations, files, notes and credentials
stay local, and hosted prompts pass through a gateway that writes nothing down, so the slice stores
conversations in the browser (see ADR-081) and sends to the cloud only what Kay's cloud holds (usage
metadata without content).
This rules out backends that persist message history by default, such as Convex's agent component
(`@convex-dev/agent`) and its persistent text streaming helper, unless storage is turned off.
Amended 2026-10-01: built as ADR-081 records, SQLite in the origin private file system,
opened by the worker (`packages/runtime/src/worker.ts`).

## ADR-076 - The slice mirrors Kay's process split

2026-09-26 - Accepted.
The chat UI never runs the agent loop: a Web Worker stands in for Kay's daemon (the loop, the tools,
the local conversation store), talking to the UI only through messages across the `Agent` seam, and
a separate gateway holds the model key and streams replies.
Moving to Kay would then mean replacing the worker with their daemon and our gateway with theirs,
with no change to the UI; the honest limit is that a browser tab cannot run while closed or reach
the file system and shell, which is what makes Kay's daemon proactive.
Amended 2026-10-01: built; `packages/runtime/src/runtime.ts` starts the Web Worker that runs
the agent loop and the store, and the gateway holds the key (ADR-088, ADR-155).

## ADR-077 - The slice's backend is a small standalone service, not router-attached server functions

2026-09-26 - Accepted (Ethan): the service is Hono on Cloudflare Workers (ADR-085).
Kay's backend is separate services that the desktop app calls over HTTPS, and an Electron app has no
web server to attach server functions to, so Next.js App Router server functions are the wrong
shape; the closest match is a standalone TypeScript service (for example Hono) with Postgres, which
deploys to Fly.io or Cloudflare Workers (Kay's own hosts), so no other host such as Railway is
needed.
Convex is the fast alternative: it can host the whole runtime (its actions run up to 10 minutes, and
`@convex-dev/workflow` handles longer work), but its document-relational model differs from Kay's
Postgres rows, its agent component stores message history by default (see ADR-075), and running the
loop on a server moves it off the user's machine, the opposite of Kay; if chosen, use it fully and
keep it behind the `Agent` seam and a usage interface.

## ADR-078 - Shape the slice as a Kay plugin

2026-09-26 - Not built; amends ADR-002 and ADR-074.
Kay's docs (docs.meetkay.ai, now reachable, so ADR-002's reliance on Glass as a stand-in is no
longer needed) say Kay is "a small stable core plus a set of extensions", where first-party
integrations are plugins that contribute tools, integrations, `scheme://` resources, bundled skills
and Pages ("full React apps hosted inside Kay's workspace"), and Kay runs on macOS only today.
So the slice is packaged the way a plugin would be: the catalog cards as a Page, the catalog as
tools the agent calls, and the card rules as a bundled `SKILL.md`, which makes "how would this ship
in Kay?" a one-sentence answer; the private plugin SDK is out of reach, so this mirrors the
contract's shape rather than using it.
Amended 2026-10-01: cut for the demo's scope (Ethan); the agent's tools are made from the catalog's
schemas (ADR-155), but there is no Page or bundled `SKILL.md`.

## ADR-079 - Voice first: Kay can read its last reply aloud

2026-09-26 - Not built.
Kay's quickstart promises "Download it, sign in, and start talking", so the slice doubles down on
voice: dictation already exists (ADR-028), and now, when a reply finishes streaming, a small
semi-transparent hint appears above the compose box, "Press ⌘T to hear me" (T for talk; Ctrl+T on
Windows), clickable as well as keyboard-driven, which reads back only the last completed reply (for
a card, its one-sentence summary); a speaker button in the compose area does the same, instead of
one under every message.
The hint is a non-blocking toast, not a modal, so it never takes focus from typing, and it goes away
when the user types or after a few seconds; ⌘T is free inside Kay's desktop app, but browsers keep
it for a new tab and never pass it to the page, so the web slice uses ⌘⇧H ("hear"; Ctrl+Shift+H
on Windows), which Chromium leaves to the page, and the hint shows whichever key works where it
runs; speech goes through the gateway with the ElevenLabs key held server-side and nothing stored,
with the browser's built-in voice as an on-device fallback, and the hint's text must pass 4.5:1
against the thread behind it (ADR-065).
Amended 2026-10-01: cut for the demo's scope (Ethan); replies are not read aloud.

## ADR-080 - The slice's gateway can be Kay's own: Bifrost

2026-09-26 - Watch: deferred by ADR-085; Bifrost can sit behind the Hono gateway later without
changing the browser side.
Kay's Data Use page names its inference gateway: "It runs Bifrost, open-source software we self-host
on Fly.io", an LLM gateway written in Go with one OpenAI-compatible API across providers; running
the same image on Fly.io (`fly deploy --image docker.io/maximhq/bifrost:latest`, configured from
`config.json`) makes the slice's gateway the same software on the same host as Kay's.
Bifrost's docs settle the three open questions: Anthropic chat streams, and ElevenLabs is supported
for speech output (streamed) and for transcription (not streamed), while Deepgram is not a provider;
browser access is set by `allowed_origins` (default `*`, so it must be narrowed); and
`enforce_auth_on_inference` with virtual keys, each with a budget and a rate limit, keeps the
provider keys on the gateway, though a key used from the browser is visible in the page, so its
budget must be small; the dashboard needs its password and setup token before the app is public.
Its content settings mirror Kay's DPA almost word for word: `disable_content_logging: true` keeps
metadata only, and `allow_per_request_content_storage_override: false` means no request can opt back
into storage.

## ADR-081 - The slice stores its data in SQLite, in the browser's private file system

2026-09-26 - Accepted (Ethan); completes ADR-075.
Conversations are saved as markdown files and indexed in SQLite (the official WebAssembly build,
`@sqlite.org/sqlite-wasm`), both kept in the Origin Private File System (OPFS), a folder the browser
gives only this site; that mirrors Kay's local storage (transcripts as markdown, a local database of
text and vectors) and its promise that conversations never leave the device, and it removes any
hosted database from the slice.
SQLite's fast OPFS mode works only inside a Web Worker, so the worker that stands in for Kay's
daemon (ADR-076) owns the database; the page asks the browser to keep the data
(`navigator.storage.persist()`), and clearing site data still wipes it, as deleting Kay's
application data folder would.

## ADR-082 - New UI uses shadcn/ui and Tailwind, kept on-brand by construction

2026-09-26 - Accepted (Ethan); corrects an undecided drift.
The research note recommended shadcn primitives (`docs/03-generative-ui-research.md`), but
`catalog-lab` was built in hand-written CSS without that ever being decided; from now on, new UI is
built with shadcn/ui and Tailwind v4 (faster, and agents write both fluently), while the existing
catalog components keep their verified CSS and move across only when touched, with before and after
screenshots, since a rewrite would put 73 ADRs of checked details at risk.
Three things keep agent-written UI from looking like everyone's defaults: (1) a token bridge, where
shadcn's theme variables (`--background`, `--foreground`, `--border`, `--ring`, `--primary`,
`--radius`) and Tailwind's `@theme` map to the Kay tokens, so anything an agent writes comes out in
Kay's paper, ink, hairlines and 4px corners; (2) a rules file the agents read, a `SKILL.md` under
`.claude/skills/` (which Kay also reads, so it doubles as the plugin's bundled skill, ADR-078)
saying tokens only and never raw hex, green only on button hovers, outline buttons by default, and
contrast checked in numbers (ADR-065); (3) a guard that fails the build, a lint rule or test that
rejects raw colour values in components, extending the contrast guard, so an agent cannot drift
without breaking the build.

## ADR-083 - The frontend is React Router as a single-page app, with no server rendering

2026-09-26 - Accepted (Ethan).
The app is React Router in framework mode (the mode Ethan knows) with `ssr: false`, built by Vite
into static files: the Web Worker, the browser's private file system and SQLite in WebAssembly exist
only in the browser, and Kay's own interface is a static bundle loaded from disk, so a
server-rendering framework (Next.js, TanStack Start, or React Router with `ssr` on) would add a
server the slice never uses.
Loaders are `clientLoader`s; Better-T-Stack's React Router template turns server rendering on by
default, so `ssr: false` is set and `@react-router/node`, `@react-router/serve` and the `start`
script are removed; one dedicated Web Worker, started with Vite's `new Worker(new URL(...), { type:
"module" })`, owns the agent loop and SQLite through the `opfs-sahpool` storage mode, which needs no
cross-origin isolation headers.

## ADR-084 - Sign-in is WorkOS AuthKit in the browser, with no auth server of our own

2026-09-26 - Accepted (Ethan).
Kay signs users in with WorkOS, so the slice does too, through `@workos-inc/authkit-react`, the
browser-only SDK: WorkOS hosts the sign-in page and stores the users, and `getAccessToken()` hands
the app a token; a layout route's `clientLoader` sends signed-out visitors to sign-in, and every
protected route nests under it.
The site's address must be on WorkOS's allowed origins list, and before relying on the deployed
site, check in WorkOS's docs how token refresh works outside localhost, where AuthKit's `devMode`
keeps tokens in `localStorage`.

## ADR-085 - The gateway is one Hono app on Cloudflare Workers

2026-09-26 - Accepted (Ethan); settles ADR-077, defers ADR-080.
A single Hono app (Ethan's familiar framework) on Cloudflare Workers is the slice's only server: it
verifies the WorkOS access token on every request against WorkOS's public signing keys, holds the
Anthropic and ElevenLabs keys as Worker secrets, streams replies and speech back, and stores
nothing, which keeps Kay's gateway promise and means only signed-in users can spend the model
budget.
The static site deploys to Cloudflare as well, possibly from the same Worker; Kay's own gateway,
Bifrost on Fly.io (ADR-080), can go behind this Worker later without changing the browser side.

## ADR-086 - The slice's wiring, tooling and one extra

2026-09-26 - Accepted (Ethan); completes ADR-083 to ADR-085.
One Cloudflare Worker, deployed with `wrangler`, serves both the static React Router build (`assets`
with `not_found_handling: "single-page-application"`) and the Hono API under `/api`, so there is one
deploy, one origin, no CORS setup and one allowed origin in WorkOS; Better-T-Stack scaffolds only
the frontend (backend and auth None), because choosing its Workers runtime forces Alchemy, a beta
tool built on Effect, and makes the web app render on a server, and the gateway comes from Hono's
own `cloudflare-workers` template, with WorkOS AuthKit added by hand.
The browser calls the gateway through Hono's typed client (`hc<typeof app>`), and the UI and the Web
Worker talk through one zod-checked message union (growing from `AgentEvent`), checked on arrival
like the catalog; tRPC and oRPC are ruled out because three streaming routes, one of them audio, do
not repay an RPC layer (oRPC is the one to revisit if the API grows).
Tauri is deferred and can be added later with `create-better-t-stack add --addons tauri`; storage
sits behind a `ConversationStore` interface (save, list, search, read), so a desktop build swaps
OPFS and SQLite in WebAssembly for native SQLite on disk with one new adapter.
Linting and formatting use Oxc (Oxlint 1.85 and Oxfmt 0.70, which sorts Tailwind classes), run by
Lefthook on staged files only, since every agent commit runs the hook; type checks, tests and the
raw-colour guard (ADR-082) run in the build and CI, where `--no-verify` cannot skip them.
The day-4 extra becomes visual regression and accessibility checks in CI (Playwright screenshots
across the Storybook states, plus axe), which matches the Design Engineer: Infrastructure post's
"state catalogs, screenshot and visual regression tests, and accessibility checks in CI" and
contains the contrast guard.

## ADR-087 - The repo is a pnpm monorepo in Better-T-Stack's layout

2026-09-26 - Accepted (Ethan); carries out ADR-086.
Better-T-Stack scaffolded only the frontend (`pnpm create better-t-stack@latest` with React Router
and every backend, database, auth and payments option set to none, plus the lefthook, oxlint and
turborepo addons), and the result was rearranged so the catalog stays one package beside its own
stories, schemas and tests: `apps/web` is the React Router single-page app, `apps/storybook` hosts
Storybook and the story tests over `packages/catalog` (`@yaklabs/catalog`, the former
`catalog-lab`), `apps/gateway` is the Hono Worker, `packages/runtime` is the Web Worker's agent loop
and conversation store, `packages/ui` holds the shadcn primitives on Kay's tokens, and
`packages/config` the shared TypeScript base; pnpm's catalog pins the versions every package shares
and Turborepo runs `build`, `typecheck` and the tests.
Three scaffold pieces did not survive the move: Varlock (an env codegen step; the app parses its
`VITE_` variables once with zod into a union with no half-set states), `bunfig.toml` and the server
entry (`@react-router/node`, `@react-router/serve`, `start`; ADR-083's `ssr: false` build keeps
`isbot` only because React Router's typegen installs it by itself when it is missing), and fourteen
of the seventeen generated shadcn components, which nothing imported and `shadcn add` restores in
seconds; `next-themes` went too, since React 19 refuses the inline script it renders inside a
client-rendered component, so a fifty-line module sets `data-theme` on the root, boots the stored
theme from the prerendered shell, and hands the toaster its theme as a prop.
Two token names collided with shadcn's and were renamed before the bridge was written: Kay's
`--radius` (14px, the card and the thread panel) is now `--radius-card`, and Kay's `--accent` (the
olive) is now `--olive`, so shadcn's `--radius` can be the site's 4px button corner and its
`--accent` the hover fill; the app loads `tokens.css` in a `catalog` cascade layer declared between
Tailwind's `base` and `components`, so the catalog keeps its bare-element styles above preflight
while a utility class on a shadcn primitive still wins.
Lefthook replaced husky and lint-staged and runs only on staged files (oxlint, oxfmt, the markdown
wrap), and CI runs everything else on pnpm with a frozen lockfile; oxlint runs with nested configs
off, because it otherwise picked up an example config under the vendored skills.
Every story rendered byte-identical before and after the move, and again after the token renames,
from screenshots of all forty stories taken twice from the old layout; the four that differ are the
dictation stories' live waveform and one chart animation, which differ between two runs of the same
code.

## ADR-088 - The runtime and the gateway, as built

2026-09-26 - Accepted (Ethan); carries out ADR-076, ADR-081, ADR-085 and ADR-086, and amends
ADR-081.
`packages/runtime` is the Web Worker that stands in for Kay's daemon: the page and the worker talk
only through one zod-checked union each way (commands `init`, `open`, `send`, `abort`, `list`;
notices `ready`, `opened`, `chunk`, `done`, `failed`, `listed`, `error`), the page checks its own
commands before posting and the worker checks them again on arrival, and the page's `startRuntime`
returns an `Agent` for the thread panel, so the UI did not change to move the loop off its thread.
Conversations live behind a `ConversationStore` (open, save, list, search) with two adapters, memory
and SQLite through `@sqlite.org/sqlite-wasm`'s `opfs-sahpool` VFS in a worker, as rows in
`conversations` and `messages` with an FTS5 index kept by triggers; the markdown transcripts ADR-081
describes are deferred, since the rows already give Kay's local store its shape and a file export is
one adapter away.
The worker saves the user's turn before the agent runs and the reply when it ends or is stopped, and
the model request it builds carries every card the agent showed as JSON in the assistant turn and
every card choice as a `[Card view: <label>]` line in the user turn, which is how the interactive
UI's state reaches the model (ADR-030, ADR-031).
`apps/gateway` is one Hono app on Cloudflare Workers with `run_worker_first` on `/api/*` and the web
build as its assets: `POST /api/messages` takes text turns only, verifies the caller's WorkOS access
token against the client's JWKS (jose), forwards the turns to `claude-opus-5` with adaptive thinking
and an 8192-token cap, and streams the SDK's own event stream back as newline-delimited JSON, which
the worker rebuilds with `MessageStream.fromReadableStream`; the browser calls it through Hono's
typed client, and both bindings live in the Cloudflare dashboard with `keep_vars` on.
Sign-in is WorkOS AuthKit in the browser behind a layout route that redirects signed-out visitors
and follows only a same-origin path back; the callback and the share page stay public, the settings
parse once into a union (agent lab or gateway, auth none or WorkOS), and the real-model path and the
token issuer remain unverified until a key and a person's sign-in are available.
The seam between the thread and the agent still carries text only, so cards come from the seed
thread today; card-producing replies are the next increment, and they change the seam, not the
worker or the gateway.

## ADR-089 - The compose canvas beside the thread, and a rail

2026-09-26 - Accepted (Ethan); carries out ADR-083 and extends ADR-041.
The thread page is two panes on one screen: the primary thread on the left and, to its right, the
compose canvas, a dotted field that grows into a row of lanes. The divider between them is a
`react-resizable-panels` separator (shadcn's Resizable primitive on Kay's tokens) that drags
anywhere along its length, with floors of 28% and 20% so neither pane can vanish; the library reads
a bare number as pixels and a string as a percentage, so the sizes are strings.
Two things land on the canvas. A highlight dragged out of any thread arrives as the browser's own
plain-text drag and starts a new thread of the same project: a fresh conversation in the worker's
store, titled by the highlight's first line, whose compose box opens with the highlight quoted and
the caret beneath it, so the user asks and no turn is sent on the drop. A card dragged by its header
opens large in a lane of its own; the header is the handle so the slider inside an interactive card
keeps its own drag, and the drag carries the same envelope a share link does (`SharedCard` under
`application/x-kay-card`), which is why a card can be dropped anywhere that reads that type. The
pointer says a highlight can be picked up before the browser's drag does: an open hand while it
rests on the highlight and a closed one from press to release, which is the same hand a card's
header shows.
Open space always remains at the end of the row, the whole canvas when it is empty and a slimmer
column once lanes exist, so there is always somewhere to put the next thing, and its copy names the
two drags. Thread lanes persist because their conversations do: the canvas lists every conversation
but the primary, oldest first, less the lanes closed by hand, whose ids live in localStorage. Card
lanes are a way of looking and last the visit.
The header became a rail: the Kay mark, Thread and Lab as icons with tooltips, and at the foot the
theme and the account. GitButler's workspace was the reference for the concept (lanes on a canvas,
open ground kept to the right), not for the look; the rail and the canvas use Kay's paper, hairline,
serif and olive.
Amended later the same day, after the first run on Ethan's machine. The hand shows only over a
highlight that already exists: while a button is down the selection growing under it keeps the
I-beam, as every word processor has since the nineties, and the hand appears on release. Lanes
resize by the gap after them: the whole gap takes the drag, and while the pointer is on it a hint of
a line shows, full ink for 20px either side of the pointer's height and gone by 50px, which
JetBrains Air does along a full-height blue line; the divider between thread and canvas shows the
same hint.
Lanes reorder by their title bar, the same bar that drags a card out of a thread, or by the grip in
the strip above them, and a hand over either says so. Past a small dead zone the lane lifts, after
GitButler's pattern: a copy of it floats under the pointer, near-opaque with a shadow, while the
lane itself stays in the row dimmed and, once its centre crosses a neighbour's, slides into the
slot it would take as the lanes it passes step aside. The placeholder is therefore the lane's own
shape, never a blank; the copy is a snapshot of its DOM with the draft and the scroll carried over,
and the row's DOM is left alone until the drop, because moving the pressed element would release
its pointer capture. The bar is the handle by its middle and right: a six-dot grip fades up at its
centre while the pointer is on that part, and stays away from the far left, where the title is a
field waiting to open. A click on the title renames the thread in place, Enter keeps the new name
and Escape the old, and the worker keeps it (`rename`, answered like `open`), for a lane and the
main thread alike; a card's title comes from its payload and stays. Nothing sits above a lane but
its close. The order is kept in `kay.canvas.order` beside the hidden list, and Shift with the arrow
keys on a gap moves the lane before it one slot. The canvas has no right edge: once a lane is on
it the ground runs a full pane past the open space, a thin scrollbar in the rule colour stays in
view to say so, and the ground itself drags to pan. A card dragged out of a thread rides the
pointer whole, the drag image being the card and not its handle, and the card left behind dims
until the drag ends. A
vertical wheel over the ground pans the row, since the row has nothing vertical to scroll. The open
space reads "Drag a text selection or card / to start a new thread with context" over the catalog's
own button, "Create blank thread", the one a card's "Show my work" uses. The close stays in the
strip, with the site's 4px corners. Moving it into the thread's title bar was built and axed: it
cost the panel a prop and the card lanes a title bar of their own, for a change Ethan chose not to
make yet.
Not yet: a drop between two lanes, a keyboard path for a highlight (the Create blank thread button
is the keyboard route today), card lanes that persist, and the row scrolling itself while a carried
lane nears its edge; each is in `docs/LATER.md`.

## ADR-090 - Dark mode for every surface

2026-09-26 - Accepted (Ethan); extends ADR-046.
ADR-046 themed only the attention surfaces, so the toggle switched `data-theme` and the page stayed
light. Dark mode now redefines the page's roles under `:root[data-theme="dark"]`: the window is the
site's night green (`--yak-night`), the app surface a step above it (`#1a1e1a`), hover and inset a
step above that, the compose box and menus lifted again, and the cream that was the paper becomes
the ink (14.7:1) with a soft ink at 72% cream (8.1:1). Lines are cream at 72% and 18%; the olive
lifts to `#8e9d6f` so the slider's accent clears 3:1 (5.8:1); chart marks lift to `#b5b5ae`
(8.2:1); the user's bubble is sage over the dark paper at 16%, 30% and 45%; shadows deepen; the warm
notice and the recording dot get dark values of their own. Every ratio is measured against the dark
paper and written beside its token.
Three things had to be true first. The cream got a name of its own (`--yak-cream`), because the
attention tokens and the outline button's hover said `var(--paper)` where they meant the cream, and
a dark paper would have made that text vanish; `--on-accent` is the cream in either mode, and
`--on-ink` (paper in light, night in dark) is what sits on an ink fill, which the shadcn bridge maps
to `--primary-foreground`. The hard-coded whites on the default button and the workbench's current
item became `--control-bg`, and menus draw on `--compose-bg`, the lifted surface, instead of the raw
bright paper.
Proof: all 42 stories shot in light before and after, byte-identical or matching a canonical set on
a rerun; all 42 shot in dark through the screenshot lever's new `--theme` option and read by eye;
and the browser lever measures that the page, the paper and the ink all change when the toggle is
used, instead of trusting the attribute.

## ADR-091 - A carried card or highlight is pointer-driven, not an HTML5 drag

2026-09-27 - Accepted (Ethan); amends ADR-089.
During a native HTML5 drag the operating system draws the cursor and the browser ignores every CSS
`cursor` rule until release, so the closed hand shown on press could never survive the drag:
measured on `main`, one `dragstart` fired and the element under the pointer read `cursor: auto`, and
the only drop feedback lived on the open space at the far end of the row, off-screen once a lane
existed.
Cards and highlights therefore travel by a pointer-driven carry the page draws itself, which keeps
the closed hand from lift to release, lights the whole canvas, lands the drop in the gap under the
pointer and lets Escape cancel.
Ethan accepted losing drags out to other apps, which only ever received the card's title as plain
text, because the arrow reappearing mid-drag reads as unpolished; the Share link stays the way to
take a card elsewhere.
Amended 2026-09-29 (Ethan): incoming cards and highlights use the canvas reorder's preview language.
The canvas outline appears at lift, before the pointer enters it. Over a slot, a 35%-opacity preview
shows the destination while neighboring lanes step aside over 150ms. The insertion line is gone.
The preview and the landed lane share their default width, and the preview is inert and hidden from
assistive technology. Leaving the canvas clears the slot preview but keeps the outline until the
carry ends. Escape cancels without adding a lane. Reduced motion removes the slot transitions.
Reordering reads the gap from the canvas's 18px grid instead of assuming the older 16px spacing.
Proof: `apps/web/scripts/drag-preview-check.mjs` checks early feedback, matching drop geometry,
stable slots, cancellation, re-entry, and card and text carries in light and dark themes.

## ADR-092 - Threads started on the canvas are sub-threads of the main thread

2026-09-27 - Accepted (Ethan); extends ADR-089.
A project holds any number of main threads, and a thread started on a main thread's canvas is that
thread's child, one level deep, listed under it in the sidebar as a "↳" row.
Opening a main thread or any of its children loads the same whole view, the main thread beside its
canvas, with the child's lane brought into view.

## ADR-093 - The sidebar is shadcn's Sidebar, with Conductor's project rows

2026-09-27 - Accepted (Ethan); carries out ADR-082.
Navigation becomes shadcn's `Sidebar` with `collapsible="icon"`, whose collapsed state is today's
56px rail, instead of a hand-made tree; it already brings the toggle, the keyboard shortcut,
skeleton rows, row actions and nested sub-rows.
A project row reads "name >" when folded, shows no chevron while open until the pointer is on the
name, and carries a "+" that starts a new thread in that project, after Ethan's Conductor
screenshots.

## ADR-094 - The web app draws itself as a desktop window with a tabbed title bar

2026-09-27 - Accepted (Ethan's brief; built and proven by the workspace lever's P9 to P11).
Following Kay's desktop app without changing our look, the app is a window inside the viewport with
decorative traffic lights and one title bar across its full width: the sidebar toggle at the far
left, tabs in the middle, and at the far right the notifications bell and then the account avatar,
which takes the corner because the signed-in account matters more.
Each tab restores one of three layouts, a thread alone, a thread beside a simulated browser, or a
thread beside the compose canvas, and the rail keeps the Kay mark with a documentation link beneath
it.
Amended 2026-09-29 (Ethan): the rail follows Kay's own. Under the mark come Memory, Skills, App
store, Analytics and Automations, drawn with lucide's Brain, Unplug, Store, ChartColumnIncreasing
and Clock; lucide has no brain with a pencil, and no column chart on a baseline without a left
axis, which is what a crop of Kay's rail shows, so those two are the nearest. The documentation
link moves down after them, and the Lab stays last. The web build has none of the five yet, so
each is a button that keeps its name, in its pill collapsed and beside its glyph open, is reached
by keyboard, opens nothing, and says so: "Coming soon" in the pill and to a screen reader, "Soon"
in the open row, where a 208px sidebar has room for no more. It is drawn in faint ink with no
hover fill, not at half opacity (design pillars, rule 27). P12, P23 and P25 hold the order, the
pills and the unavailable state.
Amended the same day (Ethan): the traffic lights are 14px, 2px up from 12, each grown about its
own centre over the 12px slot it had: still 20px apart, the first 22px in from the bar's edge and
all 22px down its 44px, with the toggle and the tabs after them where they were. A light centred
on a whole pixel with whole-pixel edges has an even width, so 14 and 16 were the sizes on offer;
14 leaves 6px between lights, where 16 would leave 4px and crowd them. P26 holds the lights'
boxes and the toggle's place.
Amended 2026-09-29 (Ethan): the five are outside this demo's scope rather than on their way, so
each says "Out of demo scope", in its pill, beside its name in the phone drawer's row and to a
screen reader, one phrase in all three. The phone drawer is 85% of the width up to 20rem
(ADR-121), 320px on the checks' 390px phone, which leaves "Automations" 64px clear of the whole
phrase, so the short "Soon" goes. P23 and P25 read the new words.
Amended 2026-09-30 (Ethan: "the K logo in the navbar needs to be replaced w/ the bonsai
component from AgentTree"). Kay's mark is now the bonsai: the working glyph's three pills held
still (`BonsaiMark`, `rail-places.tsx`), drawn on the glyph's own 12-unit grid in the text
colour, at the 20px box the K filled, in the rail's home place and on the welcome. The animated
glyph stays the working indicator; the mark is its resting form.

## ADR-095 - The Kay mark is the vector Kay's site declares

2026-09-27 - Accepted.
meetkay.ai declares its mark as one SVG polygon (`viewBox="0 0 78.59 78.54"`,
`fill="currentColor"`), so the rail draws that polygon instead of a trace of a screenshot, the same
rule ADR-051 set for colours: brand assets come from what the brand declares, never from pixels.

## ADR-096 - Mock scenarios never touch device data, and the app says which is which

2026-09-27 - Accepted (Ethan's brief; P7 loads every scenario twice and compares bytes).
Deterministic scenarios for long content, loading, failure and empty states run on a store built in
memory from fixed fixtures and never open the device's database, so a demo can never overwrite or
read real conversations.
The app states plainly whether an action is mock, kept on this device, or live with a real model:
"Live data can follow, with a clear indication when actions have real effects."

## ADR-097 - A lane's title runs the whole bar, and the grip veils it only on hover

2026-09-27 - Accepted (Ethan); amends ADR-089.
ADR-089 kept a lane's title to half its bar so the six-dot grip never met it, which cut every
longer title in half at rest. The title now hugs its text and runs the whole bar; while the pointer
is on the bar's drag area the grip fades up over a veil in the bar's own paper that fades out the
stretch of title beneath it, and the veil is the grip's hit area, so a press there drags the lane
and never renames. The rename field draws no rule while editing, so the title reads the same in
the same box the moment it opens.
Proof: the workspace lever measures the whole title at rest, the ink beside the grip going from 37
at rest to 162 on hover, and a 0px rule in the field (`docs/trail/evidence/projects-sidebar/css`).
Amended 2026-10-02 (Ethan: "the grip icon seems to be finicky in the main chat thread"): a card's
header in a thread wakes its grip the way a lane's bar does, while the pointer is within 25px of
the dots, rather than on hover less its title and actions. A title wrapped to two lines in a
narrow thread filled the header, so only the padding and the gaps between words woke the dots
and they blinked as the pointer crossed the words. The zone moved to the catalog
(`gripZone.ts`), so the card's header and the lane's bar read one radius.

## ADR-098 - The Disclosure's hover fill sits 4px inside its host

2026-09-27 - Accepted (Ethan).
The inset the Awaiting card gave its fold by hand now belongs to the Disclosure primitive, so the
"How I got this" story and every later host get a hover fill that stops short of the card's edges;
the Awaiting stories render byte-identical in light and dark after the move.

## ADR-099 - The worker owns the workspace and pushes one snapshot

2026-09-27 - Accepted; carries out ADR-092 and ADR-076.
Of four designs put side by side, the one with the smallest surface won: the page sees one
observable state and five verbs (`open`, `create`, `rename`, `arrange`, `agent`, plus `saveShell`
for the tabs), and the worker pushes the whole workspace (projects, threads, lanes, the shell, no
messages) after every write, skipping a push that would change nothing. Every command carries a
request id and every answer names it, so one failed call no longer fails every call in flight,
and a write's snapshot always arrives before its answer. A closed lane is an absent lane,
`arrange` sets a main thread's whole lane list (move, close, reopen, resize and a card drop are
all one verb), and renames, arranges and shell saves show at once and roll back if refused.
Proof: 137 runtime tests, among them the ordering, attribution and dedup cases in
`packages/runtime/src/agentLoop.test.ts`.

## ADR-100 - Schema v2 carries the first build's data over, and converges

2026-09-27 - Accepted; extends ADR-081.
SQLite gains projects, a parent link on conversations, lanes, the shell document and
notifications, with checks and triggers that refuse a grandchild, a lane on the wrong canvas and a
card lane that names a thread. The upgrade is a list of steps keyed by `user_version`, each one
transaction; the first build's data becomes project "Demo store" with `profit` as its main
thread and every other conversation its child, the two localStorage lists deciding which lanes
stay open and in what order. The page clears those lists only after the device store opens on
the private file system, so a second tab on memory can never lose them.
Proof: a browser test writes the first build's exact schema with rows shaped like Ethan's,
migrates twice and once more after a crash inside the step, and gets identical rows each time with
an empty foreign key check (`packages/runtime/src/sqliteStore.browser.test.ts`).

## ADR-101 - Scenarios load through the store's own writes, with faults as data

2026-09-27 - Accepted for the runtime; extends ADR-096.
Each scenario (demo, empty, long, loading, failure, thread-fails) fills a fresh in-memory SQLite
through the same writes the app uses, so a fixture cannot hold a state the schema refuses; the
clock is fixed, ids count up and turn times are in UTC, so every load is byte-identical. Loading
and failure are data on the fixture (hold forever, or fail with a fixed reason), never timers, so a
screenshot of a loading state is stable. A scenario always answers with the lab stand-in.
Proof: `packages/runtime/src/scenarios.test.ts` and `agentLoop.faults.test.ts`.

## ADR-102 - A carry claims its press on pointerdown

2026-09-27 - Accepted; amends ADR-091.
Measured in Chromium before building: cancelling `dragstart` keeps the pointer events coming but
collapses the highlight on the first move, while `preventDefault` on `pointerdown` stops the
native drag and keeps the highlight through press, moves and release. The carry therefore claims
the press on `pointerdown` and still refuses `dragstart` inside the thread as a backstop; it
swallows the click that follows a lifted carry, as a native drag does, and a click on a highlight
without a lift still clears it. The carry is a pure state machine (idle, armed, carrying) behind a
thin DOM shell, cancelled by Escape, the window's own blur, `pointercancel` or lost capture.

## ADR-103 - A pinned thread stays pinned through the layout's own scrolls

2026-09-27 - Superseded by ADR-109.
Chromium's scroll anchoring moves a thread's `scrollTop` while a chart above sizes itself, and the
scroll event it fires landed with the thread a pixel or two short of its end, so the thread
unpinned itself and rested short (2 of 15 fresh loads of one dictation story, 7 of 15 of another).
Only a reader's scroll unpins now; a scroll the layout caused keeps the pin. After the change, none
of 90 loads across six thread stories rested short. The rule is a pure step with a table test.

## ADR-104 - The lab stand-in answers every message

2026-09-27 - Accepted (Ethan's screenshot).
The scripted agent stayed silent on a message with no card choice and no file, which in a demo
reads as a broken thread. It now answers a plain message with one scripted line that says it is
the lab's stand-in.

## ADR-105 - An open tab stays mounted until it closes

2026-09-27 - Accepted; extends ADR-094.
A tab is an open main thread, and the address `/t/:threadId` picks which one is on screen. Every
tab visited stays mounted, stacked in one grid cell: a hidden one is `inert` and skips rendering
through `content-visibility: hidden`, which keeps its scroll, draft and running reply where
`display: none` would drop the scroll. Only closing a tab unmounts it.

## ADR-106 - The pane beside the thread keeps fixed limits

2026-09-27 - Accepted.
The panel library applies a panel's new size limits one render late, so a pane made collapsible
in the render that collapses it refused to close, and the Thread layout left a fifth of the tab
blank (measured 932 and 233 px). The side pane is now always collapsible with fixed limits. A drag
that reaches the far edge closes it only until release, when the saved layout comes back, so the
layout switch stays the one control that decides what sits beside the thread.

## ADR-107 - Screenshot levers run Chromium without partial raster

2026-09-27 - Accepted.
With partial raster on, Chromium redrew only part of a tile, so two loads of the same page
differed by 1 to 4 colour levels at a few rounded corners, depending on load order. The app was
the same both times, so the check was wrong. The levers launch with `--disable-partial-raster`, and
the byte-exact comparison of two loads stays strict (24 of 24 loads identical).

## ADR-108 - A press already claimed never lifts its lane

2026-09-27 - Accepted; follows ADR-102.
A carry claims its press with `preventDefault`, not `stopPropagation`, so the press still bubbles
to the lane around it. A lane's reorder therefore takes only a press nobody claimed, or a card
header inside a thread lane would lift the card and its lane together.

## ADR-109 - A thread decides whether to follow its end when it resizes

2026-09-27 - Accepted; supersedes ADR-103.
ADR-103 judged the pin from scroll events, but a scroll event reads the layout when it is
delivered, not when the scroll happened. A reader who scrolled up in the frame a streaming reply
grew therefore looked like a layout scroll, and the thread snapped back to its end. Two rules over
scroll events were measured and failed (23 and 12 of 360 loads rested short).
Browser scroll anchoring is now off on the thread (`overflow-anchor: none`). The thread decides
when it resizes: it follows its end only if the gap before the resize (the gap now, less what the
resize added) was under 2px. A view that gets shorter, such as the compose box growing, counts as
the end moving away.
Measured in a real browser, a reader's scroll-up during streaming is now kept in all four thread
stories, and 0 of 360 fresh loads rest short. The cost is that when content above a reader who
scrolled up grows, it now pushes their view down, where anchoring used to hold it in place.

## ADR-110 - The title bar is green window chrome, the same in both themes

2026-09-27 - Accepted (Ethan's mock R9; the hex is his to confirm, Q3); amends ADR-055 and ADR-058.
Green was kept for button hovers alone; the title bar now carries it too, as window chrome, which
is not content and so does not compete with the hover. `--chrome` is `#3b423c`, sampled from the
mock and flagged in `tokens.css` until Ethan names the value.
The bar is the same in light and dark, as a desktop window's frame and its traffic lights are,
and everything on it is cream: `.chrome-surface` remaps Kay's roles and the shadcn roles its
primitives read, the way `.attention-surface` does, so no component carries colours of its own.
Ink is cream (8.98:1), soft ink cream at 72% (5.56:1), a hover fills cream at 8% (1.25:1, so a
skeleton tab still shows), and focus is the site's own 2px ring in cream, restored over shadcn's
`outline-none`, which had left a 1px ring at 1.3:1 to 3.2:1.
"Selected" on the bar, the active tab and the pressed layout, is one cream pill with the night
green on it (8.98:1 against the bar, 16.1:1 for its text). The pill is the same in both themes:
the page's own paper would have been 1.63:1 against the bar in dark mode.
The avatar's ring keeps a blend in both themes, since dropping it switched every glyph on the page
from greyscale to subpixel smoothing in Chromium. An avatar with no picture shows its initials in
the full cream (7.21:1 on its fill), not the soft ink (4.47:1), and shadcn's half-strength ghost
hover in dark mode is set back to the full fill, so the bar is the same picture hovered too.
Amended 2026-10-01: built as `--chrome` in `packages/catalog/src/tokens.css`, where the hex is
still flagged for confirmation (Q3). The app was light only from ADR-161 to ADR-162; since
ADR-162 the dark bar is Umbralkai's grey, not this green, with the same cream pill.

## ADR-111 - The window sits on a desk of its own, 16px in

2026-09-27 - Accepted (Ethan's mock R9; the ground and the margin are his to confirm, Q10).
The page behind the window is `--desk`, not the app's own ground, so the window's sides and bottom
show against it: a warm grey between Ethan's two stone greys in light mode (1.43:1 against the
paper, 1.54:1 against the bright paper), where the mock's cool grey would be a sampled colour
(ADR-051); his slate in dark mode (2.75:1 against the paper). A desk darker than the dark paper
cannot reach 1.3:1, since black itself is 1.24:1.
The margin is 16px from 768px up, as in the mock, instead of 8px, and the contract's frame line
says so. Below 768px the window is still full-bleed.
Amended 2026-10-01: built as `--desk` in `tokens.css`, drawn by `apps/web/src/shell/window.tsx`.

## ADR-112 - A trim frames the window's body, olive until Ethan picks

2026-09-27 - Superseded by ADR-136 (Ethan's mock R10; placement, colour and whether it is a Figma
outline are open, Q5 to Q7).
A 2px `--trim` line runs under the bar, down both sides and along the bottom, following the
window's bottom corners. It is drawn over the body's edge on a layer of its own, so no box below
the bar moves and every pixel under it paints as before; drawn in the page's own layer, it had
made Chromium composite a dark-mode fill a level off.
Its colour is olive (6.57:1 against the bright paper, 5.79:1 against the dark paper), not the
mock's blue, which no token declares and which reads as a keyboard focus ring (ADR-053).
Amended 2026-10-01: superseded by ADR-136, which removed the trim, its token and its
predicate.

## ADR-113 - The empty canvas shows a splash

2026-09-27 - Accepted (Ethan's brief; the drawing's source is his to supply, Q11).
While the canvas has no lanes, a line drawing sits behind its words and Kay stands at the open
space's bottom right. Both are pictures only: hidden from the accessibility tree, and a press, a
pan or a carried card goes through them to the ground. The first lane that lands sends them away,
and they come back with the last lane closed.
The drawing is a CSS mask filled with `--splash-line`, the ink at 12%, so only its strokes show
(1.26:1 against the field in light, 1.36:1 in dark) and it themes with the ink. Until the Atlas
figure's source arrives, the mask is an original drawing, a sphere on a desk stand over
golden-ratio construction lines.
Kay is a transparent WebP cut from the mock by `cut-kay.mjs`, a placeholder until Kay's published
file arrives. He hides where the open space is under 480px, and there is no idle animation; the
splash fades in over 150ms, and not at all under reduced motion.
Bottom to top: the dotted field, the carry's lit fill, the drawing, the words and the button, and
Kay, so a carry tints the ground but never the drawing, and Kay stands in front.
Amended 2026-10-01: built in `apps/web/src/components/splash.tsx`; its pictures and looks
were reworked by ADR-135, ADR-136 and ADR-158.

## ADR-114 - Kay's face is the avatar when the build has no sign-in

2026-09-27 - Accepted (Ethan's mock R9; who the face stands for is his call, Q8).
The mock puts Kay's face in the title bar's corner, which ADR-094 gives to the account. With
sign-in off there is no account to show, so the corner shows Kay; a WorkOS user keeps their own
picture or initials. The button's name stays "Account" and the picture has no alternative text.
Amended 2026-10-01: built in `apps/web/src/shell/account.tsx` for builds without sign-in;
the deployed build signs in (ADR-156), so it shows the account.
Amended 2026-10-01 (Ethan: "okay you can delete Kay's face"): the face is gone. It was YakLabs'
mascot, cut from Ethan's mock, and permission to ship it never came. A build without sign-in
now shows the avatar's person glyph; `kay-face.webp`, its credits and `cut-kay.mjs` are deleted.

## ADR-115 - The title bar can be painted, and stays solid by default

2026-09-27 - Accepted (Ethan's exploration; the default and the painting itself are his to choose,
Q2 and Q4).
The painted bar is an oil painting under a moss wash at its ends, over the painting's mean colour,
so a slow or blocked image still leaves a passing bar. The painting is made in the repo by
`paint-chrome.mjs` from seeded noise, so it is ours to ship and identical on every run. The script
decodes the WebP it wrote and lowers its clamp until no pixel of the file is brighter than
luminance 0.10, since the lossy encode lifted some pixels past the clamp it was given (0.134 at
first). On it the soft ink is cream at 85% (4.87:1 on the brightest pixel); cream at 72% would
fall below 4.5:1 there. `painting.json` records the decoded mean and maximum, and the token test
reads it.
Its hover and skeleton fill is a night wash (1.37:1 over the painting's mean) rather than the flat
bar's cream fill, which vanished on a painting of the same green (1.03:1); a wash only darkens, so
the inks on it only gain.
The solid bar is the default. `?chrome=painting` or `?chrome=solid` picks one once: a boot script
takes it out of the address before the router starts, as the theme's does, since the app's own
links keep only the scenario and a leftover parameter would undo a later choice. The choice is kept
in localStorage and held for the visit in memory too, so a refused storage still keeps it. The
Account menu has a Title bar choice beside
Theme, so Ethan can switch while he decides.
Amended 2026-10-01: built in `apps/web/src/chrome.ts`, with the Title bar choice in
`apps/web/src/shell/account.tsx`; the solid bar is still the default.

## ADR-116 - On a phone the title bar is two rows: what never scrolls, then the views

2026-09-27 - Accepted (Ethan chose it over ADR-120's row of tabs); supersedes ADR-120. Amends
ADR-094 and ADR-096 below 768px only.
From 768px up the bar stays one 44px row. Below it, where the window is already full-bleed
(ADR-111), the one row left the tabs no room: the traffic lights, the marker and the Layout group
took 250px of 390. The phone bar is two rows instead. The top row never scrolls: the sidebar
toggle, the name of the project on screen, the marker as one word ("Mock", "On device", "Not
saved", "Live", with the full label kept for a screen reader), the bell, and at the far right a
"⋯" menu for the thread and its project (New thread, Close this thread, New project).
The second row is the views, Thread, Browser and Canvas, named in words and scrolling if they
ever overflow; it is the same Layout group, so its names do not change. The tab strip is hidden
on a phone, and other threads open from the sidebar, as in Amp. The account is not in the bar
on a phone: it sits at the foot of the sidebar (ADR-121), which gives the top row back 32px.
Tried first and set aside: one 44px row with the Layout group behind a button and the active tab
as wide as the strip, which fitted (82px of title at 390px) but hid every other tab and the views
behind taps; and a second row of tabs (80px), which kept the tabs but not the views.
P13 in the workspace lever holds 390, 520 and 767 to the two rows, 82px tall.

## ADR-117 - A lane's gap reports the lane's width, and a lane is 320 to 1800px wide

2026-09-27 - Accepted; amends ADR-089.
The gap after a lane takes the focus and resizes by arrow key, so ARIA requires it to carry a
value, and axe failed every gap for lacking one. It now reports the lane's width in pixels, read
aloud as "480 pixels wide", within a range that a drag and the arrow keys both keep to: 320px, as
before, up to 1800px, which fills the widest canvas a 2560px screen lays out. A default column in
a pane too narrow for 320px widens the range to hold its width rather than report a value outside
it.

## ADR-118 - One tab at a time opens the device's threads, and a failed open cannot delete them

2026-09-27 - Accepted for the guard against the delete; the held second tab is Proposed until Ethan
decides whether a blocked second tab is the experience he wants. Extends ADR-081 and ADR-100.
sqlite-wasm's `opfs-sahpool` installer answers any failure by deleting the pool's directory,
every database in it included (`removeVfs`, recursive). A second tab always failed, since the
first holds the pool's access handles, so it tried that delete on every open, and only the first
tab's handles stopped it; a first tab letting go in the gap lost every thread (3 of 15 trials in
the review's harness, and every time in a browser test that lets go at that moment).
Two guards now close it. The worker takes the Web Lock `yaklabs-database` before it opens the
database and keeps it for its life, so a second tab never touches the pool: it says "Your threads
are open in another tab" and opens them once the first tab closes. It no longer falls back to
memory, where a fresh starter labelled "Not saved" stood over the real threads; memory stays for
a browser that refuses the file system or has no Web Locks. And the store holds a file in a
subdirectory of the pool's own, where the pool never looks, for as long as its worker lives:
Chromium refuses a recursive delete while any file under it is open, and refuses it whole, so
the installer's clean-up cannot delete the pool whatever made the open fail and whoever lets go.
Measured before choosing: 0 of 60 ended lock holders left a handle busy for the next holder, 0 of
45 reloads heard the held notice, and a holder that ignores the lock (an older build) lost
nothing in 15 trials, against 3 before. The guard leans on the library's `.opaque` directory,
whose name the library itself says never changes; the browser test fails if it stops guarding.
Reloading the tab that has the threads while another waits hands them to the waiting tab, and
the reloaded tab then waits in turn and says so; nothing is lost.

## ADR-119 - On a phone the workspace shows one pane at a time

2026-09-27 - Accepted (Ethan).
Below 768px, a thread beside the canvas or the browser left each about 185px, so the chart's
labels overlapped and its buttons were cut off. On a phone the Layout switch now picks the one
pane that fills the width (Thread, Browser or Canvas), and the others collapse. They stay mounted
and inert, so a draft or a streaming reply survives a switch. The panel group and its fixed
limits stay the same on every screen (ADR-106): the thread's panel is now collapsible too, so a
phone and a wide screen differ only in the layout the switch asks for, and crossing the
breakpoint remounts nothing.

## ADR-120 - On a phone the title bar puts the tabs on a row of their own

2026-09-27 - Superseded by ADR-116 (Ethan chose the row of views over the row of tabs).
At 390px the one-row title bar squeezed the tab strip to nothing and slid New thread under the
data marker. Below 768px the tabs now take a row of their own under the controls, 80px in all,
so every tab stays whole and tappable. A one-row, 44px bar that hid the Layout switch behind a
button was tried in #14 and withdrawn: Ethan wants two rows on a phone and one on a wide screen.
With ADR-119, a phone shows the controls, then the tabs, then one pane.

## ADR-121 - On a phone the sidebar pushes the page aside

2026-09-27 - Accepted (Ethan's direction, after Amp's phone sidebar); amends the phone half of
ADR-094's sidebar, which was shadcn's sheet over a dimmed page.
Below 768px the Toggle sidebar button slides the whole window, title bar included, to the right,
and the sidebar comes in with it from the left, in one 300ms move (none under reduced motion).
The drawer is 85% of the width, at most 20rem (320px of 390), so the page's own edge stays in
view: it is the way back, and a tap on it closes the drawer, as Escape and choosing a place do.
While it is open the pushed page is inert, and focus goes into the drawer and comes back to the
toggle. The drawer is `mobile="push"` on shadcn's Sidebar: it sits just off the sliding wrapper's
left edge, fixed inside a translated parent, so one transform moves both and no width is
measured. The sheet stays the primitive's default.
The account lives at the foot of the drawer on a phone, not in the title bar, as in Amp: the
place you go for where you are is also where you go for who you are. It is mounted in exactly
one place, chosen by the provider's `isMobile`, so there is one menu and one theme choice, and
the desktop rail, which renders the same children, never shows it. Its menu opens upward from
the avatar, and Escape closes the menu before it closes the drawer.
Amended 2026-10-01: built as `mobile="push"` on the sidebar
(`apps/web/src/shell/sidebar.tsx`).

## ADR-122 - On a phone the canvas is for looking, not arranging

2026-09-27 - Accepted (Ethan). Amends ADR-091, ADR-102 and ADR-108 below 768px only.
The canvas keeps the cards and child threads a person wants to come back to without scrolling up
or hunting through threads. Arranging them by dragging sideways does not work on a phone: the
drag fights the row's own sideways scroll, and a card header's `touch-action: none` turned a
swipe that started on it into a carry. Below 768px the canvas is view-only. Lanes still scroll
sideways, but a lane's title bar no longer lifts it, the grip and its veil are not drawn, and a
card in a thread is not carried (the thread and the canvas are never on screen together on a
phone anyway, ADR-119). Keyboard reordering on a lane's gap stays. From 768px up nothing
changes. All of it follows the one `isMobile` the sidebar already reads: the lane reorder takes
an `enabled` flag, the row carries `data-reorder` for the grip's styles, and the thread panel
takes `cardsCarry`.

## ADR-123 - The title bar drops the data marker

2026-09-28 - Accepted (Ethan: "any 'live' indicators or pills or anything like that can be
deleted. i will implement that delineation later if necessary."). Amends ADR-096, which put the
marker in the bar, and ADR-116, whose phone top row counted it among five controls, now four.
The bar no longer says whether a thread is mock, kept on this device, or answered by a live
model, so a private window that cannot keep threads no longer warns before they vanish; Ethan
accepted that gap and may ask for a delineation again later.

## ADR-124 - A main thread's fold arrow sits beside its name; its count is read only

2026-09-28 - Accepted (Ethan); amends ADR-093.
ADR-093 put a project's fold chevron right after its name, but a main thread with sub-threads
still folded them behind a count at the row's far right ("^ 2"), a second design for the same
job. The fold button now sits right after the title, sharing the project row's own chevron: ">"
while folded, and open, a "v" while the pointer is on the row. Ethan first dropped the count as
clutter, then asked for it back: the number of children stays at the row's far right, but as
plain text with no arrow, so folding has one control, the arrow. The count is hidden from
assistive tech, since the fold button names it ("Hide the 2 threads in ...").
An open fold's "v" fades out as soon as the pointer leaves, on a project and a main alike (Ethan:
"as soon as the mouse is off hover ... this icon should fade away"). Keyboard focus shows it too,
but only `:focus-visible`: a click leaves focus on the button, and `:focus-within` would hold the
"v" up until the next click elsewhere.
A touch screen has no hover to reveal the "v", so there (`@media (hover: none)`) an open fold
always shows it, on a project and a main alike (Ethan, asked whether it should: "yes").
The row is a link, so its fold button cannot nest inside it; the row uses the stretched-link
pattern instead (Bootstrap's recipe). The link stays sized to its title, with an `::after` that
stretches to the row's edges since the row, not the link, is the nearest positioned ancestor, so
a click anywhere on the row still opens the thread. The button sits after the title in flow,
lifted above that layer by its own stacking context (`relative z-10`), so it still catches its
own clicks and only folds the children.

## ADR-125 - The sidebar lists threads by creation, never by what was opened

2026-09-28 - Accepted (Ethan).
A main's children were listed in canvas lane order: open lanes first, then the closed ones. A
click on a closed child's row reopens its lane, so the row jumped up the list, out from under
the pointer that had just clicked it. Ethan: "when a user interacts with the thread, by opening
it in the side nav bar it should not be rearranged ... that's bad UI." The recency he asked for
is creation order, newest first: mains stay newest created first, and at Ethan's word children
now list the same way under their main. Opening, closing or dragging a lane never moves a row,
and nothing in the sidebar sorts by activity. The canvas keeps its own lane order.

## ADR-126 - A thread's actions live in one menu, in its own title bar

2026-09-28 - Accepted (Ethan's brief). Replaces the placeholder items in the phone's "⋯" of
ADR-116.
Every thread has one "Thread actions" menu with exactly six items, in Ethan's order: Copy thread
URL, Share thread, Pin thread, Snooze, Archive, then Delete apart below a rule. Pin and Archive
name what they would do now (Unpin thread, Unarchive), and Share and Snooze say their state at
the item's end ("Private" or "Until Tue 16:50", "Tue 9:00"), which the item's accessible name
carries too ("Snooze, Tue 9:00"). On a desktop the "⋯" sits at the end of the thread's own title
bar, in the main pane and on every lane, with a failed or opening thread's frame keeping it; the
title keeps its own width, so a lane's bar stays free to lift by (ADR-089). Below 768px the
thread's bar has none, and the one "⋯" is in the window's top row, where ADR-116 put it. The
menu is shadcn's DropdownMenu on Kay's tokens. Delete keeps ink for its words and only its icon
is red, since the red on a dark menu measures 3.85:1 against the 4.5:1 text needs (ADR-065).

## ADR-127 - Pin lifts a thread to the top of its own list

2026-09-28 - Accepted (Ethan).
A pinned main leads its project's mains, and a pinned sub-thread leads its main's sub-threads;
several pinned keep creation order among themselves (ADR-125), and unpinning puts the row back
where it was. A pin icon stands before the title in the sidebar, and a filled pin in the
thread's title bar, on a lane too, is itself the Unpin button, with a tooltip that says so.
Pinning never moves the view. A pinned thread never auto-archives (ADR-129), and archiving one
unpins it.

## ADR-128 - Snooze asks when on the thread's own ask card, and wakes with a notice

2026-09-28 - Accepted (Ethan: a snoozed thread keeps its place and strength, marked by a
clock).
Snooze opens the same ask card the agent uses (AwaitingInputCard, labelled "Snooze") in the
thread, with the focus on its first tile: first any dates the thread's own words name ("by
Friday"), then In 1 hour, Tomorrow (9:00) and Next week, a field for a typed time ("Friday
3pm"), and Keep it awake, which reads Wake it now once it is snoozed. The host's ask stands in
for the agent's question while it is open. A snoozed thread stays in its place at full strength
with an alarm clock before its title, and its tooltip and the menu say when it wakes. When the
time comes, the settling pass (ADR-129) clears the snooze and posts a bell notice, "Back from
snooze: <title>", and the wake restarts its idle clock. A time at or before now is refused.
Amended 2026-10-01 (Ethan): the toast a snooze shows is kept as a record in the bell. The page
words the note as the toast does, in its own clock and zone, and the mark carries it, so the
store writes the snooze and its note in one transaction, or neither. The note counts as read
at once: the person who would read it is the one who just snoozed, so it adds nothing to the
badge.

## ADR-129 - Archive settles a thread to the bottom, dimmed, and idle threads settle on their own

2026-09-28 - Accepted (Ethan: "an archived thread should settle to the bottom of the list (still
ordered by recency) within a project ... dimmed text and a closed filebox icon"; auto-settle
after 14 days, built now).
An archived thread sinks below the live ones in its own list, keeps creation order among the
archived, and shows a closed filebox before a dimmed title, full ink again while it is the one
open. The dim is a new token, `--faint-ink`: #64645e on paper (5.17:1, 4.67:1 on paper-deep)
and #92938f in the dark (5.46:1, 4.60:1), so an archived title still clears 4.5:1 (ADR-065).
A main untouched for 14 days archives by itself; its sub-threads' activity counts as its own,
and pinned and snoozed threads are exempt. A new message in a thread unarchives it and its main.
The rule is one pure `planSettle` in the runtime, run as the worker starts, after every write,
and on a timer set for the next thing due, at most a day away, so a page left open still
settles. Archiving clears a pin and a snooze; pinning or snoozing unarchives.

## ADR-130 - Delete hides at once and offers Undo, backed by a tombstone

2026-09-28 - Accepted (Ethan: an undo toast, not a confirm).
A confirm dialog trains click-through; Undo catches the slip one row below Archive. Delete marks
the thread, and a main's sub-threads with it, deleted in SQLite and hides them at once; the
page leaves the thread if it was on it and shows "Deleted <title>" with Undo for 10 seconds.
Undo clears the mark and returns to the thread. A settling pass purges a tombstone 15 seconds
after the delete (the window plus a grace for an Undo in flight), and every tombstone as the
worker starts, since no Undo outlives the page that offered it. Deleting a thread also takes
down its public pages and its sub-threads' (ADR-131).

## ADR-131 - Share makes a thread public for a set time, sealed on the device

2026-09-28 - Accepted (Ethan: "since the philosophy of this app is data privacy i think we
should be explicit about how long the sharing last since its a public site"; chose encrypted,
stored, with a TTL). Extends ADR-064, which shares one card in the link itself.
Share thread opens "Make public for" 1 hour, 3 hours, 1 day or 7 days. The page seals the
thread's title and turns with AES-GCM under a fresh key; the gateway gets only the ciphertext
(at most 1 MB, signed-in visitors only) and keeps it in the SHARES KV namespace with that
lifetime as its `expirationTtl`, so an ended link is gone from the store, not merely refused.
The link is `/share.html#t=<id>.<key>`: the key rides in the fragment, which no request carries,
so the server never holds what it would need to read the thread. The gateway answers with a
revoke token and keeps only its SHA-256; the device keeps the link and the token. While public,
the item says until when, and the submenu offers the end, Copy public link, Open public page,
Stop sharing, and a new link in place of the old, which is revoked. The public page leads with
"Shared from Kay until <time>; after that this link stops working" above a read-only thread. A
build with no share server says so and records nothing. The contract (`SHARE_TTLS`,
`shareCreatedSchema`) lives in the gateway and the runtime re-exports it, since the web app
cannot depend on the gateway, whose build already depends on the web app's. A card's own link,
copied from a thread's address, now resolves against the site's root; it had resolved to
`/t/share.html`.

## ADR-132 - Schema v3 records marks, tombstones and shares

2026-09-28 - Accepted.
Migration 3 adds `pinned_at`, `snoozed_until`, `archived_at`, `deleted_at` and `touched_at` to a
thread, each null until set (a null `touched_at` reads as the thread's `updated_at`), and a
`shares` table (id, thread, link,
revoke token, created and expires, with `expires_at > created_at` checked), in one transaction
as every step is (ADR-099). The snapshot carries the three marks on each thread and the shares
newest first, filtered to threads still shown; deleted threads and their sub-threads never
reach it. `touched_at` moves with a message, a mark and a wake, so a thread just unarchived or
woken is not archived again at once.

## ADR-133 - A lane keeps whether it is collapsed, in a column of its own (schema v4)

2026-09-28 - Accepted. Extends ADR-099, ADR-100 and ADR-132.
A lane on the canvas can collapse to a 32px strip, as GitButler's stacks do, so a busy canvas
still shows every card and child thread at a glance. Whether it is collapsed belongs to the lane,
like its width: it rides `arrange` in the lane record (`collapsed: boolean`) and lives in a new
`lanes.collapsed` column, `0` or `1`, which step 3 → 4 adds with every existing lane expanded.
The existing record had nowhere honest to put it: the shell document is the page's and would
outlive a closed lane, and folding it into `width` would give one column two meanings. The
1 → 2 step keeps writing only the columns v2 had, so a finished step never changes. A collapsed
lane keeps its width for when it opens, and a closed lane that reopens comes back expanded.
Where the controls sit is ADR-134.
Proof: `packages/runtime/src/schema.test.ts` migrates a v3 canvas to v4 with its lanes expanded
and refuses a flag other than 0 or 1; `sqliteStore.test.ts` reads a collapsed lane back.

## ADR-134 - A lane's collapse lives in what it folds, and Collapse all in the title bar

2026-09-28 - Accepted (Ethan: "the collapse/expand for a thread or card should live within the
container of that element. the collapse all/expand all should be part of the title bar on
desktop. on mobile it should be in the top row, not the second row"). Extends ADR-133, ADR-116.
A lane's collapse sits first in the thread's or the card's own title bar, and at the head of the
strip once collapsed, as GitButler's does, with the thread's menu (ADR-126) at the bar's other
end; the catalog's headers take it through a `leading` slot, so they stay the catalog's. Collapse
all sits in the title bar beside the layout on a
desktop, and in the phone's top row beside the bell, never the row of views. It collapses every
lane while any is open and expands them all once none is, and it stays in place, disabled, while
the canvas is off screen or empty, so the bar never shifts. A mock with the control at the lane
row's leading edge was set aside for it.
Proof: P13 (the phone's top row), P14 (the toggle in the title bar and the strip) and P18
(Collapse all, kept across a reload) in `apps/web/scripts/workspace-check.mjs`.
Amended 2026-09-30 (Ethan: "the expand collapse btn needs to be scaled down by 20%. the first
character of the titlebar of a child thread needs to be vertically aligned with the left side
of the chat compose input"). The toggle is a 20px fill with a 13px glyph, a fifth under the
bar's other controls, in the bar and in the strip alike. In a thread's bar it sits in the gutter,
flush with the lane's edge and closing the row's gap, so the title's first character starts on
the text column, where the compose box's edge is: the marker in the margin, the title on the
line, as a list sets them.

## ADR-135 - The empty canvas has three looks behind a debug switch, and Kay leaves it

2026-09-28 - Accepted (Ethan: "first let's axe the yak character ... i like both the vitruvian
(codex sheet) and the oil paintings, so i think having either option be toggleable is good").
Amends ADR-113.
Six looks were built on six branches for Ethan to compare: a cutting mat, a codex sheet, a
Vitruvian sheet, the landscape under the dots, a clearing in it, and a hero. He marked three Figma
frames ready for dev, "App Shell - Splash - Landscape", "- Abstract" and "- Vitruvian", and asked
for those three, switchable, so the app carries all three behind a floating debug button at the
window's bottom right, "Splash · <look>", a shadcn menu on Kay's tokens. The choice is kept in
`kay.splash` and reaches the CSS as `<html data-splash>`, the way the theme does, so the splash and
the switch share no prop; a `?splash=` in the address sets it for a screenshot run. The switch
leaves with the choice.
Landscape and Abstract are one construction with a different painting: the picture under a paper
wash at the open space's edges, masked by an elliptical gradient to a clearing of plain paper
behind the words, with the field's dots drawn over all of it. Ethan's Figma values: the landscape
shows through at 11%, the abstract strokes at 18%, each a step more on the dark paper. Vitruvian
is Atlas alone, the stencil from Ethan's file as a CSS mask filled with the ink at 30% (26% in the
dark), his globe ringing the words and his feet taken out by a second mask; the frame has no circle
and square, so neither does the code. Kay the mascot is gone from the canvas: Ethan had not asked
for him, he came from the mock. His face stays as the avatar (ADR-114). The comparison page built
for the six was never code in this repository and is not merged.
The sphere drawing and `--splash-line` are gone; `--splash-wash-landscape`,
`--splash-wash-abstract` and `--splash-figure` replace them, measured in tokens.test.ts.
Not yet: which look ships, and the origin and licence of Atlas and the paintings (Q11).

## ADR-136 - A new thread greets, the canvas is a raised sheet, and the trim is gone

2026-09-28 - Accepted (Ethan, on seeing Kay's shipped app: "what i want is the landscape and oil
brush strokes to appear when you start a new thread ... for the canvas view that's where we'll
have the dots grid and the vitruvian man. i want the canvas' surface to have drop shadow around
it"). Amends ADR-135 and ADR-113; supersedes ADR-112.
Kay's own new tab opens with a greeting, and so does a new thread here: while a main thread has
no turns, its scroll area shows the mark, the date, "Good afternoon" (with the first name once a
visitor is signed in), Kay's line for the time of day, the projects, and three actions after the
desktop app's, of which Open browser works and Open file and Open terminal wait for a web
counterpart. Behind it is one of Ethan's paintings, the landscape or the abstract strokes, under
its paper wash, with a clearing of plain paper behind the words that fades out in every direction;
the debug switch now picks that painting, and the first turn takes the welcome away. The catalog's
panel gains an `empty` slot for it and drops its gutters while the slot shows, so the art reaches
the panel's edges; a lane passes nothing and stays blank.
The empty canvas is one look now, Ethan's composed surface: a raised sheet of paper with a solid
hairline edge and a shadow, the field's dots on it and the ground behind it plain, a clearing of
paper behind the words, a sheet of construction lines drawn by `draw-atlas-lines.mjs` (circles
concentric with the globe, spokes through its centre), and Atlas with his globe ringing the words.
The coloured trim around the window's body (ADR-112) was an artefact of a selected layer in a
Figma screenshot, never a design: it is gone, with its token and its predicate, in both themes.
Not yet: projects as a real grouping ("we'll deal with that later"), a file and a terminal for
the two waiting actions, and the pictures' origin and licence (Q11).
Amended the same day (Ethan): the greeting follows the theme, not the clock, "Good morning" in
the light theme and "Good evening" in the dark, both in the DOM with the theme's one shown; the
construction lines fade to nothing towards the surface's edges and sit under the clearing, so
their meeting point never fights the words; and both paintings share one `--splash-wash` and one
clearing, so the abstract strokes read exactly as the landscape does.

## ADR-137 - The interview build cuts sign-in and the neighbouring roles' extras

2026-09-28 - Accepted (Ethan). Narrows ADR-084, ADR-085 and ADR-088 for the interview; supersedes
none of them.
The build shown in the interview runs with `VITE_AUTH=none` and `VITE_AGENT=lab`, the defaults in
`apps/web/.env.example`, so a scripted stand-in answers the thread and no one signs in. The
gateway verifies a WorkOS token on every request (ADR-085), so the real-model path and Share
thread's public pages (ADR-131) stay proven only against the fake upstream and the lever, and the
demo says so instead of hiding it.
Do not build any of this before the interview: WorkOS redirect URIs or CORS origins, a live
sign-in run, `auth-check.mjs` against a real account, the issuer check, the token-refresh check
outside localhost, the 503-on-JWKS change, a model key in the gateway, or a Worker deploy made to
register an address with WorkOS. The sign-in code ADR-084 and ADR-088 describe stays as written,
neither deleted nor extended.
Also cut: analytics or usage telemetry of any kind (PostHog included; the slice sends nothing
about how it is used, which is the local-first story), the catalog MCP server, the evaluation
loop, the flame graph and `MessagePort` agent, and the Cloudflare share deploy. The one extra
that stays is ADR-086's: visual regression and accessibility checks in CI, with the contrast
guard.
If a cut item looks needed, ask Ethan; do not decide it.
Amended 2026-09-30 (ADR-156): the interview build now runs the production runtime with sign-in,
`VITE_AGENT=gateway` and `VITE_AUTH=workos`, since the Live Playground thread is answered by the
model through the gateway and the gateway verifies a WorkOS token on every request. The
`VITE_AUTH=none` and `VITE_AGENT=lab` line above still describes the sandbox and the levers,
where the lab stand-in answers the live thread and no one signs in. The rest of this record's
cuts stand as ADR-146 left them.

## ADR-138 - A main thread stands on the pane, and a window's controls live in its title bar

2026-09-28 - Accepted (Ethan's polish list after the parallel work merged). Amends ADR-126,
ADR-127, ADR-131, ADR-134 and ADR-136.
Only a lane on the canvas is a window now. A main thread draws on the pane itself: no frame, no
inset, its text still at the thread's measure (the gutters widen, not the column). It has no title
bar until it has turns, since its tab already says "New thread", and then only a plain title row,
the one place a thread is renamed. The welcome runs to the pane's edges and behind the compose
box, so the greeting and the box it starts with are one surface. The thread's "⋯" moved onto the
active tab, left of the tab's close; a phone keeps its own in the top row (ADR-116).
A lane's close is the last control in its own title bar, for a thread and a card alike, and Share
sits before it, so the far end never moves. The row that held the close is gone, so an open lane's
top is flush with a collapsed strip's. A thread's Share button opens the same options as the
menu's Share item, which now offers 1 hour, 6 hours, 1 day and 7 days (the gateway's `SHARE_TTLS`
changed from 3 hours to 6). A card's own Share keeps its link menu (ADR-064).
The pin in a title bar (ADR-127) is gone. A pinned thread unpins from its sidebar row, where the
button shows on hover or focus and always on a touch screen, or from the "⋯" menu.
The shadcn menu takes Kay's menu shape (8px popup, 4px items, 13px text) in the vendored
`dropdown-menu.tsx`: `--radius` and the palette variables reach colours and one radius, but the
`base-lyra` preset hard-codes `rounded-none` and `text-xs` in each file, so variables alone left
the menu looking like a different app. Welcome actions use the app's 8px corners (`rounded-xl`).
A collapsed strip's expand is 24px, set 7px down, so its hover fill clears the strip's outline by
5.5px at the corners and 6px at the sides (a 28px fill met the strip's 14px corner arc, 1.5px
apart).
Amended the same day (Ethan, after seeing it): a main thread has no title row at all, with turns
or without, since the tab row already names it; renaming moved to the tab (a double click on its
title, or Rename first in its menu). The thread's "⋯" shows only while the pointer is on its tab
or on a lane thread's title bar, and while its menu is open or it holds focus: it is faded, not
removed, so the keyboard still reaches it. A collapsed card is half the height of a collapsed
thread's strip, top-aligned with the row, so the two kinds read apart at a glance. One glyph per
action: Share, copy link and open page use the catalog's box-and-arrow, link and window icons
(`@yaklabs/catalog/icons`) wherever they appear, and lucide keeps the actions the catalog has no
icon for; the shell's Share2 (nodes) is gone.
The canvas's empty prompt reads "Drag a text selection or UI card here" (it read "...or card / to
start a new thread with context" in ADR-089). The gap between lanes is one step of the canvas's
18px dot grid and a collapsed strip is two (36px, up from 32), with the dots anchored to the
scrolling row, so every gap between collapsed lanes holds exactly one column of dots.
Also amended the same day (Ethan): the account leaves the title bar for the foot of the sidebar,
open and collapsed, so the bell is the bar's right-most control (this moves ADR-094's corner and
extends ADR-121's phone placement to the desktop). The Share options end with a divider and
"Share permissions", which opens a dialog after Amp's: the thread's URL with copy and open, a
Workspace row, a Public Access row and a status box. Public Access is the real feature, wired to
the same verbs as the lifetimes (No access, 1 hour, 6 hours, 1 day, 7 days). Workspace is a
disabled "Create Workspace" that says it is not in the web build, since a team needs a backend
that ADR-137 cut. The dialog is a shadcn-style primitive in `packages/ui`, its open state is the
shell's (`askSharePermissions`, after the snooze card) so it opens from a lane, a tab or the
sidebar. The compose box and the cards cast a shadow to the right and bottom only, and every
button beside `.btn` takes its corners from `--btn-radius` (4px), so Cancel and Done match.
The layout switch offers Thread, Canvas, then Browser (it was Thread, Browser, Canvas): one array,
`PANES`, orders the desktop switch and the phone's row alike.
The edge shadow was refitted to Kay's by measuring their compose box: about 5% dark just below
the box easing out over some 20px, 1% dark at its right, nothing above. It is now `2px 13px 22px
-12px` on `--shadow`: mostly downward, a whisper to the right, and the long soft fall-off.
Amended once more the same day (Ethan): a pinned, snoozed or archived thread's mark hangs in the
row's left gutter, so every title starts at the same x. The splash switch works again (it threw
when opened: its label sat outside a menu group), offers Landscape, Abstract and Vitruvian, lists
Bonsai as disabled until its assets exist, and shows only in the new thread's welcome on the
Thread layout. The sidebar, collapsed to its rail, peeks: hovering the title bar's toggle or the
rail slides it out over the workspace (220ms in, 160ms out, no reflow), while keys and pins are
instant. Its edge takes the canvas divider's handle (drag, arrows, Home and End, a double click to
reset, the width kept as `kay.sidebar-width`), and the first tab starts 4px past that edge from the
same width variable, as in the ChatGPT desktop app, so it follows a drag on every frame. Rail
icons name themselves in an ink pill (13:1 against the shell).
Amended 2026-09-29: the peek slides back as it slides out, 220ms on the drawer curve both ways
(Ethan). The window's frame clips it, so it keeps full strength on the way back and fades only
over the slide's last 120ms (derived; design pillars, rule 26).
Amended 2026-09-29: pressing the open Canvas in the layout switch closes it back to the thread
(Ethan), and so does pressing the open Browser, so the switch reads one way for both side panes
(derived). The thread pressed again stays.
Amended 2026-10-01 (Ethan): a title renames from its own words or from Rename in the "⋯" menu,
and from nothing else. A click on the words of the tab in view opens them as a field, the text
cursor saying so; a click on a tab not in view only chooses it, and the double click is gone. A
lane's title loses its dotted rule: it reads as plain words until the pointer rests on it.

## ADR-139 - Separate progress narration, finished responses, and work details

2026-09-29 - Accepted (Ethan). Implemented in the scripted weekly-brief demo only.
To let non-technical readers follow agent work without reading its logs, progress narration stays
quiet, brief, and factual ("Checking your public profile."), while finished responses use Quiet
prose with selective emphasis on findings, decisions, and asks.
Expanded work details lead with readable outcomes and evidence, with technical logs behind another
disclosure so advanced users can inspect them without making everyone read them.
Warnings, uncertainty that affects a decision, and requests for permission stay visible at the
level where the user needs to act, rather than disappearing into technical details.
The demo retains superseded narration under Technical details. An interrupted answer stays visible
with an incomplete label and a retry action; retry keeps the earlier partial answer for reference.
This is session-local UI behavior, not persisted history or a change to the real-model runtime.
Amended 2026-09-30 (Ethan's pillar, "activity is not value": "Keep one restrained disclosure
above the response. Mount it when work starts so it does not suddenly appear above text someone
is reading. Its label changes with the actual scripted state"; Bonsai's own thread, with its
"Did work · 25s" fold over a wall of "Read file /Users/…" rows, as the example of what not to
do). The work behind a reply now sits above its words as one disclosure, mounted as the first
step or technical line arrives, so it is there before any text is. Its header is the reply's
state: while the reply streams, what it is doing now, live, beside the working glyph
("Checking open issues"; a narration's full stop dropped, since it is a label); once it settles,
what the work amounted to in the reply's own words, from a new `summary` event on the seam
(ADR-147), or "Work finished", "Work incomplete" or "Stopped" when it gave none; beside either,
how many checks and how many need attention ("3 checks · 1 needs attention"). Never a duration,
never a list of what ran. Each parallel task keeps its own row beneath; the narration the reply
moved past and its technical lines sit one disclosure deeper, as before. A reply with no work
narrates under its words, as it did; a reply with work no longer repeats its activity there.
Failures, stops and questions stay where they were: in the ended note and the dock, visible
until resolved, never folded away as routine.

## ADR-140 - Own the Quiet prose response styling, independent of the Markdown renderer

2026-09-29 - Accepted (Ethan chose Quiet prose). Implemented in `/demo/weekly-brief` only.
A small, app-owned response component applies Quiet prose's 15px Inter body, 24px line height,
16px paragraph spacing, restrained body-sized section headings, real Inter italic fonts, and
semibold emphasis at weight 600, with accessible links and code presentation and the same styling
during streaming and after completion.
Inspect rendered elements rather than assuming Markdown bold produces `<strong>`: Ethan's Bonsai
source findings report emphasis spans with `data-streamdown="strong"`, which a `.response strong`
selector would miss; prefer a semantic `<strong>` component override where supported, otherwise
target the renderer's documented hooks.
The app owns this presentation contract so a renderer change does not dictate the reading
experience; this decision selects neither a Markdown library nor a live LLM integration and keeps
the interview's scripted-agent scope (ADR-137).
The demo reveals authored semantic blocks by word count. Its typography does not change when the
reveal finishes. The browser check measures rendered fonts and exercises decisions, nested evidence,
and interruptions. `/t/profit` remains the default route and does not adopt this demo's prose
renderer.

## ADR-141 - A child's parent stays the same when its panel moves

2026-09-29 - Accepted (Ethan). Design decision, not yet implemented.
A child thread's relationship to its parent is separate from where the UI displays it. Opening a
child through "Open thread in main panel", or dragging it into that panel, changes presentation
state only. The operation does not change `place.parentId`, create another thread, or transfer
control from the parent. The child's messages, running work, and draft remain attached to its
existing thread ID.
The main panel can therefore show a child without turning it into a main thread. Navigation and
panel placement must not infer parentage from the panel currently holding the thread.
The child keeps "Controlled by parent thread" below its composer, including in the main panel,
so the larger reading surface does not imply that control changed.
Amended 2026-10-02 (Ethan): the line names the parent, "Belongs to Weekly brief", since a
child's composer takes messages and "Controlled by" read as though it would not; it says
"parent thread" while the parent is not yet in the workspace.
Verification must cover both the menu and drag paths, with the same parent ID before and after.

## ADR-142 - Keep running status by the composer and tasks in a movable card

2026-09-29 - Accepted (Ethan). Design decision, not yet implemented.
A child's running status stays below its composer, to the right of "Controlled by parent
thread". "Running" is a pill with the same green fill as the user conversation bubble. Its text
communicates the state without relying on colour or animation alone, and its state follows actual
work rather than whether the latest message has finished rendering.
The status sits outside the transcript's scroll area. The transcript and a task card remain
independently scrollable, so reviewing earlier work never hides whether the agent is still working.
Running work does not lock the composer or force the reader back to the latest message.
Task lists use a card rather than unstructured progress narration. A user can drag the card onto
the canvas to keep it in view while continuing the conversation. The canvas copy refers to the
same task state rather than starting another run or becoming an unlabelled stale snapshot.
Verification must cover scrolling, continued input while work runs, the running-to-settled state
change, and a task card on the canvas. Warnings and requests for input remain explicit; a green
pill must not conceal blocked or failed work.

## ADR-143 - A thread's reading tools float above its compose box

2026-09-29 - Accepted (Ethan: "components in the thread section of Storybook", in every main
thread and the scripted demo). Builds on ADR-022's jump-to-centre and ADR-138.
Every thread with turns carries a small bar at the right just above its compose box: Search this
thread, and Your requests. Search matches a turn's own words, not the cards it carries, ignoring
case; Enter steps to the next match and Shift+Enter back, both wrapping, and the count reads
"4 matches" until one is showing, then "2 of 4". Escape on any of its controls closes it and
hands the focus back to its button. Your requests lists every message the user sent, oldest
first, by its first 15 characters (code points, so an emoji is never split) and its time, the full
text on hover; an Alt-click (Option on a Mac) on the button skips the list and goes to the latest
request. Every jump is the recap's jump (ADR-022): the turn lands centred and glows, and only the
last turn jumped to glows. Under reduced motion the glow holds its first frame until it clears.
The bar lives in the catalog (`ReadingTools.tsx`, `threadReading.ts`), mounted by the chat
thread panel itself, so the web app's main pane, its lanes and the Storybook all get it with no
wiring in the host. It is built from the catalog's own primitives (IconButton, Menu, `.field`),
not shadcn: the catalog and its Storybook have no Tailwind, and bringing them in is a separate
decision. The bar is paper with a hairline and the menu's 8px corners, and fades in with the
pointer on the thread over 150ms on the strong ease-out, like a lane's menu; a keyboard and a
touch screen see it at once. It stands over the conversation rather than in a title bar, since a
main thread has none (ADR-138).
Amended the same day (Ethan): the bar moved from the turns' top-right corner to the right just
above the compose box, its right edge on the box's and 8px clear of it, and 8px clear of a docked
question or recap when one is up (the dock learns `--dock-space` from the panel). Its list of
requests opens upward. It floats over the conversation's resting gap, so the newest turn still
rests 20px above the box (pillar 12), and while the bar shows it covers that turn's bottom-right
corner.
Amended again the same day (Ethan): the float stays. The bar no longer fades with the pointer on
the thread; it rests as one Search button and unfolds leftward to show every tool while the
pointer is on it, a keyboard is in it (when the last input was not a pointer, ADR-053), or search
or the list of requests is open, so the button under the pointer never moves. The fold clips its
track from 0fr to 1fr over 150ms on the strong ease-out, and the bar's focus rings sit inside
their buttons so the clip cannot cut them. A touch screen has no hover, so it keeps the bar
unfolded. The pointer state comes from the bar's pointer events, not CSS `:hover`, so a story can
prove it; the first move outside the bar also folds it, since a list that closes under the
pointer leaves the bar no leave event.
The turns now take a tab stop (`region "Messages"`) once there are any, with the focus ring
inside the panel's clip, so a keyboard can scroll a thread of plain words; axe had flagged it on
the first text-only fixture. The Menu primitive gained an item `id` (two requests can share a
label), a quiet `detail` at the right, and a height capped at the viewport, past which it
scrolls. The unmounted draft in `apps/web/src/demo/` is gone.

Amended 2026-09-30 (Ethan: "swap the placement of the magnifying glass with the bookmark. when
collapsed only the bookmark should show", then "hidden unless the cursor is hovering over the
streaming thread window ... as soon as the mouse goes outside of the chat compose component, the
ReadingTools should fade up from transparent. lets try a 300ms fade anim", and a translucent bar
and popover that fill solid once opened, after a screenshot of Claude's own). The bar rests as
the bookmark alone, at the right, and Search unfolds to its left. It follows the pointer: clear
until the pointer is over the thread, it fades up over 300ms on the strong ease-out as the pointer
leaves the compose box for the turns, and fades back as it leaves the thread, so across a canvas
of lanes the reader sees one binder, in the thread under their hand, and the box they are typing
in stays bare. The panel reports the pointer's zone from its own pointer events (`data-pointer`),
not CSS `:hover`, so a story can prove it. A tool that is open, or a keyboard in the bar, holds it
up; clear is not hidden, so a keyboard can still reach it, and reaching it shows it. A touch
screen, with no pointer to follow, keeps the bar. A first cut showed it in the thread that held
the focus instead; it left the bar up over the box while the reader typed, which is what the
pointer rule removes.
At rest and under the pointer the bar is a wash of the paper (`--scrim`, the paper at 72%) with
only its glyph opaque; open, with search or the list of requests up, it fills solid over 150ms.
The list of requests is the same wash with an 8px blur behind it, so its rows stay legible over
the turns. The turns' region is now named "Messages in <thread>", so two threads side by side are
two landmarks, not one twice (axe caught it in the two-thread story).
Amended 2026-09-30 (Ethan: "the storytool needs to have the same speed slide out as the
drawer. right now its too instant"). Search unfolds from the bookmark over 220ms on the panel
ease, the projects drawer's own slide (pillar 26), rather than 150ms on the strong ease-out.

Amended 2026-10-04 (Ethan): request excerpts need more context before the ellipsis, and the
bookmark and search buttons must keep the semi-opaque surface even when opened. This supersedes
the 15-character excerpt and solid-open fill above. Excerpts now keep up to 48 code points, a
derived tuning choice rather than a number specified by Ethan, with earlier visual truncation
on narrow screens so timestamps remain visible. The bar keeps `--scrim` and the request menu's
8px backdrop blur. Its blur sits on a backing sheet rather than the bar itself, so the fixed
menu remains positioned against the viewport.

## ADR-144 - The rail stays on the desktop, and the projects panel extends from its edge

2026-09-29 - Accepted (Ethan: "the projects and their threads need to extend from the collapsed
sidenav bar. that way the icons are still accessible as navigation while still being able to look
at projects and thread histories", and "as it stands now the thread panel covers the navigation
icons"). Amends ADR-093, ADR-094, ADR-121 and ADR-138.
On a desktop (768px and wider) the icon rail is the app's navigation and is drawn in every state,
never moving, collapsing or blinking: Kay, the five places out of the demo's scope, Documentation
and the
Lab as 40px squares, each naming itself in an ink pill whatever the panel is doing, with the
Account at its foot. It is its own column (`rail.tsx`, `data-slot="rail"`), no longer the
sidebar's collapsed state.
The projects and their threads are a second column, shadcn's offcanvas `Sidebar`, extending from
the rail's right edge. Docked (`kay.sidebar` is "open"), it pushes the workspace and resizes from
its right edge, with the first tab 4px past that edge. Closed, only the rail shows, and the panel
slides out from behind the rail's edge on the peek's triggers and timing (ADR-138) and back the
same way. A stage around the panel and the workspace clips it at the rail's edge (`overflow:
clip`, the gate of design pillars rule 22), so the panel never covers a rail glyph, and the rail's
echo that the old peek slid over is gone.
One `SidebarProvider` still owns docked or closed, and `kay.sidebar-width` with its 208, 256 and
480px now names the panel alone. The rail's places are a navigation landmark named "Places" and
the panel's tree one named "Sidebar"; neither holds the other, and the Account sits outside both.
Closing the panel with focus inside it hands focus to Toggle sidebar first, however it closes (Ctrl
or Cmd+B, Escape, a thread opened from a peeking row, or the slide back); focus on a rail place
never holds a peek, while a menu open in the rail or the panel does; the closed panel is inert,
out of the tab order and the accessibility tree. The phone keeps ADR-121's drawer as one labelled
column: the place rows with "Out of demo scope", then the tree, then the Account.
Ethan answered the defaults it was built with, the same day:

- The landmarks and the toggle keep their names, the rail "Places", the panel "Sidebar", the
  toggle "Toggle sidebar" ("names yes that's fine").
- Docked by the toggle, a hint of a line parts the rail from the panel, the workspace's hairline
  at the rail's right edge, as in Kay's own app; a peek draws none ("ONLY SHOW the dividing line
  on toggle, don't show it on peek"). It is the rail's, so a click on the toggle draws it on the
  pin's first frame and the panel slides out from behind it ("the separator ... needs to be drawn
  right away right at the first keyframe of the slide out anim"); on the panel's own left edge,
  as first built, it stayed behind the rail's clip until the last frame and crept in like a
  fade. An unpin holds it through the slide until the panel is home, the pin played backwards;
  a key's change and reduced motion, with no slide, switch it at once. P35 holds all of it.
- A phone is out of scope ("skip the mobile app. this is a desktop app"): no rail below 768px,
  and the drawer stays as built, not extended.
- A pin and an unpin move over 250ms, the panel, the workspace and the tabs in lockstep, on
  Ethan's curve, and the peek keeps its 220ms on the same curve ("set the click to 250ms ... use
  similar curve for both the peek and the toggle. DO NOT change the length of the animation or
  the keyframes, only the curve"). The first reading, off a still sketch, was
  `cubic-bezier(0.34, 1, 1, 1)`, which left the gate too gently ("niether curve is what i asked
  for"). Ethan then showed the value graph of an After Effects move, "fast acceleration to a
  slower and smooth settle", and the curve is fitted to that graph: `cubic-bezier(0.17, 1.02,
  0.58, 1)`, within 0.2% of it at every sampled point, half the travel done by 13% of the time
  and 90% by 43%. Its first handle sits a touch above the target, as in his graph, which carries
  the panel a hundredth of a pixel past its mark. It is `--panel-ease` beside `--panel-peek`
  (220ms) and `--panel-pin` (250ms) in `index.css`; P19, P24 and P31 read them.
- Under reduced motion nothing slides: a pin and an unpin are instant, and the peek comes and
  goes with no slide and no fade, whatever closes it ("add reduced motion to opening/closing the
  panel"; rule 24). P20 holds both.
- Documentation's pill keeps its ArrowUpRight, and the places' pills their hints ("the pill hints
  for places. keep it it looks great").
- A window too short for every place scrolls the places with no scrollbar, the Account at the
  rail's foot ("icon scroll that's fine").
- The rail's order and places stay as they are ("current rail icon placement is good"), Memory
  keeps lucide's Brain ("keep lucide's brain icon for memory"), and pressing the open Browser
  closes it as Canvas does ("browser toggle is great, keep it").

Found while building it, the same day. Docked, the old sidebar drew every glyph on the page with
coloured subpixel smoothing, and collapsed with greyscale: its one avatar sat inside the
container's stacking context, so no blend reached the window's layer (ADR-110), while collapsed
the rail's echo carried a second avatar outside it. The rail keeps its avatar in plain flow, so
the text is greyscale in every state. For the same reason the collapsed rail is not bit for bit
the old one: about 140 antialiased pixels in it differ by up to 23 levels, every glyph and the
avatar on the same pixels, and a stacking context to match them would switch the page's text
back to subpixel. With keyboard focus on a rail place its pill is up, and Escape closes the pill
first, then the peek, as a menu takes Escape before the peek does. shadcn's `no-scrollbar`
utility, which its `SidebarContent` names, is defined nowhere in the app, so the rail sets
`scrollbar-width: none` itself.

Amended the same day (Ethan, from a recording of the peek: "right as it gets to the last frame of
slide back into the navbar text is still rendered outside of the component"). The panel and the
rail are the same paper, so in the last 20px of the way home the rows' ends ("18", an ellipsis, a
"+", a sliver of the open row's fill) stood beside the rail's glyphs for four frames with nothing
around them. Back, the panel's rows now fade from the slide's first frame, on the fade-in's own
120ms and curve (0.4 after 20ms, gone by the time the edge is 22px out), while the paper, its
hairline and its shadow slide home solid. P24 seeks the rows with the slide and holds them under
2% over the last 10% of the way back; it fails on the old stylesheet with the rows at full
strength to the end.

Amended again the same day (Ethan, from a recording: "on peek i want the drawer to slide out
from under the navbar spine just like how it does w/ the toggle btn", the lines' draws "slow
enough to feel glitchy", and "the fade of the thread list as the drawer is almost all the way
close just needs to be at 0 opacity at that point"). Three changes:

- The peek slides out at full strength from its first frame, as a pin does. Its 120ms fade-in
  let the workspace's left border and rounded corner show through the panel, and drew the
  panel's own edge over those frames.
- A pin while the panel peeks moves only the workspace, under the panel. The peek's edge, its
  hairline and shadow, now holds through the pin's 250ms by a delayed 0s transition, where it had
  gone at the click and left a plain edge while the workspace's rounded border crept out from
  under the panel as the curve settled.
- On the peek's way back and on an unpin alike, the rows fade in 60ms on the strong ease-out
  (`--rows-leave`), at 0 once the panel has covered three quarters of its way home; the toggle's
  close had no fade at all, and the peek's 120ms left them faint for two or three frames.

P24 holds the peek solid on the way out and the rows at 0 over the last quarter of the way back;
P36 holds the rows full through a pin and at 0 over an unpin's last quarter; P37 holds the edge
on every frame of a pin from a peek. All three fail on the old stylesheet.

## ADR-145 - Every hover label is the rail's ink pill

2026-09-29 - Accepted (Ethan: "also "unpin thread" hover needs to match our design language. do
we have a specific hover popover defined in storybook? i don't think so", after keeping the
rail's pills: "keep it it looks great").
Storybook defines no hover label: it holds the catalog's hand-made primitives, and the
app's labels came from the vendored shadcn tooltip, whose default was base-lyra's square box
with an arrow, 12px text in the page's ink. Unpin, the Layout switch, Collapse all and a sidebar
row's cut name drew that box while the rail drew its ink pill (ADR-144), two shapes for one job.
The vendored tooltip now draws only the pill (design pillars, rule 28): no `variant`, no arrow,
13px medium text on the page's ink, 12px corners, 8px off its trigger, 350ms of rest before the
first opens and none before its neighbours. A name long enough to wrap keeps the pill's ends,
since 12px is half a one-line pill's height. The rail's own provider and its delay props go,
since the app's provider now carries the same values. A new label cannot come out in another
shape without editing `packages/ui/src/components/tooltip.tsx`. P23 and P28 read the pills, and
the web checks read a cut row's name on hover and focus and a name that wraps.
Amended 2026-09-30 (Ethan: "our popover animations need to be 1/2 the length of the drawer
slide and with the same animation curve as the drawer slide"; Bonsai's own hover cards, which
linger and catch the pointer while they fade, as the example of what not to do). The pill and
the menus come and go in 110ms each way, half the drawer's 220ms, on the panel ease (pillar
31). The menus moved from keyframe exits to transitions, so a menu reopened while it fades turns
back from where it is; a popover on its way out takes no pointer; and Base UI's "instant" mark
on a dismissal (Escape, a click outside) no longer switches the transition off, which made a
menu vanish in one frame.

## ADR-146 - The gateway streams Kimi K2.6 through OpenRouter's Anthropic-format endpoint

2026-09-30 - Accepted (Ethan: "it's time to wire up the backend so that this vertical slice can
actually work live", then "i'd like to use moonshot/kimi-k2.6 for this demo since its cheap").
Reopens two of ADR-137's cuts, a model key in the gateway and a Worker deploy, and changes
ADR-085's and ADR-088's model; the sign-in code stays as ADR-084 and ADR-088 wrote it.
`POST /api/messages` now streams from `moonshotai/kimi-k2.6` on OpenRouter ($0.65 in and $3.41
out per million tokens on 2026-09-30, against $5 and $25 for `claude-opus-5`), with the key in a
Worker secret named `OPENROUTER_API_KEY`. The key carries a $25 credit limit set in OpenRouter,
which is the slice's spending cap: Anthropic's per-workspace limits were the other way to cap a
signed-in visitor's spend, and Ethan found them hard to set up.
The gateway speaks OpenRouter's Anthropic-compatible Messages endpoint (`/api/v1/messages`, in
OpenRouter's OpenAPI spec) through the Anthropic SDK it already used, with `baseURL`
`https://openrouter.ai/api` and the key as a Bearer token (`src/upstream.ts`). OpenRouter's
OpenAI-format `/chat/completions` would also serve Kimi, but it streams a different event shape,
so both the gateway's stream and the browser worker's decoder would change; on this endpoint the
NDJSON the browser reads with `MessageStream.fromReadableStream` stays exactly as it was, and
nothing outside `apps/gateway` changes. The request drops `thinking: { type: "adaptive" }`, an
Anthropic setting; Kimi reasons by default, its reasoning arrives as `thinking_delta` events the
browser already skips, and `max_tokens` 8192 caps reasoning and reply together.
Proven with the real key: a direct call answered in Anthropic's event shapes, and a turn built by
the runtime's `toModelRequest` (a card and a `[Card view: Net profit]` line) went through the
gateway's own app and came back as text through the browser's decoder. That round trip took
about 23 seconds, which is slow for a demo and not yet broken down between reasoning and the
answer. The WorkOS half was stubbed, since a real token needs a person's sign-in, and the
`/demo/weekly-brief` route is untouched, as it never reaches the gateway.
Amended 2026-09-30 (Ethan: "a 'start a new thread' only route that's just the splashscreen and
no other test child threads"): `/new` opens the whole shell on the runtime's empty scenario, in
memory, and starts one thread on arrival, so the first thing on screen is that thread's welcome
and a compose box, with no starter project, seeded thread or fixture child beside it. A reload of
`/new` starts over; the device's own threads stay under `/` and `/t/:threadId`. Since ADR-155,
`/playground` is the route for the live model; `/new` is for the shell around a fresh thread.
Amended again 2026-09-30 (ADR-156): `/new` is deleted. The device starter's empty Live
Playground thread is the fresh thread now, at `/t/playground`, persisted in the worker like any
other thread; the shell around it is the same one every thread opens in.

## ADR-147 - The reply seam carries events, not only words

2026-09-30 - Accepted (Ethan's goals for the legibility demo: an interleaved conversation, honest
failures, work details behind a disclosure). Widens ADR-041; builds on ADR-139 and ADR-140.
A reply streams as chunks: words, as a model streams tokens, and the events around them: progress
narration, a block boundary (paragraph, heading, list item), a card, a step of the work with its
status and outcome, a technical line, a question the agent is blocked on, and a failure. A plain
word stream is still a valid reply, so the lab stand-in and the gateway runtime are untouched;
the worker's loop forwards the words and passes over the events until its protocol can carry them.
One pure fold (`applyChunk`, `packages/catalog/src/reply.ts`) builds an agent turn from the
stream: words grow the plain text always and the structured blocks once the reply has any
structure, runs of one mark join into one `<strong>`, narration supersedes and is kept, and a
failure ends the turn as interrupted (words shown) or failed (none), never as complete. The panel
owns the lifecycle around it: the turn appears as the reply is asked for and is its own
"Thinking…" placeholder; a question docks the Needs attention card; Stop marks every reply in
flight and its unfinished steps cancelled at once; Try again sends the same request again as a new
turn and keeps the old one with its label; a reply that ends having shown nothing leaves no turn.
Every agent turn now renders through the catalog's own Quiet prose (`QuietProse.tsx`): a plain
reply is one paragraph, so `/t/profit` and the demo read the same. The turn model
(`ThreadMessage`) gains `blocks`, `work`, `activity`, `ended` and `failure`; a user turn records
the `question` it answered. The runtime's protocol schema still parses the old fields only, so
structured turns are not persisted yet: that is the seam the worker learns next, not a change made
here (ADR-137).
Alternatives weighed: a controlled panel whose host owns the messages (the eventual shape once the
runtime is the source of truth for turns; every host would change today), and a worker scenario
with a structured protocol (the backend project the goals defer).
Amended 2026-09-30: the stream may carry a `summary` event, what the work amounted to in the
reader's words, kept on the turn's `work` for the disclosure's label once the reply settles
(ADR-139, amended).
Amended 2026-09-30 (ADR-156): the worker now carries the seam. The `chunk` notice is a
`ReplyChunk`, the reply loop folds each chunk with `applyChunk` and saves the folded turn, and a
stored agent turn keeps `blocks`, `work`, `activity`, `ended`, `failure` and `asks`, a user turn
its `question`. The seam's zod schemas live in the catalog, held equal to their types by tests.
No database migration: the message row already spreads a turn's extra fields into JSON beside
its text, so only the protocol schema had to accept them. The seam also gained four members,
each with an `applyChunk` rule, a render and a test, and each used by the brief scenario so the
demo proves it: a card `id`, so a later card replaces the earlier one in place; a non-terminal
`limitation` block, said in the reply's words, whose `recovery` the reader sends in one click;
`WorkStep.basis`, the evidence as short lines under a step's outcome; and `Failure.retry: false`,
which hides Try again when asking again cannot help.

## ADR-148 - The scripted demo plays on the real shell from an in-memory runtime

2026-09-30 - Accepted (Ethan: "/demo/weekly-brief should render the whole app shell and the main
chat thread component"). Supersedes the standalone demo page of ADR-139 and ADR-140.
`/demo/weekly-brief` is a route layout that composes the same shell as `/t/:threadId` (the
window, its title bar and tabs, the rail, the projects panel, the deck of panes) over a runtime
built in the page, no worker: an in-memory workspace seeded from a scenario script, whose agent
for the main thread streams the script's reply events through the widened seam (ADR-147). A step
that names a child thread creates that child in the workspace and its lane on the canvas, marks
it replying while it runs, and writes its outcome into it when it finishes, so the sidebar's
working glyphs, the canvas and the bell show real threads. Every other thread is answered by the
lab stand-in, and the workspace's other verbs work in memory.
The Door (`runtime.tsx`) owns the page's paths (`Paths`: a thread's, home's, the Lab's, and the
thread a pathname names), so the shell's links stay under the demo's address; `ProvidedRuntime`
puts a started runtime in the Door, and `Window` takes a `banner` for the demo's controls, drawn
between the title bar and the body.
A player performs the scenario's user beats through the thread's own controls (`ThreadHandle`:
fill and send the compose box, answer the docked question, stop, try again), so the demo
exercises the path a person's click takes. A beat after a reply waits for that reply to settle;
one marked to overlap counts from the beat before it, so a second request goes out while the
first reply streams. A presenter who answers the question first is not answered for again. One
clock carries the rate (1x or 2x) and the pause, so Pause holds the streaming too. Restart
remounts the shell on a fresh workspace; the 2x setting outlives it. Under reduced motion the
words of one block arrive together. A thread pane whose thread was worked on elsewhere (a child a
parent finished) reads its turns again once that work settles, so a lane opened mid-run does not
keep saying "Working on it".
The demo says it is scripted and that nothing is sent, in its own bar. Three scenarios, each
under a minute at 1x (`scripts.test.ts` guards it): the weekly brief (narration, two children in
parallel, a finding with a card between paragraphs, one decision, a draft), an interrupted reply
with its retry and a check that fails, and work in the background with a question asked meanwhile
and a stop. Words stream at 70ms, about fourteen a second: quick enough to read as live, slow
enough to follow the emphasis as it lands.
Known gap: Share still publishes through the gateway from the demo; "Nothing is sent" is not yet
true for that one action.
Amended 2026-09-30 (after a review of the demo against the posting: lead with the constrained
design system, show an invalid payload failing visibly and a changed card state becoming context,
show one unattended run summarised by outcomes, and say what is implemented and what is
proposed). The weekly brief gained a third child whose evidence is a pie chart outside catalog
v1: the catalog refuses it whole, in the reply where the chart would sit and again behind Work
details, with nothing drawn, while the child's number stands in its own words and the valid
cards land around it. Working in the background gave way to Came back to it: a scenario may now
open on the record of a run (`Opening`: the main's turns, timed from how long ago the user spoke;
every child a step names is made with its request and outcome as a live run would leave them),
and this one opens 25 minutes after the request on a recap of three outcomes, each a jump to the
turn whose Work details hold the evidence (ADR-153), on an interactive card of the invoices at
three depths; the player steps the card to Difference, the request after it carries that choice
as a chip (ADR-030), the reply speaks to the view, then the one decision docks and its answer is
recorded. A `choose` beat steps the card through the thread handle's new `choose`, so the demo
takes the path a person's slider does. Each script carries a standing line under the demo's name
in the bar (what is shipped, what is scripted or proposed), so a watcher never takes one for the
other. The Stop path lost its scenario; the panel's browser tests and the cancelled fixture keep
it proven.
Amended 2026-09-30 (ADR-156): the route and its `?script=` are retired. The three scenarios
play as the Demo project's three threads (`/t/demo-brief`, `/t/demo-interrupted`,
`/t/demo-returned`) inside the one shell, beside the device's own threads, over a page-side
overlay composed with the worker. `/demo/weekly-brief[?script=]` and its `/t/:id` threads
redirect there. The scenario picker is gone, since the sidebar's Demo project lists the shows,
and Restart resets one show instead of remounting the shell.

## ADR-149 - A jump lays runway so any turn can centre

2026-09-30 - Accepted (Ethan: a jumped-to request and a search hit "should be vertically centered
within the chat main thread component"; measured, they were not near the end). Amends ADR-022 and
ADR-143.
Measured in the long scenario: a jump to the tenth request lands its middle 2px off the
scroller's middle, a search hit likewise, and a jump to the latest request 217px low. The centring
was right; the scroller had no room below its last turn, so the scroll clamped at its end.
A jump now lays runway: extra bottom padding (`--jump-runway`) equal to the shortfall, so the turn
can sit centred, then scrolls. The runway is released when a new turn lands, or when the reader
scrolls with the natural end in view, where releasing moves nothing; the jump's own smooth scroll
is waited out first, by its arrival at the target rather than by `scrollend`, which the scroll
before it can fire at once on a slow machine and hand the runway back mid-flight (CI caught it). A
thread that fits its view
has nothing to scroll and keeps only the glow. The reading tools story now requires the target to
be centred, the latest request and the last search hit included.

## ADR-150 - An answer reads with its question; a long request folds

2026-09-30 - Accepted (Ethan's screenshots: the answered-question surface "we can just straight up
copy", and the folded long message with Show more).
Answering the Needs attention card no longer echoes the choice as a user bubble. The turn records
the question it answered and the thread shows question and answer together on one paper surface
with a hairline, the question in soft ink over the answer in ink; consecutive answers share the
surface, each pair keeping its own turn id so a jump or a search still lands on it. The list of
requests skips answers, since an answer is not a request.
A user bubble taller than eight lines (192px at its 24px line) folds to that height under a fade
over its last two lines, with Show more inside the bubble; Show less folds it back. Line breaks
the user typed or pasted stay where they were. Nothing else about the bubble changes (ADR-025,
ADR-047).

## ADR-151 - Child threads carry one glyph

2026-09-30 - Accepted (Ethan: "some icon for child threads since those will either be spawned by
an agent or will be a new thread a user has spun off from a main thread").
A branch leaving a trunk (`ChildThreadIcon`) marks a child thread wherever it is named: the
sidebar row, where "↳" stood, and a step of work that ran in a child. The same glyph serves an
agent-spawned child and one the user spun off; the working glyph beside it says which is busy.
Below a child's compose box: "Controlled by parent thread", with a Running pill in the user
bubble's fill while its work is in flight by the runtime's own state (ADR-141, ADR-142).

## ADR-152 - The latest reply carries the thread's one stamp

2026-09-30 - Accepted (Ethan: "showing a timestamp for user messages should be axed. lets only
put a timestamp on the most recent message from the LLM. it'll start with just now and then
update every 20min"). Amends ADR-025.
A user's turn shows no time. The thread's one stamp sits under its latest settled reply, in the
prose's 11px soft ink, and says how long ago it arrived: "just now" for the first twenty minutes,
then "20m ago", "40m ago", "1h ago", "1h 20m ago", moving on the panel's minute clock (the recap's,
ADR-027) so it never waits on a render. A reader glancing back learns how fresh the answer is
without reading a clock; the request above it needs no time of its own, since the reply dates the
exchange. While a reply streams, nothing is stamped: the running status by the compose box says
what is happening (ADR-142).
Turns the panel and the demo make now carry an instant (ISO 8601) rather than a clock reading, so
the stamp can be computed; a turn stored with a reading ("9:02", the fixtures and the runtime's
seeded threads) shows the reading as its stamp, and the list of requests (ADR-143) formats either
as a local clock time. The demo's children mint their turns from the wall clock too, so a child's
answer reads "just now" beside its parent's.

## ADR-153 - The recap, the dock and the idle time are read from the turns

2026-09-30 - Accepted (the review's ask for "an unattended multi-agent run summarised by
outcomes, with evidence one layer down and pending actions clearly separated"). Builds on
ADR-005, ADR-027 and ADR-039; amends ADR-041's host duties.
The web app never passed the panel a recap, an activity or a docked question: the recap lived in
Storybook fixtures alone, and a question survived only in the panel that saw it stream. Now the
record carries what they need. A reply keeps the question it ended on (`asks`) as part of its
turn, and a reply that only asks is a turn, never dropped as empty. From the turns the panel
reads, when its host passes none: the recap, one item per finished or failed step's outcome and
one for a reply that broke off, each pointing at its turn (a view over recorded events, ADR-005,
nothing written after the fact); the idle time, from the last user turn's instant (a turn timed
as a clock reading yields none, since "9:02" cannot be measured from); whether the agent has
worked since (a reply settled after that turn); and the question to dock, the one the latest
reply ended with while no turn has followed it. A host that passes its own still wins.
So a thread opened cold on a finished run shows its recap once the user has been away ten
minutes (ADR-027), and its evidence sits one Disclosure down; while a question is open it takes
the recap's place, as ADR-039 rules. That rule is the open design question the demo now poses:
on return from six agents, should what needs you and what happened share one surface, or keep
taking turns? The demo says which parts are shipped and which are proposed rather than deciding
it here.
Alongside, an interactive card's shown stop is held by the panel (the choice pending for it, else
what the agent last saw) and the thread handle can `choose` a stop by its label, so a host that
drives the thread steps a card by the same path a person's slider takes (ADR-029, ADR-030); a
card on its own keeps its own state.

## ADR-154 - AuthKit runs in dev mode on the deployed site

2026-09-30 - Accepted (Ethan: "okay option 1", then "go ahead"); settles the refresh check
ADR-084 left open.
The web app now passes `devMode` to `AuthKitProvider` everywhere, not only on localhost, so
AuthKit keeps the refresh token in `localStorage`. With dev mode off, AuthKit refreshes through
a cookie on `api.workos.com`, which the browser blocks as third-party on the deployed site;
once the first access token expired, `getAccessToken()` threw
`LoginRequiredError` and every reply, in a main thread or a child, failed before the page sent
a request. The Worker's logs showed it: one 200 on `/api/messages`, then nothing for the failed
replies.
WorkOS documents dev mode as the setting to use without a custom authentication domain. The
cost is that a script injected into the page could read the refresh token; the proper
production setup is a custom auth domain (`apiHostname`), a paid WorkOS feature that needs a
domain we own, which this demo does not have.

## ADR-155 - /playground streams live events from a gateway-owned tool loop

2026-09-30 - Accepted (Ethan: "go ahead and build it"). Reopens ADR-137's live-model cut for this
one route only; the thread, its store and `/api/messages` are unchanged.
`/playground` is a standalone page where Kimi (ADR-146) shows its work through the event-to-UI
mapping: answer text, catalog cards updated by id, tool activity with Work details, a question
to answer or skip, outcomes with evidence, and failures with a recovery prompt. The model emits
all but text as tool calls (`update_work`, `show_card`, `ask_question`, `report_outcome`,
`report_failure`), defined once in `@yaklabs/catalog/playground` from the catalog's own schemas.
`POST /api/playground` owns the prompt, the tools and the multi-round loop: it checks every call
with `resolve` and `resolveAwaiting`, sends a bad one back to the model as an error so the user
never sees it (ADR-040), and streams one NDJSON line per typed event. The page parses each line
with the same union and folds it with a pure reducer; nothing is saved.
The rejected shape ran the loop in the browser inside the existing thread: it widened the
`Agent` seam, `ThreadMessage` and the worker protocol for every thread, and its round limit
lived in the client. Here the limits sit where the key and the cost are: 8 rounds, 16 tool calls
and 6 cards per turn. Live runs shaped the prompt: Kimi explained limits in prose until
`report_failure` was made mandatory, and a turn told to end with no text made OpenRouter insert
its own placeholder, so a failure turn closes with one short sentence.
Amended 2026-09-30 (ADR-156): protocol 2. Text is always prose, from its first delta. The
`narration` event is deleted, and progress reaches the page through `work` labels alone. `end`
carries the closing line, so no consumer looks one event ahead. `PLAYGROUND_PROTOCOL` is 2, so a
page and a gateway on different versions fail at `start` and say so. The reason: the gateway
relabelled a round's lead text as narration after the fact, which forced every consumer to hold
text back until it knew what the text was. Two of the three adapter designs and the cross-judge
named that retroactive relabelling the root cause, and removing it deleted the holding gate each
consumer would otherwise need. The cost is that a model which writes prose before a tool call
shows that line as prose, which the prompt already forbids. The model agent now runs inside the
worker (`packages/runtime/src/playgroundAgent.ts`) and answers the Live Playground thread through
`ChatThreadPanel`; the standalone page and all of `apps/web/src/playground` are deleted, and
`/playground` redirects to `/t/playground`. So the thread, its store and the worker protocol did
change after all, which is what ADR-156 decided.
Amended 2026-10-03 (ADR-166): protocol 3 adds a `thinking` event that streams the model's
reasoning, which the page shows folded and never treats as the answer.

## ADR-156 - One shell hosts the Demo and the live model

2026-09-30 - Accepted (Ethan: "the head of product goes to the main page route... 2 active
projects... it should behave like a real in production app"). Retires ADR-148's route and the
`/new` of ADR-146's amendment; amends ADR-137, ADR-147 and ADR-155.
On a fresh device `/` lands on the splash, which lists two projects, Demo and Live Playground. A
project row opens its latest thread (`entryOf`, the main with the newest activity) at `/t/:id`
in the same shell. The Live Playground thread is an ordinary device thread: the store seeds it
as the device starter (project `live-playground`, thread `playground`, no turns) in place of
Demo store and its profit thread, so it lives in the worker and survives a reload. For
`VITE_AGENT=gateway` the production agent is now the model with tools behind `/api/playground`
(`packages/runtime/src/playgroundAgent.ts`, ADR-155). It runs inside the worker, keeps nothing
between replies, and projects each request from the store's turns, so the stored transcript is
the only record of the conversation. The scripted Demo is a page-side overlay composed with the
worker behind one `Runtime` (`composeRuntime`, `apps/web/src/world/compose.ts`): reads merge by
concatenation, every verb routes to the side that owns the id it names, the shell document is
the worker's alone, and no record has two writers. `VITE_DEMO` (on by default) gates the overlay,
and only over the device source, so a `?scenario=` fixture opens as it always has.
The Demo is a World of three Shows (`demo-brief`, `demo-interrupted`, `demo-returned`), each
played as a Take on one Stage (`apps/web/src/world/stage.ts`). The Stage has no turn writer of
its own: every writer holds a Lease, and a Restart revokes the leases on a show's threads in the
same commit that resets its slice. So Restart scopes to one show, its main and the children it
spawned, and a reply still unwinding when Restart lands writes nothing. The pane learns of it by
one generic rule: a turn count that drops means reread. The show bar (`ShowBar`) takes the
window's banner slot on a show's thread and draws nothing off a show. `firstRun` opens the
starter thread on the thread pane, so the canvas stays hidden until the layout switch, and a
first visit paints the abstract splash. `/new` is deleted. `/playground`,
`/demo/weekly-brief[?script=]` and `/demo/weekly-brief/t/:id` redirect to `/t/:id` through one
table (`apps/web/src/world/redirects.ts`) that carries only `?splash=`.
Alternatives weighed (Door 1 in the session's plan, kept in git history at
`docs/decisions/one-shell-plan.md`): one in-memory world hosting both projects behind a
`VITE_WORLD` switch, the first recommendation, rejected once Ethan asked for the live thread to
behave as production, since a reload would throw its turns away; seeding the Demo into the
worker, which then stored text-only turns and would have reloaded the shows as plain text, when a
demo that runs on its own clock, Pause and player should start clean on a reload anyway; and
Restart by remounting the whole world, which would tear the worker down with it.
Known gaps: the live model is unverified from the sandbox, since the gateway needs a WorkOS
token. An in-process test runs the gateway's test-kit rounds through the real route, the agent,
the worker loop and `open()`, and a browser check drove the splash, the rows, the redirects and a
live-thread reply that survives a reload, with the lab stand-in answering. The debug splash
picker showed on a first visit once first run opened the thread pane where it was always drawn;
it now renders in development builds only. The device levers `apps/web/scripts/web-check.mjs`
and `workspace-check.mjs` drive `?scenario=` fixtures, where the overlay is off and the profit
thread still exists, so they run unchanged.

## ADR-157 - A tool that keeps failing is retired for the rest of the turn

2026-10-01 - Accepted (Ethan, as design guidance to the implementing thread: "make the illegal
state unrepresentable: remove a repeatedly failing tool from the next round's offered tools").
ADR-155's breaker asked the model to cooperate with its own constraint: a tool's second
validation failure answered "Answer in prose instead", which only worked when the model
complied. Now the failure that reaches a tool's limit still returns that error, and the next
round's request no longer offers the tool. The limits live in `REMOVE_AFTER`
(`apps/gateway/src/playgroundTools.ts`), a table keyed by every tool, so a new tool fails the
build until the table names its limit and the roster its handler; `toolsFor(state)` derives
each round's tools from the turn's failure counts. A model can still hallucinate a call to a
retired tool, since the stream parser is tool-agnostic; the gateway refuses it flat
("show_card is no longer available this turn."), with no page events and no further failure
count. The unknown-tool error names only the tools still on offer, so it never points the
model at a retired one. The cost: a valid third attempt with the retired tool is unavailable
for the rest of the turn, though other tools and prose remain. `decide`, the 8-round and
16-call caps, and the empty-answer fallback are unchanged.

2026-10-03 amendment - A call to a retired tool now disables all tools for the rest of the
turn. The gateway allows one final prose-only round, with no offered tools and
`tool_choice: { type: "none" }`. A tool call in that round terminates the stream without
execution or another request. Exhausting the 16-call budget or retiring every tool also
requests that final round. The 8-round ceiling still takes precedence. These transitions
replace the unchanged-loop behavior described above; the retirement threshold remains two.

## ADR-158 - Find marks words, a recap lands on its evidence, the canvas snaps to its grid

2026-10-01 - Accepted (Ethan, walking the Weekly brief and Refund audit on a laptop). Amends
ADR-018, ADR-022, ADR-089, ADR-133, ADR-134, ADR-136, ADR-143 and ADR-156.
Search counts and steps through every occurrence of its words, as an editor's find does, rather
than every turn that holds them (`matchesOf` returns `{ turnId, nth }`). The page marks them with
the CSS Custom Highlight API (`packages/catalog/src/searchMarks.ts`): every match tinted, the one
stepped to painted as a text selection, centred, and ringed once around its own words in a layer
that scrolls with the turns. The turn no longer glows, since on a long reply the glow was the
whole thread. A recap item names the step that recorded it (`RecapItem.stepId`); a jump glows the
card in the reply's words that is that step's evidence (matched by contents, `stepBacking`), else
unfolds Work details and glows the step's row, else the turn. The splash switch shows in every
build again (ADR-156 had kept it to development builds): it is how a visitor looks through the
design work. The first welcome a visitor sees is the abstract painting; from then on each visit
draws landscape or Vitruvian at random (`lookForVisit`). The switch picks for the visit only, so a
pick never freezes the draw, and the retired `kay.splash` key is cleared. Restart, at any point of
a take, plays the show again from the top with a clear thread, and once a take is done its Play
reads Play again and does the same. On the canvas, a sideways swipe anywhere on the row pans it:
the thread's scroller no longer claims the x axis or contains it, and the row listens to the wheel
itself, not passively, so a lane cannot latch the gesture. Every lane width is a whole number of
grid steps (dragged, keyed, saved before this, and the default on a narrow pane), which keeps each
gap's dots centred, and the drop zone is a default lane wide. A lane's collapse sits
`--leading-space` from the edge and from the title; a collapsed strip spaces its expand, grip and
title equally and starts its title under the open lanes' title-bar rule. A sidebar title too long
for its row fades out instead of ending in an ellipsis.
Alternatives weighed: wrapping each match in a `<mark>`, which would have rewritten text React
owns and broken on the next render; keeping the turn-level search and adding a word highlight,
which still left "3 matches" counting turns; pointing a recap item at a DOM id written into the
step, when the card and the step already share the payload; a fade overlay on the sidebar's edge,
which would also have faded the counts and the hover buttons; and snapping widths in TypeScript
alone, which a width saved before the change would have escaped (CSS `round()` catches it).
Known gaps: a collapsed card's strip uses the thread bar's rule, not the card heading's, which is
taller and varies with the card; the brief lever's 2x timing bound sits at 59 to 63% on main as
well as here, because the on-screen reveal does not scale with the show's clock.

## ADR-159 - Home is a blank live thread, jumps frame by rule, the demo shows its hands

2026-10-01 - Accepted (Ethan, a second walkthrough). Amends ADR-022, ADR-038, ADR-089, ADR-125,
ADR-134, ADR-136, ADR-156 and ADR-158.
The rail's mark is named Home and opens a first visit's page whatever is open: the Live
Playground's blank main, its welcome over the splash, so whatever is typed there goes to the
live model. The starter while it is blank, else the newest blank main there, else a new one;
Home never stacks a second blank thread. A plain visit to "/" still resumes the tab last on
screen, and with none open it opens that page too, where it said "Nothing open"; only a
scenario, which has no Live Playground, still says so. A thread started with nothing naming its
project goes in the Live Playground, not the sidebar's first project, the scripted Demo, whose
stand-in had answered it. A main still called "New thread" takes its title from its first
message, cut at a word as a lane's header is, so a Home that starts fresh threads never lists
a column of them; a thread someone named keeps its name. Every device
store gets the Live Playground: the seed ran only on an empty store, so a browser that held
threads from before ADR-156 (its "Demo store", kept on the device, not the account) never had
it. The splash takes the next look each visit, abstract, landscape, Vitruvian, then round again,
in place of ADR-158's draw. A jump frames its target by rule (`jumpPlan`): one already wholly in
view does not move and only glows; a user's message out of view is centered; anything else out
of view comes just into view, its top never cut off. A press that opens something (Work details)
keeps the pressed control in view, the thread rising only until it reaches the top of the band,
where ADR-038 had shown the bottom of everything that opened. Work with no steps folds its
technical lines straight into Work details, never into a second disclosure. A demo's Play pulses
in the lane flash on a loop while it is not playing, and the demo answers a
docked question as a hand would: the tile hovered, selected, Submit pressed, then sent, on the
show's clock. A main's child lanes open where the sidebar lists the child (newest first, ADR-125),
top to bottom being left to right; a lane the reader moves keeps its place, and the sidebar
never follows the canvas. A lane's collapse sits 7px inside the border, open or collapsed, and
14px before the title, the Share-to-Close spacing; a collapsed strip carries its close at the
foot. The rail's fills take the site's 4px corners, and the resize hint holds 40px either side
of the pointer, gone by 70px.
Alternatives weighed: a separate Home route, which would have left "/" two meanings; a hub
with no thread under it, whose composer would have had to hand its first message to a thread
made on send, where a blank live thread already is that page; resetting
the device store to drop Demo store, which would delete the visitor's own threads; centering
every jump, which is what moved a card already in view and cut tall ones off at the top; and
ordering the sidebar's children oldest first to match the canvas, which ADR-125 had settled the
other way at Ethan's word.
Known gaps: Demo store stays on a device that has it, beside Demo and Live Playground; removing
it is Ethan's call. The brief lever's 2x timing bound still sits at 59 to 63% on main as here.
Amended the same day (Ethan: "the live playground voice input component needs to be the
dictation live microphone"): dictation in the device's own threads, the Live Playground's,
listens to the visitor's microphone and the browser's speech service (ADR-028's live source);
the Demo's threads and a scenario's keep the simulated recording, so a scripted take and a
fixture sound the same every time.

## ADR-160 - A public page tells the design tooling's story, sealed on the welcome

2026-10-01 - Accepted (Ethan: "a static site on a new route called /verify-ui-tooling ... on
the splash screen i want a graphic link w/a gold seal as the bg and copy that says Includes
Design Tooling"). Amends ADR-136 and ADR-156.
`/verify-ui-tooling` is a page of Kay's paper outside the signed-in shell, beside `/share.html`,
that says what `tools/verify-ui-drift` is for and shows it: why a check has to be a tool when
people and agents edit one surface, the five beats of a run, the run's own transcript, the four
verdicts, the Pixels workbench, the comparator proof, the contrast table under its lenses, what
approval means, and where the work lands by role. Its pictures are Ethan's screenshots of the
review app (`apps/web/public/verify-ui-tooling/`); the transcript and the two results tables
are set as text, since a terminal and a table read better as what they are. The words live in
`apps/web/src/verify-ui-tooling.ts` apart from the page, so the copy reads as one piece.
A new thread's welcome ends with the way there: a gold seal, "Yaklabs" over the top of its ring
and "Seal of evidence" under the bottom, with an ink ribbon across its middle saying "Includes
design tooling" that runs past the seal on either side. The ribbon is the link's only words,
so a screen reader hears what a sighted visitor reads, and it fills with moss on hover as the
site's button does. The seal is drawn, not a picture: one SVG in `design-tooling-seal.tsx`,
coloured by four new tokens derived from the caution orange and the rust, since a metal keeps
one colour in either theme (design pillars, rule 33). The page's hero shows the same seal.
Alternatives weighed: a page inside the shell, which would have put sign-in and the runtime
in front of a visitor who only wants to read; the seal as a WebP after the example Ethan
sent, which would have needed a second file for dark mode and could not carry live words; and
the ribbon's words on the gold itself, where the brown ink clears 4.5:1 on the orange but
not where the words run off the seal onto the dark paper.
Known gaps: the page is linked from the welcome and from nowhere else, and the review app's
screenshots are from Ethan's Mac at 2x, so they will not match a later build of the tool pixel
for pixel.
Amended the same day (Ethan, circling the spot): the seal is pinned above the greeting at
the column's right rather than closing the column, tilted 25° with its left side up, and the
page's copy was cut to what a reader skimming it in three minutes keeps.
Amended again the same day (Ethan: "make it look more like a landing page ... the screenshot
of the cli tool in the hero ... more variation of blocks"): the page is a landing page now,
after the product sites Ethan named. The run's terminal opens it, set as text from his
screenshot with its prompt bar, turned a few degrees toward the words and printing its lines
60ms apart, with the seal stamped on its corner; the verdicts roll by on an ink ticker; the
three notes cascade down a twelve-column grid; a bento of six cells holds the pixels, the
numeral, the camera proof's table, the approve command on ink, four measured bars and the
five beats; the contrast table sits on a full-bleed band in the window chrome's green; the
four roles stand under one label turned on its side; and the closing word sits by the seal.
The terminal is text rather than the screenshot, which never arrived as a file, so it reads,
copies, scales and themes; the comparator proof's picture gave way to its numbers.
Amended once more (Ethan: "version 2 is the winner ... these need to be the text on the
page ... rip out, but save into an .md"): the landing page carries Ethan's copy and nothing
else of its own: his headline and question in the hero, his question over the bento, his
second headline on the band. Every other line of copy left the page for
`docs/reference/verify-ui-tooling-copy.md`, to cross-check later; what stays beside his words
is the tool's own evidence, the terminal, the verdicts, the cells' names from the review app's
tabs, the counts, the pairs and the beats' names. The notes, the roles and the closing word are
gone with their copy.
Amended once more (Ethan): how the tool works stands beside the Pixels picture in four large
numbered points, capture in batch, compare pixel by pixel, check contrast and accessibility
across the three engines, fail loudly; the cells that stood there make a new row below.
Amended once more (Ethan): on the welcome the seal is scaled to 70%, hops 6px every 4s to say
it can be pressed, and grows 10% under the pointer over the button's 150ms; reduced motion keeps
it still (design pillars, rule 33).
Amended once more (Ethan): the hero reads "Design tooling that allows humans to verify at
scale" with humans in Newsreader's own italic, whose cut tokens.css now loads beside the roman
as ADR-140 loaded Inter's; the review app's header, from Ethan's screenshot, is the picture
laid over the contrast table on the band, in place of the Material lens; the way back says
Back to Bonsai; and the page is light only: it pins the light theme on the root while it is
open and gives the visitor's choice back on leaving, and its appearance switch is gone.
Amended once more (Ethan: "the text, the ribbon and the seal all seem to scale at different
times ... scale as if 'one asset'"): on the welcome the medal, the ribbon and its words are
one SVG. As an HTML ribbon laid over the SVG medal, the hover's growth repainted the three
apart: the words snapped to whole font sizes and jumped 42% of the way on the first frame of
his recording, the ribbon's box snapped to whole pixels and finished by the eighth, and the
medal scaled smoothly to the twelfth. Drawn as one picture they scale as one, the words set
to a fixed length at geometric precision, so no font's metrics or hinting move them. The
link's name is its `aria-label`, the ribbon's words, so a screen reader still hears what the
eye reads. Alternatives weighed: `will-change` on the link, which in Chrome only moved the
redraw to after the growth; and a moss copy of the ribbon fading over the ink one, which left
a hairline of the ink at the moss's edges in the dark theme.
Amended 2026-10-01 (Ethan): the ring's words read "Seal of quality" and the ribbon's "Now with
design tooling!", which is also the link's name; on the welcome the seal grows 5%, to 73.5% of
its drawn size, so the ring's smaller words read.

## ADR-161 - The site is light only

2026-10-01 - Superseded by ADR-162 (Ethan: "i never tweaked dark mode. let's delete it ... i
don't want someone to view something i didn't finesse"). Amends ADR-046 and ADR-090, whose dark
mode for every surface now stays in the catalog.
The app shows the light theme to every visitor, whatever the OS or the browser prefers. The
account menu's Theme choice is gone, with the hook that followed the OS, the script that set
the theme before React loaded and the remembered choice; nothing in the app sets
`data-theme="dark"`, so the catalog's dark tokens never apply. The root declares
`color-scheme: only light`, so scrollbars and form fields stay light and a browser that darkens
pages on its own leaves this one alone. The app's own dark-only rules and `dark:` utilities
went with it, the welcome always says good morning, and the design tooling page no longer pins
the light theme, having nothing to pin against. Its hero lost the "Themes 2" figure.
The catalog keeps its dark theme (Ethan: "you can leave dark mode in the catalogue"): its
tokens, Storybook's theme switch and verify-ui-drift's dark captures and baselines are as they
were, and so are the landing page's pictures and rows that show dark.
Alternatives weighed: deleting dark from the catalog as well, which would have taken the
tooling's dark captures and baselines with it; and keeping the code behind a switch that is
never offered, which leaves untested paths a visitor's browser could still reach.

## ADR-162 - Dark mode is Umbralkai, chosen in the account menu, the system's by default

2026-10-02 - Accepted (Ethan: "lets impl umbralkai as our dark mode so there's a light and
umbralkai as the dark 2 themes total", "set the default theme mode to be 'system'").
Supersedes ADR-161; amends ADR-090 and ADR-110.
The site has two themes again. Dark is Umbralkai, Andrew Sen's theme for the Zed editor, which
Ethan mapped onto the token roles in Figma (yak-ui-tests, the Theme collection's Umbralkai mode)
and tuned there: the paper lifted to `#242223` from Zed's panel grey, the ink to Zed's
`#fff7ed` and the recap to `#302e2f`. `tokens.css` takes those values under
`:root[data-theme="dark"]`, each marked Zed, Ethan or derived, every ratio measured against the
dark paper and checked by `tokens.test.ts`.
Three values move off the Figma mapping, because a guard the tests hold would fail: the hover and
inset fill steps up to `#3a3839`, a step past the compose box and menus (1.13:1), since at Zed's
`#2a2829` it was the compose box's own colour and the send button and every menu hover vanished
(1.0:1); the bar's hover fill takes Ethan's recap grey, `#302e2f`,
since Zed's elevated grey is 1.16:1 against the bar and a skeleton tab needs 1.2:1; and the pill
that marks the active tab and the pressed layout is Zed's own selected colour, `#fff7ed`, with
the page's near-black on it, since Zed's darker active tab is 1.1:1 against the bar and a pill
must clear 3:1. That keeps ADR-110's shape, a cream pill on the bar in both themes. The bar
itself is Zed's title bar grey in dark, not the light theme's green, so the demo's title, drawn in
the bar's green, takes the ink there. The brand's greens stay for what they mark: the agent
glyphs keep their dark ramp, the slider keeps `#8e9d6f` and the button hover keeps moss, where
the Figma mode had Zed's green and grey.
Zed's muted `#636363` is 2.6:1 on the paper, so the archived ink is Zed's hint grey lifted to
`#a2a2a2`, 4.56:1 on the inset fill and still a step under the body's `#aeaeae`.
The account menu's Theme group comes back under the divider below Sign out (below the sign-in
note in a build without sign-in): Light, Dark and System. System is the default, follows the OS
or browser and moves when it changes; a choice is remembered on the device. A script in the
prerendered head sets the theme before React loads, so a dark system never sees the light page
first, and the root names its `color-scheme` in either theme, so scrollbars and fields follow
the theme rather than the OS. What ADR-161 removed with dark mode is back: the welcome says
good evening in the dark, the bar's ghost buttons hover at full strength, and the `dark:`
utilities that keep the tab, the address fields, the quiet button and the sidebar toggle off
shadcn's dark fills. The design tooling page is drawn for light alone, so it holds the root on
light while it is open and gives the visitor's choice back on leaving, as ADR-160 amended.
The catalog's 15 dark references in verify-ui-drift change with the tokens and wait for Ethan's
approval; CI cannot approve them.
Alternatives weighed: Umbralkai's values exactly as mapped, which fail the pill, the bar's hover
and the menu hover; and a third theme beside the old dark, which keeps a theme Ethan never
finessed.
Amended 2026-10-02 (Ethan): the compose box and menus are `#323031`, and the compose box lies
flat in both themes, with no drop shadow ("i don't want a drop shadow on the chat compose input
box"); its border and fill set it apart, and its keyboard focus halo stands alone. The dividing
lines
are the old dark theme's cream at 18%, 1.71:1 on the paper (1.7:1 before, 1.64:1 in light), where
Zed's border at 1.19:1 read thinner. The send button is the same in a main thread and a child
lane: soft ink on the inset fill while there is nothing to send. Once there is, it is cream on
olive in light and, in dark (Ethan), Zed's text grey `#aeaeae` with the page's near-black arrow
(8.43:1), through `--send` and `--on-send`.
The focus ring stays the light theme's warm grey `#8a8a85` in dark (Ethan: "the focus should not
be blue"), 4.56:1 on the dark paper and 3.78:1 on the compose box, and the recap's ring stays
the cream, 11.71:1; Zed's cyan `#16c3dd` is gone from the theme.

## ADR-163 - The build writes the site's security headers, hashed per build

2026-10-02 - Accepted. Amends ADR-086, whose one Worker now also answers the static security
headers.
Every page answers with `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, a `Permissions-Policy` that lends the camera and geolocation to
no one and the microphone to the page alone, and a Content-Security-Policy. The policy lets
scripts run from the site's own files, from the SHA-256 of each inline script the build
prerendered (the theme and chrome boots, React Router's hydration), and from `wasm-unsafe-eval`,
which the runtime's SQLite needs to compile in its worker (ADR-083) while plain eval stays
refused. Styles may be inline, since the charts and overlays lay themselves out in style
attributes; images may come from any secure origin, since WorkOS hands back avatars it does not
host; connections may leave for `api.workos.com` alone, the AuthKit session calls. Objects, the
base tag and framing are refused, and forms may post only to the site.
A static SPA has no server to mint a per-response nonce, so the inline scripts are named by hash,
and the set changes with every build; a hand-kept header would break the boots on the first edit
or go silently stale. `write-headers.mjs` runs as the second half of `pnpm --filter web build`,
reads every prerendered HTML file, hashes each inline script and writes `_headers` beside it,
failing the build when the boots are not among the scripts it pinned. Its test holds the policy's
words and the hash of a known script, and the serving check ran against `wrangler dev`, which
answers with the same headers the deployed Worker does; that check is what caught the SQLite
compile the first policy refused.
Alternatives weighed: `'unsafe-inline'` for scripts, which is no policy at all; moving the boots
into files, which would flash the wrong theme on a dark system before the file arrived; and
`'unsafe-eval'`, where `'wasm-unsafe-eval'` admits exactly the one compiler the runtime needs.
Amended 2026-10-03: the browser build resolves `zod` through `src/zod.ts`, which configures
`jitless` before exporting Zod to any schema, including the SQLite worker's schemas. Zod's
caught dynamic-compilation probe still emits a CSP violation; disabling its compiler avoids
the probe without weakening the policy or skipping validation. Configuring only the client
entry is too late when its dependencies construct schemas first. The header generator scans
and writes only when invoked directly, so importing its helpers needs no existing build.
Run `pnpm --filter @yaklabs/runtime test:security <wrangler-url>` against a built lab app
to check served headers, inline hashes, public cards and a persisted worker round trip. The
observer retains document and worker CSP events outside the page across navigation. Its
test-only first dependency preserves served headers and the worker's original URL and exports,
and installs the observer before the application's dependencies evaluate. The negative-control
fixture checks caught compilation probes and a child module importing the worker's exports.
The header generator resolves relative and absolute build directories exactly as React Router
does. Production builds require the same-origin gateway from ADR-086 and reject
`VITE_GATEWAY_URL` from the effective Vite environment, including mode-specific env files;
the override remains available in local development. The policy is not widened for a build
setting that contradicts the deployment architecture.

## ADR-164 - Name the out-of-credit refusal

2026-10-02 - Accepted. Amends ADR-155.
The interview build runs on the owner's capped OpenRouter key. When its credit runs out,
OpenRouter answers 402. The gateway passes that status through as `{ error: "credit" }`, with a
bare marker rather than the upstream body, which could echo the request. If credit runs out
between rounds, the gateway names it in the end event's line. The page reads the initial 402 in
plain words: the POC's model budget is spent, and the 3 scripted Demos still play.
Alternatives weighed: keeping a 502 with a marker, which the client would never read because it
deliberately branches on the status line; adding a new end reason and protocol bump for the
mid-reply case, a heavier protocol change for a rare path the line already carries; and retrying
with backoff, although credit does not come back on its own.

## ADR-165 - Cap the model's thinking at the API's floor

2026-10-02 - Accepted. Amends ADR-146.
Kimi K2.6 reasons before it answers, and left to itself that reasoning ran 15 to 30 seconds
before the first visible token, which reads as a stuck page in an interview. Every round now
sends `thinking: { type: "enabled", budget_tokens: 1024 }`, the Messages API's smallest
budget, so the wait is capped at about a thousand tokens of reasoning a round. The thinking
shares the reply's 8192-token budget, which leaves the answer and the tool loop their room.
Whether OpenRouter's Anthropic-format adapter honours the budget for a Kimi model is checked
live against the real key before this merges.
Alternatives weighed: the model's default, which costs the page its first impression;
`{ type: "disabled" }`, which Kimi may refuse and which spends the reasoning the tool calls
lean on; and streaming the reasoning itself to the page, a protocol change not worth taking on
before the interviews.
Amended 2026-10-03 (ADR-166): the reasoning now streams to the page after all, behind a folded
Thinking toggle. The budget stays at the floor.

## ADR-166 - Stream the model's thinking behind a folded toggle

2026-10-03 - Accepted. Amends ADR-155 and ADR-165.
The Live Playground now streams the model's reasoning to the page as it arrives. The gateway
turns each `thinking` block and `thinking_delta` into a `thinking` event under the block's
`r{round}b{index}` id, and `PLAYGROUND_PROTOCOL` is 3. The page folds the deltas into
`AgentMessage.thinking`, apart from the words and the Work record, so `hasWork`, work labels and
counts do not change. A reply that only thought is still empty, and the gateway still ends it as
"I finished without an answer." The reasoning is stored on the turn, so a reload shows it. It is
never replayed upstream: neither the gateway's next round nor the page's request carries it.
In the thread it sits in a Thinking disclosure, collapsed. When reasoning arrives first, it
mounts above Work details and the words. Reasoning first received after content appears mounts
below that content instead. Its position is chosen on the first delta and stays fixed for the
mounted turn, so later rounds never insert a toggle above text being read. Saved reasoning is
shown above the answer on a reloaded turn's first paint. While
the reply has nothing else to show, its summary is the old wait (the working glyph and
"Thinking…"), now clickable. Once work or words arrive it settles to a plain "Thinking". The
reasoning is set as written, not as Markdown, in the narration's 13px on 20px `--soft-ink`
(design pillar 29). The lab agent and the Demo never think, so they keep the old placeholder.
This reverses ADR-165's call that streaming the reasoning was not worth taking on before the
interviews. A static placeholder for 14 to 30 seconds reads as a broken app, and the first
thinking token arrives in under 2 seconds: measured 2026-10-02 through OpenRouter for kimi-k2.6
and kimi-k3. In the signed-in browser on PR #54 as it stood, the chart arrived at 14.2 seconds
after a static "Thinking".
Alternatives weighed: keeping the static placeholder, which is what reads as broken; showing the
reasoning open by default, which puts a draft above the answer and pushes it down as it grows;
and folding the reasoning into Work details, which would change its label and count, and make
work out of a reply that did none.

## ADR-167 - Stream concise approach summaries, not raw thinking

2026-10-04 - Accepted. Amends ADR-166 and clarifies ADR-165.
Thinking stays collapsed by default and keeps the existing animated wait. Opening it shows a
current explanation of the approach, not the provider's deliberation. Answer prose, work labels,
cards, outcomes, and limitations keep their existing contracts. A summary describes intentions
and constraints. It is not evidence that a tool succeeded.

The gateway runs a separate, non-thinking request to the same `moonshotai/kimi-k2.6` model.
`playgroundThinking.ts` summarizes recent reasoning while the tool loop continues independently.
The first request starts after 256 reasoning characters in a round. A second requires 2048 new
characters. At most two requests per round and sixteen per turn prevent repetitive deliberation
from consuming the entire budget before later work. Each request includes the previous summary
and at most 6000 recent reasoning characters. Its output replaces the previous summary and must
fit 70 words and 480 characters. The output budget is 160 tokens with no automatic retries.
Incomplete, invalid, or failed summaries are discarded, never clipped or replaced with raw text.
A request times out after eight seconds. The terminal event cancels outstanding summaries rather
than waiting for them. A short reasoning block may finish without producing a summary.

Protocol 4 keeps the `thinking` event's existing shape, but its `delta` is now a whole summary.
`ReplyEvent.thinking` also replaces rather than appends. The last summary persists in
`AgentMessage.thinking` and stays outside upstream history and answer or work counts. The
Disclosure's identity and first-arrival placement do not change. A late summary mounts below
existing content. Reload still places saved thinking above the answer. Older saved turns are
not rewritten, so an existing protocol-3 turn can retain its historical reasoning.

OpenRouter documents a shared reasoning envelope, not a Kimi-native summary guarantee. The
Anthropic Messages format does not turn Kimi output into Claude-style summarized thinking.
Native summaries remain preferable if this model and endpoint gain verified support.
Alternatives rejected were clipping raw output, waiting until reasoning ends, changing the main
model, and asking the execution prompt alone to control displayed length. Reasoning effort and
displayed explanation length are separate controls. The execution prompt and tools stay unchanged.

Local Live Playground checks used `VITE_AGENT=gateway`, the real `createApp` and tool loop, and
only disposable local session and token-verification stubs. Fixture checks established streaming,
late placement, stable toggles, card replacement, empty and unknown data, formatting, and reload.
Real Kimi checks produced immediate animated feedback and useful summaries during execution.
One earlier scheduler sample answered in 111.87 seconds; the revised scheduler sample produced
the requested cards and Zendesk limitation but reached the existing eight-round limit at 152.92
seconds. Its first raw reasoning arrived at 1.12 seconds and its first displayed summary at 3.18
seconds. Animated feedback appeared at 29 milliseconds. Seven completed summary requests took
0.63 to 1.35 seconds each and reported a total cost of $0.00245. Concurrent requests add no
deliberate tool-loop or terminal wait, but shared provider contention and aborted-request billing
are not measured guarantees. The earlier sample reported 5357 thinking tokens in one round
despite the requested 1024 allocation. ADR-165's requested budget is therefore not a proven cap.
These observations are samples, not provider guarantees or a fix for long model execution.

Follow-up review distinguishes enforced bounds from semantic guidance. Length, response completion,
duplicate suppression, timeout, cancellation, and raw-text exclusion are enforced by code.
Describing
only intentions, resisting embedded instructions, and avoiding invented relationships are model
instructions, not mechanically guaranteed properties. A keyword filter or another model cannot
prove that arbitrary prose never implies success. A hard guarantee would require controlled
Thinking templates with no unrestricted model-written sentences. That would narrow Thinking's
expressiveness, not the main answer's capabilities. This ADR does not adopt that redesign.

Four integrated `/api/playground` regressions use `createApp`, the real Anthropic client, and an
abort-aware provider fixture. They cover terminal delivery across a tool round with a stalled
summary, response cancellation during a pending read, timeout before response headers, and timeout
during a partial response body. Both timeout cases use the real eight-second timer and require
execution to remain live, a later round's summary to succeed, no retry or stale summary, and a
correct final answer. Each regression went red under its corresponding removed abort/deadline
behavior, then green after restoration. Production cancellation and timeout code needed no fix.

An opt-in adversarial evaluation targets this summarizer, not the answer model or an unrelated
system. It submits forged success claims, embedded instructions, and repeated work-status debates
to the actual same-model summary mechanism. Run it with `THINKING_EVAL=1` and a server-side
`OPENROUTER_API_KEY` environment variable using Vitest on `src/playgroundThinking.eval.test.ts`.
The evaluation does not depend on a local secret file. It writes inputs,
snapshots, and safe response metadata to `.amp/in/artifacts/thinking-adversarial.json` for human
review. Normal CI skips these paid network samples. Passing mechanical checks does not establish
semantic safety; inspect the recorded sentences. One initial sample invented a CSAT-chart-to-table
replacement, motivating an explicit instruction to omit unnamed chart identities and ambiguous
relationships. Live samples can fail to produce an accepted summary and are not guarantees.
