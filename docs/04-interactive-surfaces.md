# Research - interactive surfaces (marimo and "HTML over Markdown")

Question: how can Kay answer requests like "make a graph of last week's sales, with a slider underneath from net to gross profit" with a rich, interactive surface, without losing coherence?

## marimo's "Interactive elements" (from Ethan's screen recording of the hero video)

- One slider ("n items", 1,000 to 20,000) drives three things at once: the scatter plot thins or fills live, a sentence ("There are 20000 data points in our embedding") updates its number, and the slider label updates.
- The control sits inside the prose, directly under the sentence it changes, not in a separate settings panel.
- The same document has two views: the app view shows only outputs; the editor view shows each cell with its code (`mo.ui.slider(...)`, a sentence reading `n_items.value`, a chart recomputed from it).
- Reactivity belongs to the runtime: moving the slider re-runs every cell that reads it, like a spreadsheet.

## Thariq Shihipar, "Using Claude Code: The unreasonable effectiveness of HTML" (claude.dev, May 2026)

- Markdown stops working past about a hundred lines; HTML carries tables, SVG diagrams, layout, and interaction, and is easier to share.
- Use cases: explorations side by side, code review with annotated diffs, design prototypes with sliders, reports and explainers, and throwaway custom editors.
- The throwaway editors always end with an export ("copy as JSON", "copy as prompt") so the UI's result flows back to the agent.
- The stated reason: HTML keeps him "in the loop" with Claude instead of skimming plans he no longer reads.
- His audience is mostly himself, a developer, where consistency and trust matter less than for a non-technical user of agent-built UI.

## Synthesis for Kay

1. Catalog cards become interactive: the agent describes data, controls, bindings, and live text templates; Kay's runtime reacts instantly with no model call per interaction (marimo's model, catalog pixels, ADR-024 fail-closed).
2. Live text: the agent's sentence carries bound values, so the explanation stays true while the user explores.
3. Honest controls: sliders need a numeric range or labeled stops; two meanings become a switch; the agent says when it translated the request ("stops instead of a free slider, since there is nothing between net and gross").
4. Two views: the app view by default, "Show my work" reveals the steps (ADR-008, ADR-036), always collapsed until asked for, and its controls become skill settings (ADR-017).
5. Everything reports back: an interactive surface's current state attaches to the user's next message as a visible, removable chip (after ADR-009), so the agent never loses track of what the user is looking at.
6. Custom views (model-written HTML, Thariq-style) are legitimate for throwaway personal tools, provided they are sandboxed, styled with Kay's tokens, labeled as custom, and return a typed result through the same chip.
7. Recurring custom views are promoted into the catalog (ADR-016); likely first candidates from the article's examples are a bucket board (Now / Next / Later / Cut), a constrained config form, and a template with live preview.

## Sources

- [Using Claude Code: The unreasonable effectiveness of HTML (claude.dev)](https://claude.dev/blog/using-claude-code-the-unreasonable-effectiveness-of-html/)
- [HTML effectiveness example gallery](https://thariqs.github.io/html-effectiveness/)
- [marimo docs: Interactive elements](https://docs.marimo.io/guides/interactivity/)
- Ethan's screen recording of the marimo.io hero video (not stored in the repo)
