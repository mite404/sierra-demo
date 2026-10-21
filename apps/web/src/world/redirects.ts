import { threadIdSchema, type ThreadId } from "@yaklabs/runtime";
import { matchPath, redirect, type ClientLoaderFunctionArgs } from "react-router";
import { DEMO_WORLD } from "./demo";
import { ids } from "./ids";
import { scriptsOf } from "./spec";

// A retired address and the thread it names now, from its path's params and its query.
type Retired = {
  pattern: string;
  to: (params: Partial<Record<string, string>>, search: URLSearchParams) => ThreadId | undefined;
};

// The device starter's thread (packages/runtime store.ts), which `/playground` became.
const PLAYGROUND = threadIdSchema.parse("playground");

// The only query a redirect keeps: a screenshot run's painting (splash.ts).
const CARRIED = ["splash"] as const;

// The Demo show a retired `?script=` names, or the first show for none or an unknown one.
function showFor(name: string | null): ThreadId {
  const scripts = scriptsOf(DEMO_WORLD);
  const named = scripts.find((script) => script.id === name) ?? scripts[0];
  return ids.show(named.id);
}

// The table: the only place the retired addresses are known. Every target is a plain
// `/t/:threadId`, which no row matches, so a redirect never leads to another.
const RETIRED: readonly Retired[] = [
  { pattern: "/playground", to: () => PLAYGROUND },
  { pattern: "/demo/weekly-brief", to: (_, search) => showFor(search.get("script")) },
  {
    pattern: "/demo/weekly-brief/t/:threadId",
    to: (params) => threadIdSchema.safeParse(params.threadId).data,
  },
];

// The query a redirect keeps from `search`, with its `?`, or nothing.
function carried(search: URLSearchParams): string {
  const kept = new URLSearchParams(
    CARRIED.flatMap((key) => {
      const value = search.get(key);
      return value === null ? [] : [[key, value]];
    }),
  );
  return kept.size === 0 ? "" : `?${kept.toString()}`;
}

/**
 * Where a retired address goes now, as a plain `/t/:threadId` path keeping only `?splash=`;
 * null for any address the table does not know.
 */
export function redirectFor(url: URL): string | null {
  for (const retired of RETIRED) {
    const match = matchPath(retired.pattern, url.pathname); // → params, or null
    const id = match === null ? undefined : retired.to(match.params, url.searchParams);
    if (id !== undefined) return `/t/${encodeURIComponent(id)}${carried(url.searchParams)}`;
  }
  return null;
}

/**
 * A retired route's `clientLoader`: a redirect before anything renders, home for an address
 * under a retired route that the table does not know.
 */
export function legacyRedirect({ request }: ClientLoaderFunctionArgs): Response {
  return redirect(redirectFor(new URL(request.url)) ?? "/");
}
