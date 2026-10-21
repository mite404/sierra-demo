import { resolveAwaiting } from "@yaklabs/catalog/awaiting";
import { describe, expect, it } from "vitest";
import { KEEP_AWAKE, parseWhen, snoozeChoices, snoozeQuestion, WAKE_NOW, wakeFor } from "./snooze";

// Monday 28 September 2026, 10:03 on the machine's own clock; every expectation is built the
// same way, so the tests hold in any time zone.
const NOW = new Date(2026, 8, 28, 10, 3);
const on = (month: number, day: number, hour = 9, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute);
const says = (...texts: string[]) => texts.map((text) => ({ text }));
const iso = (date: Date | undefined) => date?.toISOString();
// The tiles' labels for a thread that says only `text`.
const labels = (text: string) => snoozeChoices(says(text), NOW).map((each) => each.label);

describe("snoozeChoices falls back to 1 hour, Tomorrow and Next week (ADR-128)", () => {
  it("offers the three with nothing to go on", () => {
    expect(snoozeChoices(says("Why is Saturday high?", "Saturday leads."), NOW)).toEqual([
      { label: "In 1 hour", detail: "Today at 11:03", until: iso(on(9, 28, 11, 3)) },
      { label: "Tomorrow", detail: "Tuesday 29 September at 9:00", until: iso(on(9, 29)) },
      { label: "Next week", detail: "Monday 5 October at 10:03", until: iso(on(10, 5, 10, 3)) },
    ]);
  });
});

describe("snoozeChoices leads with what the thread says (ADR-128)", () => {
  it("offers a date the thread names, still ahead, before the fallbacks", () => {
    const choices = snoozeChoices(says("The supplier replies on October 3."), NOW);
    expect(choices.map((each) => each.label)).toEqual([
      "Saturday 3 October",
      "In 1 hour",
      "Tomorrow",
      "Next week",
    ]);
    expect(choices[0]).toEqual({
      label: "Saturday 3 October",
      detail: "Mentioned in the thread. At 9:00",
      until: iso(on(10, 3)),
    });
  });

  it("reads a weekday only when the words around it make it a date", () => {
    expect(labels("Can we look again by Friday?")[0]).toBe("Friday 2 October");
    expect(labels("Revenue on Friday was up.")[0]).toBe("In 1 hour");
  });

  it("skips a date gone by, keeps the latest message's first, and never offers one twice", () => {
    const choices = snoozeChoices(
      says("Sep 14–20 was slow.", "Due 2026-10-06, or by Tuesday 6 October."),
      NOW,
    );
    expect(choices.map((each) => each.label)).toEqual([
      "Tuesday 6 October",
      "In 1 hour",
      "Tomorrow",
      "Next week",
    ]);
  });

  it("keeps to four, the card's limit", () => {
    const choices = snoozeChoices(
      says("By Friday, then Oct 9, then 12 October, then Oct 20."),
      NOW,
    );
    expect(choices).toHaveLength(4);
    expect(choices.map((each) => each.label)).toEqual([
      "Friday 2 October",
      "Friday 9 October",
      "Monday 12 October",
      "In 1 hour",
    ]);
  });
});

describe("parseWhen reads a typed time (ADR-128)", () => {
  it.each<[string, Date]>([
    ["in 3 hours", new Date(NOW.getTime() + 3 * 60 * 60 * 1000)],
    ["in 20 minutes", new Date(NOW.getTime() + 20 * 60 * 1000)],
    ["in 2 days", on(9, 30, 10, 3)],
    ["tomorrow", on(9, 29)],
    ["Tomorrow 3pm", on(9, 29, 15)],
    ["friday", on(10, 2)],
    ["Fri 9:30am", on(10, 2, 9, 30)],
    ["monday", on(10, 5)],
    ["oct 3", on(10, 3)],
    ["3 October 14:00", on(10, 3, 14)],
    ["2026-10-06", on(10, 6)],
    ["3pm", on(9, 28, 15)],
    ["9am", on(9, 29, 9)],
    ["next week", on(10, 5, 10, 3)],
  ])("reads %j", (text, expected) => {
    expect(parseWhen(text, NOW)).toEqual(expected);
  });

  it.each([
    "",
    "soonish",
    "yesterday",
    "Sep 1",
    "in 0 hours",
    "2026-13-40",
    "25:00",
    "13pm",
    "9:75",
  ])("refuses %j", (text) => {
    expect(parseWhen(text, NOW)).toBeUndefined();
  });
});

describe("snoozeQuestion asks in the agent's card, within its limits (ADR-039, ADR-128)", () => {
  const choices = snoozeChoices([], NOW);

  it("asks when to come back, with a field for any time and a way out", () => {
    const question = snoozeQuestion(choices, null);
    expect(resolveAwaiting(question)).toEqual({ kind: "approved", question });
    expect(question.question).toBe("When should this thread come back?");
    expect(question.elsewhere).toBe(KEEP_AWAKE);
  });

  it("offers to wake a snoozed thread first, saying when it would have woken", () => {
    const question = snoozeQuestion(choices, on(10, 2));
    expect(resolveAwaiting(question).kind).toBe("approved");
    expect(question.question).toBe("It wakes Friday 2 October at 9:00. Change that?");
    expect(question.options.map((each) => each.label)).toEqual([
      WAKE_NOW,
      "In 1 hour",
      "Tomorrow",
      "Next week",
    ]);
  });
});

describe("wakeFor turns the card's answer into a wake (ADR-128)", () => {
  const choices = snoozeChoices([], NOW);

  it.each<[string, string | null | undefined]>([
    [WAKE_NOW, null],
    ["Tomorrow", iso(on(9, 29))],
    ["friday 3pm", iso(on(10, 2, 15))],
    ["whenever", undefined],
  ])("reads %j", (answer, expected) => {
    expect(wakeFor(answer, choices, NOW)).toBe(expected);
  });
});
