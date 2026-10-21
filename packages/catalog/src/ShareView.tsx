import { useSyncExternalStore } from "react";
import { CatalogCard } from "./CatalogCard";
import { InteractiveCard } from "./InteractiveCard";
import { decodeCard } from "./share";
import { SharedThreadView, type LoadShare } from "./SharedThreadView";
import { readThreadLink } from "./threadShare";
import "./thread.css";

// The page's own fragment, as an external store: opening a new link in the same tab changes
// only the fragment, so the page re-reads it on `hashchange`. Server renders have no fragment.
function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
  };
}
const readHash = () => window.location.hash;
const readServerHash = () => "";

// One card shared on its own (ADR-064), or an honest notice for a link that holds none.
function SharedCardView({ hash }: { hash: string }) {
  const card = decodeCard(hash); // → SharedCard | undefined
  return (
    <>
      {card?.kind === "interactive" ? (
        <InteractiveCard
          key={hash}
          payload={card.payload}
          turnId="shared"
          onChoose={() => {}}
          shareable={false}
        />
      ) : card ? (
        <CatalogCard payload={card.payload} context="thread" shareable={false} />
      ) : (
        <section className="card state" data-context="thread">
          <h2>This link doesn’t contain a card.</h2>
          <p>It may be incomplete or have been changed. Ask whoever shared it for a fresh link.</p>
        </section>
      )}
      <p className="share-note">Shared from Kay. Only this view is shared, not the conversation.</p>
    </>
  );
}

/**
 * The public page for what someone shared from Kay: one card on its own (ADR-064), which rides
 * in the link's fragment and passes the same catalog check as in the thread, or a whole thread
 * made public for a while (ADR-131), fetched sealed and opened with the key in the fragment. A
 * garbled or edited link shows an honest notice instead of a broken view. Interactive cards
 * stay interactive, since their data travels with them (ADR-029).
 * @param hash A fixed fragment (stories and tests); omit to follow the page's own link, which
 * also updates when a new link is opened in the same tab (only the fragment changes then).
 * @param loadThread Fetches a shared thread's sealed bytes from the host's server.
 */
export function ShareView({ hash, loadThread }: { hash?: string; loadThread?: LoadShare }) {
  const live = useSyncExternalStore(subscribeToHash, readHash, readServerHash); // → "#c=…" or ""
  const fragment = hash ?? live;
  const thread = readThreadLink(fragment); // → { id, key } | undefined
  return (
    <main className="share-page">
      <div className="share-frame" data-context="thread">
        {thread === undefined ? (
          <SharedCardView hash={fragment} />
        ) : (
          <SharedThreadView id={thread.id} shareKey={thread.key} load={loadThread} />
        )}
      </div>
    </main>
  );
}
