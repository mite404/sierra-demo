/** A queue one side pushes into and the other iterates, waiting when it runs dry. */
export type Inbox<T> = AsyncIterable<T> & { push: (item: T) => void };

/** An empty inbox. Its iteration never ends by itself; the reader stops it. */
export function createInbox<T>(): Inbox<T> {
  const queued: { item: T }[] = []; // boxed, so an item that is itself undefined still counts
  const takers: ((item: T) => void)[] = [];
  const next = (): Promise<IteratorResult<T>> => {
    const head = queued.shift();
    if (head !== undefined) return Promise.resolve({ done: false, value: head.item });
    return new Promise((resolve) => {
      takers.push((value) => {
        resolve({ done: false, value });
      });
    });
  };
  return {
    push: (item) => {
      const take = takers.shift();
      if (take === undefined) queued.push({ item });
      else take(item);
    },
    [Symbol.asyncIterator]: () => ({ next }),
  };
}
