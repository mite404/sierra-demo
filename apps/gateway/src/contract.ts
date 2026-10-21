import { z } from "zod";

// What the browser's worker may send the model through the gateway (ADR-085): plain text
// turns only. The gateway owns the model, the key and every other request setting.
const textBlockSchema = z.object({ type: z.literal("text"), text: z.string().min(1) });
const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([z.string().min(1), z.array(textBlockSchema).min(1).max(20)]),
});

/** The body of `POST /api/messages`; anything else is rejected before the model sees it. */
export const gatewayRequestSchema = z.object({
  system: z.string().max(20_000),
  messages: z.array(turnSchema).min(1).max(200),
});

/** A validated gateway request. */
export type GatewayRequest = z.infer<typeof gatewayRequestSchema>;

/** How long a thread may stay public, in seconds: 1 hour, 6 hours, 1 day, 7 days (ADR-131, ADR-138). */
export const SHARE_TTLS = [60 * 60, 6 * 60 * 60, 24 * 60 * 60, 7 * 24 * 60 * 60] as const;

/** The most a sealed thread may weigh; a thread of a few hundred turns is well under it. */
export const MAX_SHARE_BYTES = 1_000_000;

/** What `POST /api/shares` answers: the share's id, when it ends, and the token that ends it early. */
export const shareCreatedSchema = z.object({
  id: z.string().min(1),
  expiresAt: z.iso.datetime(),
  revokeToken: z.string().min(1),
});

/** A share the gateway made. */
export type ShareCreated = z.infer<typeof shareCreatedSchema>;
