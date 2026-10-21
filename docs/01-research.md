# Phase 1 - Research and framing

## Source caveat

Written on day one from search-result snippets, before Kay's own pages were read; the facts from
those pages are in `docs/05-kay-stack-and-data.md`, which supersedes this file where they differ.
Everything about Glass (Ramp) comes from search snippets of public writeups.
Items marked **(inferred)** are extrapolated from Glass, not confirmed for Kay.

## What Kay is today

- YakLabs' product is **Kay** ("YakLabs - Building Kay" is the site title).
- A desktop AI workspace: "a single pane of glass for all of your AI work."
- "Frontier AI on your desktop without setup, API keys, or jargon."
- "Runs workflows, calls tools, and learns how you work - starting simple and revealing depth as you
  go."
- The interface "evolves with your experience"; you "put together your own shortcuts" and end up
  with "a setup that's uniquely yours."
- Kay "moulds itself around you and your process, and gives you the agency to define your own
  tools."
- Tools and best practices can be shared with "your team, community, and experts."

## Glass, the ancestor (inferred DNA for Kay)

- Auto-configured on SSO login, integrations already connected on day one.
- **Split-pane workspace**: several chats side by side, plus documents, data, and code open next to
  them.
- **Dojo**: a marketplace of 350+ skills, each a markdown file that teaches the agent one task.
- **Sensei**: a guide that recommends skills based on your connected tools, role, and recent work.
- **Persistent memory** built from connected sources (people, projects, Slack, Notion, Linear).
- **Scheduled automations**.
- Philosophy: "raise the floor without lowering the ceiling" - no dummy-proofing.

## Their vocabulary

Workspace, panes, skills, tools, workflows, memory, automations, shortcuts, connections, sharing.
Avoid inventing names for their concepts; mirror theirs.

## Where the three problems live in the product

| Problem | Where it shows up |
| --- | --- |
| Agent work legible | Parallel panes plus scheduled automations mean work happens while you are not looking. The "coming back from a meeting" moment. |
| Design system agents build with | User-defined tools and shared skills mean non-designers (and agents) create surfaces. At Ramp's scale: 1,000+ agents shipped per month. |
| An agent that sounds right | Memory already ingests your Slack, email, and docs, so the raw corpus of your voice exists. Drafting messages is a top use case. |

## Framings

### 1. Making agent work legible

- **Tension**: trust needs evidence, but attention is the scarcest resource. The deeper split is
  process (what the agent did) versus consequence (what changed in the world).
- **User**: an ops lead who kicked off three tasks before a meeting and returns 45 minutes later.
- **Idea A - Receipts, not transcripts**: a return briefing that leads with outcomes and side
  effects (sent, changed, spent, waiting on you), with the step-by-step trace one disclosure layer
  down.
- **Idea B - Reversibility as hierarchy**: rank everything by how undoable it is. Irreversible
  upcoming actions rise to a small queue; reversible work collapses into a quiet summary.

### 2. A design system agents can build with

- **Tension**: generativity versus coherence. Review bandwidth is fixed; surface creation is not.
- **Users**: two of them - the person seeing an agent-made surface, and the agent itself as a
  consumer of the system.
- **Idea A - Intent-level primitives**: agents compose from semantic components (Approval,
  Comparison, Draft, Progress) and the system owns layout, spacing, and motion.
- **Idea B - Taste as a runtime check**: a render-time linter that catches hierarchy violations (two
  primary actions, unlabelled destructive buttons) before a human sees them.

### 3. An agent that sounds right

- **Tension**: sounding like you versus being transparent that it is not you. Also personalization
  without a settings page nobody fills in.
- **User**: someone who would never write a style guide for themselves.
- **Idea A - Learn from edits**: the diff between the draft and what was actually sent becomes voice
  signal, surfaced as a small, nudgeable "voice card."
- **Idea B - Registers per audience**: the same person writes differently to their boss, their team,
  and a vendor; the agent picks the register and shows which one it used.

## Recommendation

Problem 1, agent legibility, makes the strongest interview demo.

- It is the wedge itself: "complex AI workflows feel effortless" lives or dies here.
- Timing, hierarchy, and progressive disclosure are not decoration on this problem; they are the
  problem. It shows exactly the skills the posting asks for.
- It demos well with scripted data - no live model needed, so nothing can break on stage.
- Bonus: building the demo on a small token-based system touches problem 2 for free.

Runner-up: voice. It is distinctive, but convincing demos need a real model and real writing
samples.

## Update - first look at Kay (screenshot from the head of product's post)

Interpretations marked "likely" are guesses from pixels.

- Threads appear as browser-style tabs across the top.
- Split pane: chat on the left, a built-in web browser with an address bar on the right. Confirms
  the split-pane DNA from Glass.
- Compose bar: "What would you like to do?", attach, "Medium" (likely reasoning effort), "Allow"
  (likely a permission mode), "6%" (likely context usage), microphone for dictation, send.
- A narrow icon rail on the left with the Kay logo.
- The sample answer is roughly 600 words of dense aviation jargon, and the outcome the user cares
  about ("your seat was the right one... land first") is the last line. A strong before/after
  candidate for ADR-006 (outcomes first), framed as "here is what I would try".
