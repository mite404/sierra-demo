import { ShareView } from "@yaklabs/catalog";
import { env } from "../env";

export function meta() {
  return [{ title: "Shared from Kay" }];
}

// A shared thread's sealed bytes, from the gateway that keeps them (ADR-131); nothing once the
// share has ended, been taken down, or the build has no share server.
async function loadThread(id: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const response = await fetch(`${env.shareBase}/api/shares/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
}

/**
 * The public page for what someone shared: one card, which rides in the link's fragment
 * (ADR-064), or a thread made public for a while, opened with the key in the fragment (ADR-131).
 */
export default function SharePage() {
  return <ShareView loadThread={loadThread} />;
}
