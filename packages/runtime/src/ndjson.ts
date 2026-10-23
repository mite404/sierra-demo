/**
 * Decodes incremental UTF-8 lines, preserving split characters and trailing partial lines.
 * Leaving early cancels the reader and its upstream work.
 * @throws If the response body fails while being read.
 */
export async function* linesOf(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a stream is read in order
      const chunk = await reader.read();
      if (chunk.done) break;
      const read = buffered + decoder.decode(chunk.value, { stream: true });
      const lines = read.split("\n");
      buffered = lines.pop() ?? "";
      yield* lines.filter((line) => line.trim() !== "");
    }
    buffered += decoder.decode();
    if (buffered.trim() !== "") yield buffered;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
