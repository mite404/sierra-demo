---
linear: ETH-97
github: 26
filed: 2026-10-24
---
# Reuse YakLabs voice input

## Status

- **Goal**: Dictate editable drafts in all three Sierra chat roles using YakLabs components.
- **Initial priority**: P2
- **Effort**: Small
- **Risk**: MEDIUM
- **Category**: feature
- **Planned at**: commit `adb4bfff8a7f574bb7fc4e3993ee121d84862cfd`, 2026-10-24

## Why this matters

Use the same voice input as YakLabs without another speech implementation or new provider.

## Current state

- Sierra retains YakLabs microphone capture, browser speech recognition, DictationModal, Waveform,
  DevicePicker, transcript insertion, and dictation stories.
- Compared with YakLabs main `104a052309402b25b64c64b8114b69f5e4276523`, those voice files match.
- The three Sierra chat roles hide both attachments and dictation through `textOnly`.
- YakLabs ADR-079 marks ElevenLabs speech output as not built and subsequently cut from scope.

## Approach

- Reuse the catalog components and live microphone source. Separate attachment visibility from
  voice visibility so unsupported uploads stay hidden. Keep recognition and presentation unchanged.
- Dictation adds text to the existing draft. It never submits a request automatically.
- Verify the actual TypeScript lifecycle with bounded generated event sequences, then exercise
  dictation in the running browser. A lifecycle check does not prove acoustic recognition.

## Scope

- In: employee setup, simulation author, customer chat, shared composer capability flags, and
  checks.
- Out: text-to-speech, ElevenLabs integration, deployment, and YakLabs infrastructure.
- This explicit request supersedes the original Sierra plan's exclusion of voice input only.

## Steps

- Enable live dictation in all three chat roles while retaining hidden attachments.
- Keep the inherited modal, waveform, device picker, recognition logic, and Storybook stories.
- Add a rerunnable lifecycle verification skill and browser integration check.

## Test plan

- Run composer browser tests and the existing dictation stories and unit tests.
- Exhaust bounded speech-event sequences against the actual implementation and detect a mutation.
- Exercise draft preservation, Done, Cancel, keyboard focus, microphone failure, and narrow layout.
- Distinguish controlled recognition events from a real browser speech-service result.

## Done when

* All three chat roles offer live dictation without exposing uploads.
* Done inserts editable text and Cancel preserves the draft, without automatic submission.
* Existing stories remain intact and the lifecycle skill catches its named broken variant.
* Browser evidence and any unverified real-audio limitations are reported honestly.

## Notes

Risk is MEDIUM because browser speech services vary by browser and availability. Audio input
selection retains YakLabs behavior: speech recognition hears the system default microphone.
