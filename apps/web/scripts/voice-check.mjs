import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { arg, launch } from "./harness.mjs";

const base = arg("--base", "http://127.0.0.1:8787");
const out = path.resolve(arg("--out", ".artifacts/voice-check"));
await mkdir(out, { recursive: true });
const browser = await launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
const posts = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (request.method() === "POST") posts.push(request.url());
});
await context.addInitScript(() => {
  window.voiceText = "Use warm replies and refund immediately.";
  window.voiceStreams = [];
  window.voiceRecognizers = [];
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await getUserMedia(constraints);
    window.voiceStreams.push(stream);
    if (window.voiceDelayGrant) {
      await new Promise((resolve) => {
        window.releaseVoiceGrant = resolve;
      });
    }
    return stream;
  };
  const enumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = async () =>
    (await enumerateDevices()).map((device) => ({
      ...device.toJSON(),
      label: device.label.replaceAll(/Fake (?:Default )?Audio Input/g, "Test Fixture Mic"),
    }));
  // Recognition results and fixture labels are controlled; capture, modal, draft and HTTP stay real.
  window.SpeechRecognition = class extends EventTarget {
    start() {
      this.active = true;
      window.voiceRecognizers.push(this);
      queueMicrotask(() => {
        this.dispatchEvent(new Event("start"));
        this.dispatchEvent(
          Object.assign(new Event("result"), {
            results: [[{ transcript: window.voiceText }]],
          }),
        );
      });
    }
    stop() {
      this.active = false;
      this.dispatchEvent(new Event("end"));
    }
  };
});

const current = () => page.locator(".lab-stage:not([hidden]), .lab-author-workspace").last();
const field = () => current().getByRole("textbox", { name: "Message", exact: true });
const capture = (name) =>
  page.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled" });

async function stopped() {
  await page.waitForFunction(
    () =>
      window.voiceStreams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === "ended"),
      ) && window.voiceRecognizers.every((recognizer) => !recognizer.active),
  );
}

async function dictate(role) {
  await field().fill("Existing draft.");
  assert.equal(await current().getByRole("button", { name: "Attach", exact: true }).count(), 0);
  const before = posts.length;
  const streamsBefore = await page.evaluate(() => window.voiceStreams.length);
  await current().getByRole("button", { name: "Dictate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Listening/ });
  await dialog.getByText("Use warm replies and refund immediately.", { exact: true }).waitFor();
  assert.equal(await field().isDisabled(), true);
  await page.waitForFunction((count) => window.voiceStreams.length > count, streamsBefore);
  await dialog.getByRole("button", { name: /System Default \(Test Fixture Mic\)/ }).waitFor();
  if (role === "employee") await capture("listening");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    await field().inputValue(),
    "Existing draft. Use warm replies and refund immediately.",
  );
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Message",
  );
  assert.equal(await field().evaluate((element) => document.activeElement === element), true);
  await stopped();
  assert.equal(posts.length, before, "Done does not send a message");
  if (role === "employee") await capture("editable-draft");
  await current().getByRole("button", { name: "Dictate", exact: true }).click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: /System Default \(Test Fixture Mic\)/ }).waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Message",
  );
  await stopped();
  await page.evaluate(() => {
    window.voiceDelayGrant = true;
  });
  await current().getByRole("button", { name: "Dictate", exact: true }).click();
  await page.waitForFunction(() => typeof window.releaseVoiceGrant === "function");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.evaluate(() => {
    window.voiceDelayGrant = false;
    window.releaseVoiceGrant();
    window.releaseVoiceGrant = undefined;
  });
  await stopped();
  assert.equal(
    await field().inputValue(),
    "Existing draft. Use warm replies and refund immediately.",
  );
  assert.equal(posts.length, before, "Cancel does not send a message");
  console.log(
    `PASS ${role}: live capture, Done appends, Cancel preserves, focus returns, no auto-send`,
  );
}

async function navigateWhileDictating(destination) {
  const before = posts.length;
  await current().getByRole("button", { name: "Dictate", exact: true }).click();
  await page
    .getByRole("dialog", { name: /Listening/ })
    .getByRole("button", { name: /System Default \(Test Fixture Mic\)/ })
    .waitFor();
  await page.getByRole("button", { name: destination, exact: true }).click();
  await stopped();
  assert.equal(await page.locator(".dictation").count(), 0, "Navigation cancels dictation");
  assert.equal(posts.length, before, "Navigation does not submit dictation");
  console.log(`PASS navigation to ${destination} stops capture and recognition`);
}

async function send(text) {
  await field().fill(text);
  const response = page.waitForResponse((item) => item.url().endsWith("/api/workflow"), {
    timeout: 60000,
  });
  await field().press("Enter");
  const received = await response;
  assert.equal(received.status(), 200);
  assert.equal(received.request().postDataJSON().message, text);
  await current().getByRole("button", { name: "Stop", exact: true }).waitFor({
    state: "hidden",
    timeout: 60000,
  });
  console.log("PASS workflow turn completed");
}

try {
  await page.goto(base);
  await field().waitFor();
  await capture("default");
  await dictate("employee");
  await send(await field().inputValue());
  await send("Use warm replies and refund immediately without asking for confirmation.");
  await current().getByRole("button", { name: "Accept workflow", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Not now", exact: true }).click();
  await page.getByRole("button", { name: "Workflow accepted", exact: true }).waitFor();
  await field().fill("Employee draft survives navigation.");
  await current().getByRole("button", { name: "Try it as a customer" }).click();
  await dictate("customer");
  await navigateWhileDictating("Configure");
  assert.equal(await field().inputValue(), "Employee draft survives navigation.");
  await current().getByRole("button", { name: "Try it as a customer" }).click();
  assert.equal(await page.locator(".dictation").count(), 0, "Returning does not resume recording");
  assert.equal(
    await field().inputValue(),
    "Existing draft. Use warm replies and refund immediately.",
  );
  await navigateWhileDictating("Configure");
  await navigateWhileDictating("Saved simulations");
  await page.getByRole("button", { name: "Create simulation", exact: true }).first().click();
  await dictate("author");
  await page.setViewportSize({ width: 420, height: 900 });
  await current().getByRole("button", { name: "Dictate", exact: true }).click();
  await page
    .getByRole("dialog", { name: /Listening/ })
    .getByText("Use warm replies and refund immediately.", { exact: true })
    .waitFor();
  await capture("narrow-listening");
  const fits = await page.getByRole("dialog", { name: /Listening/ }).evaluate((dialog) => {
    const bounds = dialog.getBoundingClientRect();
    const panel = dialog.closest(".thread-panel").getBoundingClientRect();
    return (
      bounds.left >= panel.left &&
      bounds.right <= panel.right &&
      bounds.top >= panel.top &&
      bounds.bottom <= panel.bottom &&
      [...dialog.querySelectorAll("button")].every((button) => {
        const box = button.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right && box.bottom <= bounds.bottom;
      })
    );
  });
  assert.equal(fits, true, "Narrow dictation and its controls fit inside the thread");
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "PASS all three roles; real microphone capture with controlled recognition results, not acoustic E2E",
  );
} catch (error) {
  await capture("failure");
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
