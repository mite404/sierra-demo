import { describe, expect, it } from "vitest";
import { bookmarkLabel, matchStatus, matchesOf, requestsOf, stepMatch } from "./threadReading";
import type { ThreadMessage } from "./thread";

const messages: ThreadMessage[] = [
  { id: "u1", role: "user", text: "How did profit do last week?", time: "9:02" },
  { id: "a1", role: "agent", text: "Profit rose 12% on the week.", time: "9:02" },
  { id: "u2", role: "user", text: "Show revenue", time: "9:05" },
  { id: "a2", role: "agent", text: "Here is revenue by day.", time: "9:05" },
];

describe("bookmarkLabel", () => {
  it("keeps a short request whole", () => {
    expect(bookmarkLabel("Show revenue")).toBe("Show revenue");
  });

  it("keeps enough context to distinguish requests with the same opening", () => {
    expect(bookmarkLabel("Show me refunds by warehouse for September")).toBe(
      "Show me refunds by warehouse for September",
    );
    expect(bookmarkLabel("Show me refunds by agent for September")).toBe(
      "Show me refunds by agent for September",
    );
  });

  it("marks a cut only beyond 48 characters", () => {
    expect(bookmarkLabel("123456789012345678901234567890123456789012345678")).toBe(
      "123456789012345678901234567890123456789012345678",
    );
    expect(bookmarkLabel("1234567890123456789012345678901234567890123456789")).toBe(
      "123456789012345678901234567890123456789012345678…",
    );
  });

  it("never splits an emoji, and folds line breaks into spaces", () => {
    expect(bookmarkLabel("📈".repeat(49))).toBe(`${"📈".repeat(48)}…`);
    expect(bookmarkLabel("  two\n\nlines ")).toBe("two lines");
  });
});

describe("requestsOf", () => {
  it("lists only the user's turns, oldest first", () => {
    expect(requestsOf(messages).map((request) => request.id)).toEqual(["u1", "u2"]);
    expect(requestsOf(messages)[0]).toMatchObject({
      label: "How did profit do last week?",
      time: "9:02",
    });
  });

  it("leaves out an answer to a docked question, which is not a request", () => {
    const answered: ThreadMessage[] = [
      ...messages,
      { id: "u3", role: "user", text: "North", question: "Which region?", time: "9:06" },
    ];
    expect(requestsOf(answered).map((request) => request.id)).toEqual(["u1", "u2"]);
    expect(matchesOf(answered, "north")).toEqual([{ turnId: "u3", nth: 0 }]);
  });
});

// The matches a list of "turn#nth" names, for short expectations.
const at = (...names: string[]) =>
  names.map((name) => {
    const [turnId, nth] = name.split("#");
    return { turnId, nth: Number(nth) };
  });

describe("matchesOf", () => {
  it("finds each occurrence in turns of either role, ignoring case", () => {
    expect(matchesOf(messages, "PROFIT")).toEqual(at("u1#0", "a1#0"));
    expect(matchesOf(messages, "revenue")).toEqual(at("u2#0", "a2#0"));
  });

  it("counts every occurrence in a turn, in reading order, never overlapping", () => {
    const repeated: ThreadMessage[] = [
      { id: "a1", role: "agent", text: "Refund one, refund two, REFUND three.", time: "9:02" },
      { id: "a2", role: "agent", text: "aaaa", time: "9:03" },
    ];
    expect(matchesOf(repeated, "refund")).toEqual(at("a1#0", "a1#1", "a1#2"));
    expect(matchesOf(repeated, "aa")).toEqual(at("a2#0", "a2#1"));
  });

  it("matches nothing for a blank query", () => {
    expect(matchesOf(messages, "   ")).toEqual([]);
  });
});

describe("stepMatch", () => {
  const matches = at("u1#0", "a1#0", "a1#1");

  it("starts at the first going forward and the last going back", () => {
    expect(stepMatch(matches, undefined, 1)).toEqual(at("u1#0")[0]);
    expect(stepMatch(matches, undefined, -1)).toEqual(at("a1#1")[0]);
  });

  it("steps occurrence by occurrence, within a turn too, and wraps at either end", () => {
    expect(stepMatch(matches, at("a1#0")[0], 1)).toEqual(at("a1#1")[0]);
    expect(stepMatch(matches, at("a1#1")[0], 1)).toEqual(at("u1#0")[0]);
    expect(stepMatch(matches, at("u1#0")[0], -1)).toEqual(at("a1#1")[0]);
  });

  it("starts over when the current match no longer matches", () => {
    expect(stepMatch(matches, at("gone#0")[0], 1)).toEqual(at("u1#0")[0]);
    expect(stepMatch([], at("u1#0")[0], 1)).toBeUndefined();
  });
});

describe("matchStatus", () => {
  it("counts matches until one is showing, then says which", () => {
    expect(matchStatus([])).toBe("No matches");
    expect(matchStatus(at("u1#0"))).toBe("1 match");
    expect(matchStatus(at("u1#0", "a1#0"))).toBe("2 matches");
    expect(matchStatus(at("u1#0", "a1#0"), at("a1#0")[0])).toBe("2 of 2");
  });
});
