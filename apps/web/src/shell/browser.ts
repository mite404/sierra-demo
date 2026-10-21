import { z } from "zod";

// The brand alone; `parseAddress` below is the only caller.
const brandSchema = z.string().brand<"PageAddress">();

/** An address the simulated browser can show; `parseAddress` is the only thing that makes one. */
export type PageAddress = z.infer<typeof brandSchema>;

/** Which registered page an address shows, or the stand-in for any other address. */
export type PageKind = "start" | "radar" | "docs" | "simulated";

/** A page as the browser pane draws it: which kind, its title, and where it lives. */
export type Page = { kind: PageKind; title: string; address: PageAddress };

// Anything past this is not an address a person could have meant.
const MAX_LENGTH = 2048;

/**
 * Reads what a person typed, or what a saved shell holds, as an address: a missing scheme gains
 * `https://`, the host is lowercased, the fragment is dropped, and only http and https without
 * credentials pass.
 * Anything else is null, and the field keeps what was typed. Parsing a result again returns it
 * unchanged, so the address field and the registry agree on every key.
 */
export function parseAddress(input: string): PageAddress | null {
  const typed = input.trim();
  if (typed === "" || /\s/.test(typed)) return null;
  const url = URL.parse(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`);
  const web = url !== null && ["http:", "https:"].includes(url.protocol) && url.hostname !== "";
  if (!web || url.username !== "" || url.password !== "") return null;
  url.hash = "";
  // The limit holds for the canonical form, which percent-encoding can make many times longer
  // than what was typed, so the address a shell saves is one this parse accepts again.
  return url.href.length > MAX_LENGTH ? null : brandSchema.parse(url.href);
}

/** The address schema for saved shells: the same parse, so a stored address is a canonical one. */
export const pageAddressSchema = z.string().transform((raw, context) => {
  const address = parseAddress(raw); // → PageAddress | null
  if (address === null) {
    context.addIssue({ code: "custom", message: `Not an address: ${raw}` });
    return z.NEVER;
  }
  return address;
});

// Every page the browser knows, on .example hosts (RFC 2606) so no real site is imitated and
// nothing reaches the network.
const REGISTRY: [string, Exclude<PageKind, "simulated">, string][] = [
  ["https://start.example/", "start", "Start"],
  ["https://weather.example/radar", "radar", "Radar"],
  ["https://docs.example/kay", "docs", "Kay docs"],
];

const PAGES = new Map(
  REGISTRY.map(([raw, kind, title]) => {
    const address = pageAddressSchema.parse(raw); // → PageAddress; a bad key fails at load
    return [address, { kind, title, address }] as const;
  }),
);

/** Where a new browser pane opens. */
export const START_PAGE = pageAddressSchema.parse("https://start.example/");

/** Every registered page, in the order the start page lists them. */
export const REGISTERED_PAGES: Page[] = [...PAGES.values()];

/** The page at an address: a registered one, or the stand-in that says it is simulated. */
export function pageAt(address: PageAddress): Page {
  return PAGES.get(address) ?? { kind: "simulated", title: new URL(address).host, address };
}
