import { useAuth } from "@workos-inc/authkit-react";
import type { Session } from "@yaklabs/runtime";
import { useEffect, type ReactNode } from "react";
import { env } from "./env";

/**
 * What sign-in carries through WorkOS for `safeReturnTo` to read back: where the visitor was,
 * with the query, so a `?scenario=` link lands on its mock and never on the device's data.
 */
export function signInState(at: Pick<Location, "pathname" | "search">): { returnTo: string } {
  return { returnTo: at.pathname + at.search };
}

// Sends signed-out visitors to WorkOS's hosted sign-in and shows nothing of the app until
// they are back (ADR-084). The address they wanted rides along in `state`.
function WorkOsGate({ children }: { children: ReactNode }) {
  const { isLoading, user, signIn } = useAuth();
  useEffect(() => {
    if (!isLoading && user === null) void signIn({ state: signInState(window.location) });
  }, [isLoading, user, signIn]);
  if (user === null) return <p className="p-4 text-soft-ink">Signing you in…</p>;
  return children;
}

function OpenGate({ children }: { children: ReactNode }) {
  return children;
}

function useWorkOsSession(): Session {
  const { getAccessToken } = useAuth();
  return { getAccessToken: () => getAccessToken() };
}

function useNoSession(): Session | undefined {
  return undefined;
}

/** Wraps every protected route: a pass-through without sign-in, the WorkOS gate with it. */
export const RequireSession = env.auth.kind === "workos" ? WorkOsGate : OpenGate;

/** The visitor's session, or undefined when the build has no sign-in. */
export const useSession = env.auth.kind === "workos" ? useWorkOsSession : useNoSession;
