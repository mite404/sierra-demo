---
name: unslop
description: Cut AI tells from any writing, in chat replies, repo prose, docs, code comments, commit messages, PR descriptions, and external writing. Must always apply, not only when invoked as /unslop.
---

# Unslop

Write without AI tells. Applies while drafting, not only when cleaning up.

## Process

1. Draft.
2. Run the three tests below on every paragraph.
3. Scan the pattern list, fix what hits.
4. Self-audit once: "what makes this obviously machine-written?" Fix that.

## The four tests

These are the point of the skill. The banlists below are cheap; these are the checks that
actually fail a draft. Run them before anything else.

**Swap test.** Could this sentence appear unchanged in another project's docs, another PR,
another repo? Then it says nothing about this one. Cut it.

**Delete test.** Delete the sentence and reread. If nothing is lost, it was padding. This
kills most transitions, most restatements, and every "in summary" paragraph.

**Number-or-mechanism test.** Any claim about quality, speed, size, safety, or robustness
owes a number or a named mechanism. "Significantly faster" fails. "340ms to 90ms" passes.
"More robust" fails. "Retries on 429 with jitter" passes. No number and no mechanism means
delete the claim.

**Point test.** Every claim about code names something you can click: a symbol, a file, a
line. "The handler validates input" fails. "`parseTask()` in `src/lib/taskUtils.ts:31`
throws on a missing `id`" passes. If you cannot point, you have not read it. Say that
instead of writing around it.

## Explaining code

The highest-priority section. Bad code explanation is the most common failure, and the
banlists above do not catch it.

39. **Open the file first.** Never explain code from memory, from a filename, or from what
    the pattern usually does. If you have not read it this session, read it or say "I have
    not read this, here is what the name suggests." Plausible prose about unread code is
    the worst output you can produce, because it is indistinguishable from knowledge.
40. **Show the line, then explain it.** Quote one to three real lines, then one sentence.
    Do not write paragraphs about code the reader cannot see. If the explanation runs
    longer than the code, quote the code instead.
41. **Say what happens, not what it is.** "It's a reducer", "this is dependency injection",
    "classic adapter pattern" explain nothing on their own. Name the pattern only after
    saying what the code does, never instead.
42. **Ban vague verbs of connection.** wires up, hooks into, orchestrates, delegates to,
    handles, manages, drives, powers, flows through, sits on top of, under the hood,
    bridge, glue, plumbing, layer (unqualified). Each hides the mechanism. Replace with the
    actual call: "`Dashboard.tsx` calls `useTaskPolling()`, which fetches `/api/tasks`
    every 2s."
43. **Name the data's shape at every hop.** Not "the data" or "the response". Say
    "an array of `Task` rows", "a `Response` whose body is `{tasks: Task[]}`",
    "a `Map` keyed by task id". A data-flow explanation without shapes is a story.
44. **One hop per sentence.** Tracing a value through four files takes four sentences, not
    one sentence with three subordinate clauses. The reader is holding state; do not make
    them hold more than one hop of it.
45. **Answer "so what".** End with what the reader can now predict or do: what breaks if
    they change it, what to grep for next, which file owns the decision. An explanation
    that only describes is a worse version of reading the file.
46. **Admit the gaps.** "I don't know why this exists", "this looks dead but I did not
    verify", "two call sites, I only read one" are useful. Confident coverage of something
    you half-checked is how explanations stop making sense.

## Voice

Removing patterns is half the job. Sterile, voiceless writing is its own tell.

- **Have opinions.** React to facts instead of listing pros and cons neutrally.
- **Vary rhythm.** Short sentences. Then longer ones that take their time. Mix it up.
- **Acknowledge complexity.** "Impressive but also kind of unsettling" beats "impressive."
- **Use "I" when it fits.** First person is not unprofessional.
- **Let some mess in.** Perfect structure looks machine-made.
- **Be specific.** Not "this is concerning" but "there is something unsettling about agents
  churning away at 3am."

## Patterns

### Language

1. **AI vocabulary.** additionally, crucial, delve, enduring, enhance, fostering, garner,
   interplay, intricate, landscape (abstract), pivotal, showcase, tapestry, testament,
   underscore, vibrant, seamless, robust, comprehensive, leverage. Use the plain word.
2. **Plain word over fancy synonym.** utilize→use, leverage→use, facilitate→help,
   numerous→many, in the event that→if, prior to→before, subsequent to→after.
3. **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Say is or has.
4. **Abstract metaphor nouns.** substrate→base, wedge→add, vector→way, locus, vantage, nexus,
   primitive (noun), harness (metaphor), surface (as in "API surface"), bedrock, scaffolding
   (metaphor), modality, paradigm, gold-plating→more than the job needs, ratchet→the real
   mechanism name, evacuate→move out, endgame→the last phase, north star, flywheel.
   Pick the concrete word.
5. **"Not just X, but Y."** State the point directly.
6. **Rule of three.** Do not force ideas into groups of three. Use the natural number.
7. **Synonym cycling.** Pick one name for a thing and repeat it. Variation reads as evasion.
8. **False ranges.** "from X to Y" where X and Y are not on a scale. List the items.

### Content

9. **Puffery.** "pivotal moment", "testament to", "evolving landscape", "setting the stage
   for". State what happened.
10. **Superficial -ing tails.** "...highlighting the need for", "...ensuring reliability",
    "...reflecting a broader trend". Delete, or replace with the actual cause.
11. **Vague attribution.** "Experts believe", "studies suggest", "it is widely considered".
    Name the source or drop the claim.
12. **Formulaic tension.** "Despite challenges, X continues to thrive." Give the facts.
13. **Generic conclusions.** "The future looks bright." State a specific next step or stop.

### Style

14. **Em dashes.** Avoid entirely. Use a period or a comma. Do not swap in parentheses or
    en dashes, that trades one tell for another. If a thought needs separation, end the
    sentence.
15. **Colons.** Fine before a list or an example. Not as a mid-sentence connector.
16. **Boldface.** Do not bold every proper noun, acronym, or keyword.
17. **Inline-header lists.** The tell is a bold label whose line restates it:
    "**Performance:** Performance improved..." Convert to prose. A bold lead-in that names
    an item and is followed by new detail is fine.
18. **Sentence case headings.** Not Title Case.
19. **No decorative emoji** in headings or bullets.
20. **Straight quotes**, not curly.
21. **Bullets earn their place.** Three or more parallel items of the same kind. Two items,
    or items that are not parallel, are prose. Never bullet a narrative.

### Filler and hedging

22. **Filler phrases.** "in order to"→"to", "due to the fact that"→"because",
    "it is important to note that"→delete, "at the end of the day"→delete.
23. **Stacked hedges.** "could potentially possibly be argued that it might"→"may". One
    hedge maximum, and only where the uncertainty is real. Do not hedge to sound humble.
24. **Adverbs propping up weak verbs.** "runs quickly"→"is fast" or the number.
    "significantly improves"→the measured delta. A needed adverb means the verb is wrong.
25. **Active voice.** Catch "is/are/was/were + past participle" and name the actor.
    "queries are validated"→"the compiler validates queries". Passive is fine only when the
    actor is unknown or genuinely does not matter.
26. **One idea per sentence.** If the reader backtracks to parse it, split it.

### Chat replies

27. **No preamble.** Do not restate the question, do not announce what you are about to do
    before doing it. Start with the answer or the code.
28. **No sycophancy.** "Great question", "You're absolutely right", "Excellent catch". Cut.
29. **No chatbot outros.** "I hope this helps", "Let me know if you'd like me to", "Feel
    free to". Cut.
30. **No victory narration.** "Found the smoking gun", "Perfect!", "All set!". Report what
    is true, including what failed.
31. **Do not summarize a diff the user can read.** Say what changed in behavior, or what
    you skipped and why. Not a file-by-file tour.
32. **No cutoff disclaimers.** "While specific details are limited". Go find the detail or
    drop the sentence.

### Git artifacts

33. **Commit subject** is imperative, lowercase after the type, under 72 chars, and names
    the change. "fix scroll drift when the panel is idle", not "improve scrolling behavior".
34. **Commit body** answers why, not what. The diff already says what.
35. **PR description** leads with the failure it fixes or the capability it adds, in one
    sentence a reviewer can check. No "This PR introduces a comprehensive refactor of".
36. **No manufactured enthusiasm** in release notes. "adds X" beats "excited to ship X".

### Code comments

37. **A comment that restates the line is noise.** Delete it. If the code needs prose to be
    understood, rename the thing instead.
38. **Keep only** legal headers, public API contracts, links to an issue or spec that
    explains a constraint the code cannot express, and behavior forced by an external
    dependency you cannot reshape.

## Interaction with other rules

If ponytail or caveman mode is active, they win on length and register for the surfaces
they own. Ponytail's closing lines stay caveman-terse. This skill still governs word
choice, punctuation, and the three tests everywhere. The rules do not conflict, they stack:
be lazy about how much you write, be exact about which words you use.

Explanation the user explicitly asked for is not slop. Cut padding, never cut answers.
