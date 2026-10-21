import { z } from "zod";

// What the test worker answers.
const replySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

/**
 * Runs one request in a fresh `sqliteStore.testWorker.ts`, then ends that worker the way closing
 * a tab would, so the private file system is free again when it resolves. Browser tests only.
 */
export async function inFreshWorker(request: unknown): Promise<z.infer<typeof replySchema>> {
  const url = new URL("./sqliteStore.testWorker.ts", import.meta.url);
  const worker = new Worker(url, { type: "module" });
  try {
    const data = await new Promise<unknown>((resolve, reject) => {
      worker.addEventListener("message", (event) => {
        resolve(event.data);
      });
      worker.addEventListener("error", () => {
        reject(new Error("The test worker failed"));
      });
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- workers have none
      worker.postMessage(request);
    });
    return replySchema.parse(data);
  } finally {
    worker.terminate();
  }
}
