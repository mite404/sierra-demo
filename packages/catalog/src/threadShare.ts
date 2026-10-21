import { z } from "zod";
import type { ThreadMessage } from "./thread";

/**
 * A whole thread made public for a while (ADR-131): its title, its turns, and when the link
 * stops working. Card payloads stay opaque here; each card's own check runs before it renders.
 */
export type SharedThread = { v: 1; title: string; messages: ThreadMessage[]; expiresAt: string };

// The parts of a location a link is built from.
type LinkBase = Pick<Location, "href">;

// Everything after `#t=` is `<id>.<key>`: the id names the ciphertext the server keeps, and the
// key, in the fragment, never reaches the server, so only someone with the link can read it.
const PREFIX = "t=";
const PART = /^[\w-]+$/;
// AES-GCM's recommended nonce: 96 bits, fresh for every seal.
const IV_BYTES = 12;

const idSchema = z.string();
const cardAttachmentSchema = z.object({
  turnId: z.string(),
  label: z.string(),
  state: z.object({ measure: z.string() }),
});
const messageSchema: z.ZodType<ThreadMessage> = z.discriminatedUnion("role", [
  z.object({
    id: idSchema,
    role: z.literal("user"),
    text: z.string(),
    time: z.string(),
    attachments: z.array(cardAttachmentSchema).optional(),
    files: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  }),
  z.object({
    id: idSchema,
    role: z.literal("agent"),
    text: z.string(),
    time: z.string(),
    payload: z.unknown().optional(),
    interactive: z.unknown().optional(),
    streaming: z.boolean().optional(),
  }),
]);
const sharedThreadSchema = z.object({
  v: z.literal(1),
  title: z.string(),
  messages: z.array(messageSchema),
  expiresAt: z.iso.datetime(),
});

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): Uint8Array<ArrayBuffer> {
  const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
}

/**
 * Seals a thread for the server (ADR-131): AES-GCM under a fresh 256-bit key, the nonce first
 * and the ciphertext after it. The server keeps only `sealed`; the link carries `key`.
 */
export async function sealThread(
  thread: SharedThread,
): Promise<{ sealed: Uint8Array<ArrayBuffer>; key: string }> {
  const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = new TextEncoder().encode(JSON.stringify(thread));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plain),
  );
  const sealed = new Uint8Array(IV_BYTES + cipher.length);
  sealed.set(iv);
  sealed.set(cipher, IV_BYTES);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", cryptoKey));
  return { sealed, key: toBase64Url(raw) };
}

/**
 * Opens what `sealThread` made, with its key. A wrong key, damaged bytes, or a thread that
 * fails its check all open nothing, so the page can say so honestly.
 */
export async function openSealedThread(
  sealed: Uint8Array<ArrayBuffer>,
  key: string,
): Promise<SharedThread | undefined> {
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", fromBase64Url(key), "AES-GCM", false, [
      "decrypt",
    ]);
    const iv = sealed.slice(0, IV_BYTES);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      sealed.slice(IV_BYTES),
    );
    const parsed = sharedThreadSchema.safeParse(JSON.parse(new TextDecoder().decode(plain)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    // A key that is not one, or bytes the key does not open.
    return undefined;
  }
}

/** The public link to a shared thread: the site's share page, the id and key in its fragment. */
export function threadLink(id: string, key: string, at: LinkBase = window.location): string {
  return `${new URL("/share.html", at.href).href}#${PREFIX}${id}.${key}`;
}

/** The id and key a thread link's fragment carries; undefined for a card's link or a garbled one. */
export function readThreadLink(hash: string): { id: string; key: string } | undefined {
  const fragment = hash.replace(/^#/, "");
  if (!fragment.startsWith(PREFIX)) return undefined;
  const parts = fragment.slice(PREFIX.length).split(".");
  if (parts.length !== 2) return undefined;
  const [id = "", key = ""] = parts;
  return PART.test(id) && PART.test(key) ? { id, key } : undefined;
}
