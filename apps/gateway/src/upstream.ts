import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";

// OpenRouter's Anthropic-compatible Messages API (ADR-146). The SDK appends `/v1/messages`.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

/**
 * The model API the gateway streams from: OpenRouter, spoken to in the Anthropic Messages
 * format, so the stream the browser reads back is the same whichever model answers (ADR-146).
 * The key goes as `Authorization: Bearer`, the header OpenRouter reads; `apiKey: null` keeps
 * the SDK from sending Anthropic's `x-api-key` beside it.
 *
 * @param options - Test seams such as `fetch` and `maxRetries`; nothing here may move the base
 *   URL or the key.
 */
export function openRouterClient(
  apiKey: string,
  options: Pick<ClientOptions, "fetch" | "maxRetries"> = {},
): Anthropic {
  return new Anthropic({
    ...options,
    baseURL: OPENROUTER_BASE_URL,
    authToken: apiKey,
    apiKey: null,
    // Pinned so an `ANTHROPIC_LOG=debug` binding cannot log request bodies (ADR-085).
    logLevel: "warn",
  });
}
