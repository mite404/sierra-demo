import { AuthKitProvider } from "@workos-inc/authkit-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { env } from "./env";
import { safeReturnTo } from "./returnTo";

/**
 * WorkOS AuthKit in the browser (ADR-084), around the whole app when the build signs in; the
 * provider also finishes the sign-in when the callback route loads with a code. Dev mode
 * everywhere keeps the refresh token in localStorage: without a custom auth domain, the
 * alternative is a cookie on api.workos.com, which the browser blocks as third-party, so every
 * reply after the first token expired failed (ADR-154).
 */
export function Providers({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  if (env.auth.kind === "none") return children;
  return (
    <AuthKitProvider
      clientId={env.auth.clientId}
      redirectUri={env.auth.redirectUri}
      devMode
      onRedirectCallback={({ state }) =>
        void navigate(safeReturnTo(state, window.location.origin), { replace: true })
      }
    >
      {children}
    </AuthKitProvider>
  );
}
