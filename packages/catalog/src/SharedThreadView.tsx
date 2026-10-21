import { useEffect, useState } from "react";
import { openSealedThread, type SharedThread } from "./threadShare";
import { AgentTurn, UserTurn } from "./Turns";

/** Fetches a share's sealed bytes by id; undefined once it has ended or been taken down. */
export type LoadShare = (id: string) => Promise<Uint8Array<ArrayBuffer> | undefined>;

// A shared thread on its way, open, or gone: ended, taken down, or a link that does not open it.
type Loaded = { kind: "opening" } | { kind: "open"; thread: SharedThread } | { kind: "gone" };

// "Friday 2 October at 9:00": the hour unpadded, as the thread's own turn times are written.
function until(at: Date): string {
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(at);
  return `${day} at ${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}`;
}

// Fetches a share and opens it. Anything that stops it on the way (the server, the key, the
// check, or its end) makes it a gone share; the page checks the end too, so a copy served late
// never shows.
async function openShared(load: LoadShare | undefined, id: string, key: string): Promise<Loaded> {
  try {
    const sealed = load === undefined ? undefined : await load(id);
    const thread = sealed === undefined ? undefined : await openSealedThread(sealed, key);
    const current = thread !== undefined && Date.parse(thread.expiresAt) > Date.now();
    return current ? { kind: "open", thread } : { kind: "gone" };
  } catch {
    return { kind: "gone" };
  }
}

// Opens the share once per link.
function useShared(id: string, key: string, load: LoadShare | undefined): Loaded {
  const [loaded, setLoaded] = useState<{ link: string; state: Loaded }>();
  const link = `${id}.${key}`;
  useEffect(() => {
    let live = true;
    const open = async () => {
      const state = await openShared(load, id, key);
      if (live) setLoaded({ link, state });
    };
    void open();
    return () => {
      live = false;
    };
  }, [id, key, link, load]);
  return loaded?.link === link ? loaded.state : { kind: "opening" };
}

// The thread as it showed it, read-only, and until when its link works.
function OpenThread({ thread }: { thread: SharedThread }) {
  return (
    <>
      {/* Above the turns, so a reader knows how long the page lasts before scrolling a word. */}
      <p className="share-note share-note-lead">
        Shared from Kay until {until(new Date(thread.expiresAt))}; after that this link stops
        working. Only people with the link can read it.
      </p>
      <section className="thread-panel shared-thread" aria-label={thread.title}>
        <header className="thread-header">
          <h2>{thread.title}</h2>
        </header>
        <div className="thread-scroll">
          {thread.messages.map((message) =>
            message.role === "user" ? (
              <UserTurn key={message.id} message={message} />
            ) : (
              <AgentTurn
                key={message.id}
                message={message}
                onChoose={() => {}}
                cardsCarry={false}
                shareable={false}
              />
            ),
          )}
        </div>
      </section>
    </>
  );
}

/**
 * A thread made public for a while (ADR-131), read-only: its title and turns as the thread
 * showed them, its cards live but not shareable again, and a line that says until when the
 * link works. An ended, taken-down or garbled link says so honestly.
 * @param load Fetches the sealed bytes from the host's server; the key never leaves the page.
 */
export function SharedThreadView({
  id,
  shareKey,
  load,
}: {
  id: string;
  shareKey: string;
  load?: LoadShare;
}) {
  const loaded = useShared(id, shareKey, load);
  if (loaded.kind === "opening") {
    return <output className="share-note">Opening the shared thread…</output>;
  }
  if (loaded.kind === "gone") {
    return (
      <section className="card state" data-context="thread">
        <h2>This shared thread has ended.</h2>
        <p>Its time ran out or it was taken down. Ask whoever shared it for a fresh link.</p>
      </section>
    );
  }
  return <OpenThread thread={loaded.thread} />;
}
