import { z } from "zod";

// What sign-in hands back: `state` travels through WorkOS unprotected, so it is untrusted input.
const stateSchema = z.object({ returnTo: z.string() });

/**
 * The same-origin path a visitor wanted before sign-in, or the thread when the state is
 * missing, malformed, or points anywhere else; an open redirect would otherwise be one
 * crafted link away.
 */
export function safeReturnTo(state: unknown, origin: string): string {
  const parsed = stateSchema.safeParse(state); // → { success, data } | { success, error }
  const url = parsed.success ? URL.parse(parsed.data.returnTo, origin) : null; // → URL | null
  return url?.origin === origin ? url.pathname + url.search : "/";
}
