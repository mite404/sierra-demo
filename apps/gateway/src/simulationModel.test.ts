import { expect, it } from "vitest";
import { streamModel } from "./simulationModel";
import { openRouterClient } from "./upstream";

it("requests Kimi K3 without retrying or falling back when the provider rejects it", async () => {
  const requests: unknown[] = [];
  const client = openRouterClient("synthetic-test-key", {
    fetch: async (url, init) => {
      requests.push(await new Request(url, init).json());
      return new Response(JSON.stringify({ error: { message: "Model unavailable" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const text: string[] = [];
  await expect(
    streamModel(
      client,
      {
        system: "Synthetic refund lesson",
        messages: [{ role: "user", content: "Hello" }],
        tools: [],
      },
      {
        signal: new AbortController().signal,
        text: (delta) => {
          text.push(delta);
        },
        toolStarted: () => expect.fail("Rejected requests cannot start tools"),
        execute: () => expect.fail("Rejected requests cannot execute tools"),
      },
    ),
  ).rejects.toThrow("503");
  expect(requests).toEqual([
    expect.objectContaining({ model: "moonshotai/kimi-k3", stream: true, max_tokens: 1400 }),
  ]);
  expect(text).toEqual([]);
});
