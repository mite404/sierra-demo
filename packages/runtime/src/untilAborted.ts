// Resolves when the signal aborts, as the end of an iteration.
function whenAborted(signal: AbortSignal): Promise<IteratorReturnResult<undefined>> {
  return new Promise((resolve) => {
    const stop = () => {
      resolve({ done: true, value: undefined });
    };
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });
}

/**
 * The same items, ending the moment `signal` aborts rather than when the next item arrives,
 * so a source that has gone quiet cannot hold a reply open.
 */
export function untilAborted<T>(source: AsyncIterable<T>, signal: AbortSignal): AsyncIterable<T> {
  const items = source[Symbol.asyncIterator](); // → AsyncIterator<T>
  const aborted = whenAborted(signal);
  return { [Symbol.asyncIterator]: () => ({ next: () => Promise.race([items.next(), aborted]) }) };
}
