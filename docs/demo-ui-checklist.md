# Demo UI event checklist

Scope: `/demo/weekly-brief`, an authored interview demo, not the production agent runtime.
Checked items have browser coverage in `apps/web/scripts/brief-check.mjs`. Unchecked items remain
acceptance criteria, not implemented or verified claims. No real provider or persistence is implied.

## Text, activity, and outcomes

- [x] Start: keep the submitted question visible and show that work has begun.
- [x] Text chunk: preserve paragraph, list, heading, bold, and italic styling during the reveal.
- [x] Pause and resume: stop advancing the script, then continue the same reply.
- [x] Tool activity: show brief factual narration; keep earlier activity behind a disclosure.
- [x] Parallel checks: let each check settle independently and retain its outcome and evidence.
- [x] Structured card: render approved evidence cards without displacing the fixed controls.
- [ ] Malformed card beside a valid card: reject only the bad payload; keep the composer usable.
- [x] Question: wait for a real selection; never generate a draft before consent.
- [x] Question declined: show that no draft was prepared and end the busy state.
- [x] Outcome: show the finished response, stop the busy indicator, and retain evidence.
- [ ] Read earlier text during a reveal: preserve the reader's scroll position and offer a return.
- [ ] Cancel: stop the attempt, label any partial answer, and preserve recoverable input.
- [ ] Slow or stalled work: distinguish an ongoing wait from failure without inventing progress.

## Failures and recovery

- [x] Failure before text: preserve the question, identify the failure, and offer another attempt.
- [x] Failure after text: retain the partial answer and explicitly mark it incomplete.
- [x] Retry after interruption: preserve the earlier partial reply without duplicating the question.
- [x] One failed check: keep successful evidence and do not fabricate the missing result.
- [ ] Retry requested twice: the UI starts only one replacement attempt.
- [ ] Saving an edit fails: retain input and label it unsaved; do not imply successful persistence.
- [ ] Save succeeds after retry: replace the unsaved state with the confirmed value exactly once.
- [ ] Duplicate or late event: never duplicate a card, answer, or effect in the visible transcript.
- [ ] Out-of-order event: never regress a settled status or associate text with another attempt.
- [ ] Reload after interruption: distinguish persisted content from content that was never saved.
- [ ] Reconnect: say whether the UI resumed the old attempt or started another one.

## Navigation, ownership, and reading controls

- [ ] Switch or close a pending thread: late text never appears in another thread.
- [ ] Return to a pending thread: restore its own status and recoverable input.
- [ ] Move a child to the main panel: preserve its parent ID and ownership label.
- [ ] Drag a task card to the canvas: both displays refer to the same task state.
- [ ] Child still running: keep its status beside the usable composer, outside the transcript.
- [ ] Bookmark: show the first 15 characters and time; Alt-click jumps to the latest request.
- [ ] Bookmark or search jump: center the target when it fits and briefly highlight it.
- [ ] Search: find literal text, report no matches, navigate results, and restore focus on Escape.
- [x] Recap preview: label the simulation and leave room to read the transcript.

## Presentation and access

- [x] Streamed and finished prose: 15px body, 24px leading, semantic emphasis at weight 600.
- [x] Italics: load a genuine Inter italic face instead of relying on synthesized slant.
- [x] Evidence: keep technical logs one disclosure deeper than human-readable outcomes.
- [x] Narrow viewport: prevent horizontal page overflow and keep decision controls reachable.
- [x] Reduced motion: render AgentTree without its animation.
- [ ] Keyboard and screen reader: verify the complete flow, announcements, and focus after changes.
- [ ] Long conversation: measure typing, scrolling, and switching with large messages and charts.
- [ ] Optional reading mode: test any syntax-like colour treatment without using colour alone.
