import type { AgentEvent } from "@yaklabs/catalog/agent";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { describe, expect, it } from "vitest";
import { firstAskTitle } from "./conversation";

const typed = (text: string): AgentEvent => ({ kind: "message", text, attachments: [] });
const asked: ThreadMessage = { id: "u1", role: "user", text: "Hello", time: "10:03" };

describe("firstAskTitle", () => {
  it("takes the first message's words, on one line", () => {
    expect(firstAskTitle([], typed("Summarise\n  last week's refunds"))).toBe(
      "Summarise last week's refunds",
    );
  });

  it("cuts a long message at a word, as a lane's header does", () => {
    const long = "Compare every store's refunds against the week before and flag the outliers";
    expect(firstAskTitle([], typed(long))).toBe("Compare every store's refunds against the week…");
  });

  it("names nothing once the thread has a user turn", () => {
    expect(firstAskTitle([asked], typed("Another question"))).toBeUndefined();
  });

  it("names nothing for a message with no words, or an answer", () => {
    expect(firstAskTitle([], typed("   "))).toBeUndefined();
    expect(firstAskTitle([], { kind: "answer", text: "Hold them" })).toBeUndefined();
  });
});
