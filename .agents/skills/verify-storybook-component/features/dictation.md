# Dictation

Dictation lets a user speak instead of type. The Dictate button opens a listening dialog with a
live waveform and elapsed time; typing pauses while recording; Done appends the transcript to the
message, Cancel discards it.

## Sub-features

- `dictation-open` opens the listening dialog from the compose box.
- `dictation-lock` disables the message box, Attach, Dictate and Send while recording.
- `dictation-device` shows the input device picker.
- `dictation-done` appends the transcript and closes.
- `dictation-cancel` closes without changing the message.
- `dictation-live` uses the real microphone and speech recognition.

## How to get to it (user POV)

- Click `button "Dictate"` in the compose box of any thread.
- In Storybook: `thread-chat-thread-panel--dictation` and `--dictation-narrow` open with the
  dialog already showing (simulated audio); `--dictation-live-microphone` asks for the real one.

## Driving it with Storybook

Preconditions:

- Doctor is OK on port 6106.

- **Open.** Load `thread-chat-thread-panel--standard` and click `button "Dictate"`. A
  `dialog "Listening 0:00"` appears with `button "System Default"`,
  `img "Live audio waveform, newest sound at the center"`, `Start speaking…`,
  `button "Cancel"` and `button "Done"`.
- **Lock.** While the dialog is open, `textbox "Message"` shows placeholder `Recording…` and it,
  `button "Attach"`, `button "Dictate"` and `button "Send"` are all `[disabled]`, with the text
  `Typing is paused while recording`.
- **Microphone.** Click `button "System Default"`. `listbox "Choose microphone"` opens with
  `option "System Default" [selected]`, `option "MacBook Pro Microphone"`,
  `option "USB Headset Microphone"` and `option "Loopback Audio"`. Click one: the list closes and
  the button takes its name. With the list open, Escape closes only the list; a second Escape
  closes the dialog. No story opens the list, so axe only checks it when you do.
- **Cancel.** Click `button "Cancel"`. The dialog closes, the message box is empty and enabled.
- **Done.** Load `thread-chat-thread-panel--dictation`, wait for the simulated transcript, click
  `button "Done"`. The dialog closes and the transcript is in `textbox "Message"`.
- **Proof.** `shoot.mjs thread-chat-thread-panel--dictation` and the `-narrow` id with
  `--width 420`.

## Gotchas

- `--dictation-live-microphone` needs microphone permission and speech recognition, which headless
  Chromium does not grant. Report `dictation-live` as verified-unreachable (microphone permission);
  the simulated stories do not prove it.
- On an insecure origin (a LAN IP from `--host 0.0.0.0`) `navigator.mediaDevices` is undefined.
  Drive `127.0.0.1`, which `control-storybook.sh` binds to.
- The elapsed time in the dialog title changes every second (`Listening 0:00`, `0:01`...). Match
  the name with a prefix, not the full string.
