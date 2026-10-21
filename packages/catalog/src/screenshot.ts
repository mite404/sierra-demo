/**
 * Captures one frame of a screen, window or tab the user picks, as a PNG file (ADR-063).
 * Uses the browser's screen-capture prompt, so the user chooses what is shared and nothing
 * is captured without asking; the stream stops as soon as the frame is taken. A desktop
 * app would capture natively; this is the browser lab's equivalent.
 * @returns The screenshot, or undefined if the user cancelled or capture is unavailable.
 */
export async function captureScreenshot(now = new Date()): Promise<File | undefined> {
  if (!navigator.mediaDevices?.getDisplayMedia) return undefined;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    return undefined; // The user cancelled the prompt.
  }
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new File([blob], screenshotName(now), { type: "image/png" }) : undefined;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

/** A readable name for a screenshot taken at `date`, e.g. "Screenshot 14:07.png". */
export function screenshotName(date: Date): string {
  const time = date.toTimeString().slice(0, 5);
  return `Screenshot ${time}.png`;
}
