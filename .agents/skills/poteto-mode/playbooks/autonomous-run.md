### Autonomous run

**You own the exit condition. Define done, then drive to it without stopping.** For "going to bed" / "run until done" / "/loop until X".

1. State the exit condition as a checkable predicate before the first iteration (tests green, repro fixed, all N PRs merged, pixel-diff zero). A vague goal stalls; a predicate lets you stop. **Then break it on purpose once and confirm it reports failure.** A predicate that cannot fail is worse than none: unattended it ends the run in a false victory nobody watched. A check whose success is an exit code over an empty result (`rg -o … > proof.txt && echo PASS`, which exits 0 on zero matches) passes forever. Assert on content, and name the string that must appear.

   ```bash
   # cannot fail: rg exits 0 with an empty file when nothing matches
   rg -o 'EXPECTED' src > proof.txt && echo PASS

   # can fail: non-empty AND contains the expected string
   test -s proof.txt && grep -q 'EXPECTED' proof.txt

   # prove it before iteration 1: break the input, require a nonzero exit, restore
   mv src/target.ts src/target.ts.bak
   ./predicate.sh; echo "want nonzero, got $?"
   mv src/target.ts.bak src/target.ts
   ```
2. Pick the wake mechanism using Cursor's `/loop` command (a built-in, not a pstack skill). An event to watch (CI, a merge, a ref advancing) gets a watcher subagent that wakes you on the event, with a long time-based heartbeat as fallback. No event gets a fixed-interval heartbeat sized to when the result is worth re-checking.
3. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced, discards changes that didn't help. Belt-and-suspenders that "might help" gets reverted, not left to ride.
   Sequence the work via the **sequence-verifiable-units** principle skill, verifying each unit before the next instead of batching checks at the end.
4. Mid-run discoveries are yours. Address broken skills, related bugs, flaky verifiers, review noise, tooling failures, orphaned follow-ups, and fixable drift yourself via poteto-mode. Put out-of-band fixes in their own PR. Do not park reversible work for the human or use `AskQuestion`. Before calling anything a dead end, exhaust the ladder: re-read the actual error, health-check whatever you are driving, reset it to a known state, relaunch it, and fix the broken skill or harness that caused the failure. Retry once after a fix, restarting only what the fix invalidated. An identical second failure was never flake. Surface only irreversible actions, genuine product or preference calls no experiment can settle, or a real dead end, and say which rungs you tried. Keep the predicate as the main drive, and return to it after each side fix.
5. Checkpoint every iteration via the **show-me-your-work** skill, a row for what changed and whether the predicate moved. A run with no trail can't be audited or resumed.
6. Stop when the predicate is met. A plateau is not a stop, so keep going and pivot your approach to push past it. Surface a genuine dead end rather than spinning, and never relax the predicate to declare victory. A blocker that is neither the predicate nor a dead end becomes a **residual**: name it, name the unmet precondition and what would clear it, and keep driving every other stream. A residual blocks declaring the predicate met; it does not end the run. Carry open residuals in every checkpoint so the trail shows what was parked and why.

**Reply:** the exit condition and how you proved it can fail, iterations run, what landed, what was discarded, open residuals with what would clear each, final predicate state.
