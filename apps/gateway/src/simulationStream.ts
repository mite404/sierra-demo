/** Sends bounded lesson events as NDJSON; closing the reader aborts the real upstream request. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- callers select their outgoing protocol, preventing cross-role events
export function simulationStream<Event>(
  incoming: AbortSignal,
  run: (emit: (event: Event) => void, signal: AbortSignal) => Promise<void>,
  onCancel: () => void,
  deadlineMs = 45000,
): Response {
  const stop = new AbortController();
  const signal = AbortSignal.any([incoming, stop.signal, AbortSignal.timeout(deadlineMs)]);
  let cancelled = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: Event) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      void run(emit, signal)
        .then(() => {
          if (!cancelled) controller.close();
          return;
        })
        .catch(() => {
          onCancel();
          if (!cancelled) controller.error(new Error("Stream incomplete"));
        });
    },
    cancel() {
      cancelled = true;
      stop.abort();
      onCancel();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
