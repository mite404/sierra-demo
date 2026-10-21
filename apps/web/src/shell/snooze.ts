import type { AwaitingInput } from "@yaklabs/catalog/awaiting";
import { clock, wakeText } from "./wake-text";

/** One way to snooze: what the card's tile says, and when the thread wakes. */
export type SnoozeChoice = { label: string; detail: string; until: string };

/** The tile that wakes a snoozed thread at once. */
export const WAKE_NOW = "Wake it now";
/** The card's way out when the thread is awake. */
export const KEEP_AWAKE = "Keep it awake";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// A day-level snooze wakes at the start of the working day.
const MORNING = { hours: 9, minutes: 0 };
// A date written without a year means its next occurrence, only if that is this close; further
// out, a thread naming "Sep 14" is talking about the past, not asking to wait eleven months.
const YEARLESS_HORIZON = 183 * DAY;
// The card takes four tiles (ADR-040): up to three from the thread, the fallbacks after them.
const TILES = 4;
const FROM_CONTEXT = 3;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAY = String.raw`(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?`;
const MONTH = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*`;
const TIME = String.raw`(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`;
const UNITS: Record<string, number> = {
  minute: MINUTE,
  min: MINUTE,
  hour: HOUR,
  hr: HOUR,
  day: DAY,
  week: 7 * DAY,
};

// Dates written out, with an optional weekday in front that belongs to them: "Tuesday 6
// October", "Oct 3", "2026-10-06". Each is one mention, so its weekday is never read again.
const WRITTEN_DATES = [
  new RegExp(String.raw`\b(?:${WEEKDAY},?\s+)?(\d{4})-(\d{2})-(\d{2})\b`, "gi"),
  new RegExp(String.raw`\b(?:${WEEKDAY},?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH})\b`, "gi"),
  new RegExp(String.raw`\b(?:${WEEKDAY},?\s+)?(${MONTH})\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "gi"),
];
// A weekday reads as a date only after a word that makes it one: analytics threads say
// "Saturday" all the time and mean the day of the week in their data.
const CUED_WEEKDAY = new RegExp(
  String.raw`\b(?:by|until|till|before|next|this|due|coming)\s+(${WEEKDAY})\b`,
  "gi",
);

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
function atTime(day: Date, hours: number, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

function addDays(day: Date, days: number): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() + days,
    day.getHours(),
    day.getMinutes(),
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function weekdayIndex(word: string): number {
  return WEEKDAYS.findIndex((day) => day.startsWith(word.toLowerCase().slice(0, 3)));
}

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.toLowerCase().slice(0, 3));
}

// The next such weekday after today, at `time`: one to seven days ahead, a week for today's.
function nextWeekday(now: Date, index: number, time = MORNING): Date {
  const ahead = ((index - now.getDay() + 6) % 7) + 1;
  return atTime(addDays(now, ahead), time.hours, time.minutes);
}

// A calendar date, or undefined when it does not exist (31 September, month 13).
function calendarDate(year: number, month: number, day: number, time = MORNING): Date | undefined {
  const date = new Date(year, month, day, time.hours, time.minutes);
  return date.getMonth() === month && date.getDate() === day ? date : undefined;
}

// A date written without a year: its next occurrence, if that is within the horizon.
function yearless(now: Date, month: number, day: number, time = MORNING): Date | undefined {
  const date = [now.getFullYear(), now.getFullYear() + 1]
    .map((year) => calendarDate(year, month, day, time))
    .find((each) => each !== undefined && each > now);
  return date !== undefined && date.getTime() - now.getTime() <= YEARLESS_HORIZON
    ? date
    : undefined;
}

// The date one written-date match names: ISO, day-month or month-day.
function writtenDate(
  match: RegExpMatchArray,
  form: number,
  now: Date,
  time = MORNING,
): Date | undefined {
  const [, first = "", second = "", third = ""] = match;
  if (form === 0) {
    const date = calendarDate(Number(first), Number(second) - 1, Number(third), time);
    return date !== undefined && date > now ? date : undefined;
  }
  const [dayText, monthText] = form === 1 ? [first, second] : [second, first];
  const month = monthIndex(monthText);
  return month === -1 ? undefined : yearless(now, month, Number(dayText), time);
}

// Every date a message names, where it names it: written dates first (blanked out so their
// weekdays are not read again), then cued weekdays, in the order the text has them.
function mentions(text: string, now: Date): { at: number; date: Date }[] {
  let rest = text;
  const found: { at: number; date: Date }[] = [];
  for (const [form, pattern] of WRITTEN_DATES.entries()) {
    for (const match of rest.matchAll(pattern)) {
      const date = writtenDate(match, form, now);
      if (date !== undefined) found.push({ at: match.index, date });
      rest =
        rest.slice(0, match.index) +
        " ".repeat(match[0].length) +
        rest.slice(match.index + match[0].length);
    }
  }
  for (const match of rest.matchAll(CUED_WEEKDAY)) {
    const index = weekdayIndex(match[1]);
    if (index !== -1) found.push({ at: match.index, date: nextWeekday(now, index) });
  }
  return found.toSorted((a, b) => a.at - b.at);
}

function fallbacks(now: Date): SnoozeChoice[] {
  const hour = new Date(now.getTime() + HOUR);
  const tomorrow = atTime(addDays(now, 1), MORNING.hours, MORNING.minutes);
  const week = addDays(now, 7);
  const when = (at: Date) =>
    `${isSameDay(at, now) ? "Today" : dayFormat.format(at)} at ${clock(at)}`;
  return [
    { label: "In 1 hour", detail: when(hour), until: hour.toISOString() },
    { label: "Tomorrow", detail: when(tomorrow), until: tomorrow.toISOString() },
    { label: "Next week", detail: when(week), until: week.toISOString() },
  ];
}

/**
 * The snooze card's tiles (ADR-128): dates the thread names that are still ahead, newest
 * message first and each once, up to three; then In 1 hour, Tomorrow (9:00) and Next week
 * (seven days from now), to four tiles in all.
 */
export function snoozeChoices(messages: { text: string }[], now: Date): SnoozeChoice[] {
  const found = messages.toReversed().flatMap((message) => mentions(message.text, now));
  const fromThread = found
    .filter(
      ({ date }, i) => found.findIndex((each) => each.date.getTime() === date.getTime()) === i,
    )
    .slice(0, FROM_CONTEXT)
    .map(({ date }) => ({
      label: dayFormat.format(date),
      detail: `Mentioned in the thread. At ${clock(date)}`,
      until: date.toISOString(),
    }));
  return [...fromThread, ...fallbacks(now)].slice(0, TILES);
}

// The hour on a 24-hour clock: 0 to 23 as written, or 1 to 12 with am or pm; NaN otherwise.
function hour24(raw: number, half: string | undefined): number {
  if (half === undefined) return raw < 24 ? raw : Number.NaN;
  if (raw < 1 || raw > 12) return Number.NaN;
  return (raw % 12) + (half.toLowerCase() === "pm" ? 12 : 0);
}

// "3pm", "15:00", "9:30am"; a bare number is not a time. The groups are TIME's.
function readTime(hourText: string, minuteText: string | undefined, half: string | undefined) {
  const hours = hour24(Number(hourText), half);
  const minutes = Number(minuteText ?? 0);
  const written = minuteText !== undefined || half !== undefined;
  return written && !Number.isNaN(hours) && minutes < 60 ? { hours, minutes } : undefined;
}

// A time of day on its own: today if it is still ahead, else tomorrow.
function timeOnly(text: string, now: Date): Date | undefined {
  const match = new RegExp(String.raw`^${TIME}$`, "i").exec(text);
  const time = match === null ? undefined : readTime(match[1], match[2], match[3]);
  if (time === undefined) return undefined;
  const today = atTime(now, time.hours, time.minutes);
  return today > now ? today : addDays(today, 1);
}

// "in 3 hours", "in 20 minutes", "in 2 days".
function relative(text: string, now: Date): Date | undefined {
  const match = /^in\s+(\d+)\s+(minute|min|hour|hr|day|week)s?$/i.exec(text);
  const unit = match === null ? 0 : (UNITS[match[2].toLowerCase()] ?? 0);
  const count = match === null ? 0 : Number(match[1]);
  return count > 0 && unit > 0 ? new Date(now.getTime() + count * unit) : undefined;
}

// A day alone, at `time`: "tomorrow", "Fri", "3 October", "2026-10-06".
function dayAt(dayText: string, now: Date, time: { hours: number; minutes: number }) {
  const day = dayText.toLowerCase();
  if (day === "tomorrow") return atTime(addDays(now, 1), time.hours, time.minutes);
  if (new RegExp(String.raw`^${WEEKDAY}$`, "i").test(day)) {
    return nextWeekday(now, weekdayIndex(day), time);
  }
  // The written forms in turn; at most one of them reads the whole text.
  const dates = WRITTEN_DATES.flatMap((pattern, form) => {
    const match = new RegExp(`^${pattern.source}$`, "i").exec(dayText);
    return match === null ? [] : [writtenDate(match, form, now, time)];
  });
  return dates.at(0);
}

// A day, then maybe a time: "tomorrow 3pm", "Fri 9:30am", "3 October 14:00". The whole text is
// read as a day first, so "oct 3" is a date and not "oct" at three.
function dayAndTime(text: string, now: Date): Date | undefined {
  const whole = dayAt(text, now, MORNING);
  if (whole !== undefined) return whole;
  const match = new RegExp(String.raw`^(.*?)\s+${TIME}$`, "i").exec(text);
  if (match === null) return undefined;
  const time = readTime(match[2], match[3], match[4]);
  return time === undefined ? undefined : dayAt(match[1], now, time);
}

/**
 * Reads a time the user typed into the snooze card (ADR-128): "in 3 hours", "tomorrow 3pm",
 * "friday", "Fri 9:30am", "oct 3", "3 October 14:00", "2026-10-06", "3pm", "next week". A day
 * with no time wakes at 9:00; a time alone is today's if still ahead, else tomorrow's.
 * @returns The instant, or undefined when the words are not a time or it is not ahead.
 */
export function parseWhen(text: string, now: Date): Date | undefined {
  const words = text.trim().replaceAll(/\s+/g, " ");
  if (words === "") return undefined;
  if (/^next week$/i.test(words)) return addDays(now, 7);
  const date = relative(words, now) ?? timeOnly(words, now) ?? dayAndTime(words, now);
  return date !== undefined && date > now ? date : undefined;
}

/**
 * The snooze card's question in the agent's card format (ADR-039), checked by the same schema:
 * the tiles, a field for any time, and a way out. A snoozed thread is offered its wake first.
 * @param snoozedUntil When the thread wakes now, or null when it is awake.
 */
export function snoozeQuestion(choices: SnoozeChoice[], snoozedUntil: Date | null): AwaitingInput {
  const tiles = choices.map(({ label, detail }) => ({ label, detail }));
  const answer = { placeholder: "Or type a time, like Friday 3pm" };
  if (snoozedUntil === null) {
    return {
      question: "When should this thread come back?",
      options: tiles,
      answer,
      elsewhere: KEEP_AWAKE,
    };
  }
  const wakes = wakeText(snoozedUntil, "long");
  return {
    question: `It wakes ${wakes}. Change that?`,
    options: [{ label: WAKE_NOW }, ...tiles].slice(0, TILES),
    answer,
    elsewhere: "Leave the snooze as it is",
  };
}

/**
 * When the card's answer wakes the thread (ADR-128): null for Wake it now, a tile's instant for
 * its label, or the typed time `parseWhen` reads.
 * @returns undefined when the words are not a time that is still ahead.
 */
export function wakeFor(
  answer: string,
  choices: SnoozeChoice[],
  now: Date,
): string | null | undefined {
  if (answer === WAKE_NOW) return null;
  const tile = choices.find((choice) => choice.label === answer);
  return tile === undefined ? parseWhen(answer, now)?.toISOString() : tile.until;
}
