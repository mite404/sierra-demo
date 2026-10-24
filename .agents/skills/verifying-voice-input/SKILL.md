---
name: verifying-voice-input
description: >-
  Checks bounded Sierra voice lifecycle properties. Use when changing transcribe,
  listenToMicrophone, their speech-service events, or microphone cancellation.
---

# Verify voice input

From the repository root, run:

```sh
pnpm --filter @yaklabs/catalog test src/liveDictation.properties.test.ts
```

## Coverage and limits

This is exhaustive bounded generated testing of actual TypeScript, using the existing locked
Vitest dependency, fake timers, and external browser-service doubles. No direct TypeScript formal
verifier is available here. This is not an unbounded proof or an E2E check.

Covered file: `packages/catalog/src/liveDictation.ts`.
Checks: `packages/catalog/src/liveDictation.properties.test.ts`.
Last confirmed sync commit: `adb4bfff8a7f574bb7fc4e3993ee121d84862cfd`.

- `transcribe`, its continuous recognizer, and its `end` callback must never call the external
  recognizer's `start` after the caller stops. Otherwise a closed voice input can resume listening.
  All 400 prefixes of length 0 through 3 over start, end, result, recoverable silence, network
  failure, 3,999 ms and 1 ms advances are paired with all 21 suffixes of length 0 through 2 over
  start, end, silence and 3,999 ms advances. Each of the 8,400 pairs inserts stop between them,
  then probes start/end, advances another 4,000 ms, and probes end again. Prefixes deliberately
  include out-of-order callbacks. This property asserts restart suppression, not text suppression.
- `transcribe` and `heardSoFar` must retain completed sessions while replacing the current
  session's cumulative result snapshot. Otherwise a pause can erase the user's earlier words.
  All 3,906 sequences of length 0 through 5 over single-part alpha, two-part beta/gamma, empty
  snapshot, pause/restart, and recoverable silence are checked. Every emitted snapshot is checked;
  a final probe checks retained text even when the sequence ends with a pause. A pause completes
  the latest snapshot, including interim text. Empty sessions add no words.
- `listenToMicrophone` must stop every track when permission resolves after stop. Otherwise a
  dismissed input can leave the microphone open. All 27 combinations of 1 through 3 tracks,
  1 through 3 stop calls, and 0 through 2 intervening promise turns are checked. No audio context,
  device enumeration, level, device list, or error callback may follow these late grants.

Assumptions: JavaScript callbacks run serially. Speech start/stop calls do not throw. Transcript
sequences acknowledge every restart immediately and contain no terminal error or elapsed time.
Results are cumulative snapshots of one session, with one alternative per result. The microphone
double resolves permission successfully and exposes only tracks; audio processing is never entered.

Excluded: acoustic correctness, real microphone permissions, browser/vendor behavior, audio levels,
device switching, normal active-stream cleanup, HTTP, composer/modal integration, send/reset flows,
arbitrary transcript strings, longer histories, and every possible timer/event interleaving.
Run the app's real-browser E2E separately; these checks cannot replace it.

## Browser integration

Start the local teaching app with `amp orb services ensure`, then run:

```sh
node apps/web/scripts/voice-check.mjs
```

The browser check uses Chromium's fake audio device through real `getUserMedia` and controls only
the external speech recognition results. It exercises the unchanged catalog modal, editable draft,
Done, Escape, focus restoration, track cleanup, hidden uploads, and no automatic submission in
employee and author chats. Navigating to Saved simulations must stop the retained setup capture.
It also captures a narrow author modal. It uses the local live model to configure and explicitly
accept a synthetic workflow, so server credentials must
be available. No deployment or real customer data is involved.

Use `--base` for another local teaching server and `--out` for screenshots. If Playwright's pinned
Chromium is missing, set `PLAYWRIGHT_CHROMIUM` to an installed Chrome executable. Install the pinned
browser with `pnpm --filter storybook exec playwright install chromium --only-shell` otherwise.
This check does not prove acoustic recognition. Check real speech manually in a supported browser;
report permission, service, or microphone errors rather than replacing them with simulated success.

## When covered code changes

1. Read the covered functions and compare their event and result contracts with the bounds above.
2. Run the command. For a failure, replay the sequence printed by the assertion. Decide whether
   the real implementation violates the property or the external double assumes an invalid
   browser contract. Keep a genuine counterexample visible rather than weakening the property.
3. For intended contract changes, update the generator, independent expectations, and this record
   together. Move the sync commit only after confirming that the checks describe that revision.
4. Prove a realistic mutation goes red, restore only that scratch mutation, then rerun green.
   Preserve concurrent edits. For later drift, use `/maintain-formal-verification-skill`.

## Mutation evidence

All three real-code mutations failed their corresponding property during the initial verification.
Each mutation was restored before the next check; the final unchanged implementation passed.

- Remove `stopped` from `if (stopped || failed) return` in the `end` callback. The late start/end
  probe must report an extra start after stop.
- Replace `kept = heardSoFar(kept, session)` with `kept = ""`. An alpha, pause, probe sequence
  must report missing alpha.
- Remove `track.stop()` only in the late-grant branch of `listenToMicrophone`. The track assertion
  must report zero stops instead of one.

Observed counterexamples were stop, late start/end with two starts instead of one; four alpha
snapshots, pause, probe with `probe` instead of `alpha probe`; and one track, one stop, immediate
grant with zero track stops. The covered file's SHA-256 matched before and after each mutation:
`8fdac2e75d9a6c1752e55003fb864bf7bd1f7b489b7adb617617fa96ca3d7a11`.

Use a temporary, uniquely matched patch for each mutation. Restore it immediately even if the
test command fails unexpectedly. Confirm the covered file is byte-for-byte unchanged afterward.
