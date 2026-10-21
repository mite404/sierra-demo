import { z } from "zod";

// Vite exposes only VITE_-prefixed variables to the browser, so everything here is public.
const rawSchema = z.object({
  VITE_AGENT: z.enum(["lab", "gateway"]).default("lab"),
  VITE_GATEWAY_URL: z.url().optional(),
  VITE_AUTH: z.enum(["none", "workos"]).default("none"),
  VITE_WORKOS_CLIENT_ID: z.string().min(1).optional(),
  VITE_WORKOS_REDIRECT_URI: z.url().optional(),
  VITE_DEMO: z.enum(["on", "off"]).default("on"),
});

/** Who answers in the thread: the scripted stand-in, or a model behind the gateway (ADR-085). */
export type AgentSource = { kind: "lab" } | { kind: "gateway"; baseUrl: string };

// How visitors sign in: not at all (local evaluation), or WorkOS AuthKit (ADR-084).
type AuthSource = { kind: "none" } | { kind: "workos"; clientId: string; redirectUri: string };

/**
 * The running build's configuration, with no half-set states. `shareBase` is where public
 * threads are kept: the gateway, on the site's own origin unless a URL is given (ADR-131).
 * `demo` is whether the scripted Demo plays beside the device's own threads.
 */
export type Env = { agent: AgentSource; auth: AuthSource; shareBase: string; demo: boolean };

/**
 * Parses the build's variables once, at the boundary. A gateway with no URL shares the
 * site's origin (ADR-086); WorkOS needs both its client id and its redirect URI.
 * @throws {Error} When the variables contradict each other, so the app fails at start
 * rather than on the first sign-in.
 */
export function parseEnv(raw: Record<string, unknown>, origin: string): Env {
  const vars = rawSchema.parse(raw); // → typed, defaulted variables
  const shareBase = vars.VITE_GATEWAY_URL ?? origin;
  const demo = vars.VITE_DEMO === "on";
  const agent: AgentSource =
    vars.VITE_AGENT === "lab" ? { kind: "lab" } : { kind: "gateway", baseUrl: shareBase };
  if (vars.VITE_AUTH === "none") return { agent, auth: { kind: "none" }, shareBase, demo };
  if (vars.VITE_WORKOS_CLIENT_ID === undefined || vars.VITE_WORKOS_REDIRECT_URI === undefined) {
    throw new Error("VITE_AUTH=workos needs VITE_WORKOS_CLIENT_ID and VITE_WORKOS_REDIRECT_URI");
  }
  return {
    agent,
    shareBase,
    demo,
    auth: {
      kind: "workos",
      clientId: vars.VITE_WORKOS_CLIENT_ID,
      redirectUri: vars.VITE_WORKOS_REDIRECT_URI,
    },
  };
}

/** The running build's configuration; the shell is prerendered without a window. */
export const env = parseEnv(
  import.meta.env,
  typeof window === "undefined" ? "" : window.location.origin,
);
