import { z } from "zod";

// Limits come from the narrow (420px) card, measured at 1x: about 48 characters per line of
// text, and 43 in the one-line typed-answer field. Up to four rows only look considered if
// each stays this short; anything longer means the agent should ask in the thread (ADR-040).
const LINE_CHARS = 48;
const INPUT_CHARS = 40;
const MAX_SENTENCES = 2;
// Two short sentences: about three narrow lines.
const SHORT_TEXT_CHARS = 120;

// Sentence ends: terminal punctuation followed by a space or the end of the text.
function sentenceCount(value: string): number {
  return value.match(/[.!?]+(?=\s|$)/g)?.length ?? 1;
}

const oneLine = z.string().trim().min(1).max(LINE_CHARS);
const shortText = z
  .string()
  .trim()
  .min(1)
  .max(SHORT_TEXT_CHARS)
  .refine((value) => sentenceCount(value) <= MAX_SENTENCES, "Use at most two short sentences");

/**
 * A question the agent is blocked on (ADR-039). The agent supplies the question, the branches
 * it can take, and one concrete question the user can answer by typing. The last row is always
 * a way out: the agent may word it for the moment ("Chat about a plan to ..."), and the host
 * falls back to "Chat about something else", so the user can never be cornered into answering.
 * Each row asks something different, so the card never asks "what do you want?" twice.
 */
export const awaitingSchema = z.strictObject({
  question: shortText,
  options: z
    .array(
      z.strictObject({
        label: oneLine,
        detail: shortText.optional(),
      }),
    )
    .min(1)
    .max(4),
  answer: z.strictObject({ placeholder: z.string().trim().min(1).max(INPUT_CHARS) }),
  elsewhere: shortText.optional(),
});

/** A validated question the agent is waiting on. */
export type AwaitingInput = z.infer<typeof awaitingSchema>;

/**
 * How far an answer shown on the card has got, for a host that answers on the user's behalf (a
 * scripted demo): the pointer over its tile, the tile selected, then Submit pressed.
 */
export type AnswerPhase = "hover" | "selected" | "pressed";

/** The outcome of checking an agent's question: a card to show, or the error for the agent. */
export type AwaitingResult =
  | { kind: "approved"; question: AwaitingInput }
  | { kind: "malformed"; reason: string };

/**
 * Validates an agent's question (ADR-039, ADR-040). A malformed one never becomes a card, not
 * even half of one, and the user never sees the error: `reason` goes back to the agent, which
 * asks for what it needs in an ordinary streamed reply instead.
 */
export function resolveAwaiting(payload: unknown): AwaitingResult {
  const parsed = awaitingSchema.safeParse(payload);
  if (parsed.success) return { kind: "approved", question: parsed.data };
  const reason = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "question"}: ${issue.message}`)
    .join("; ");
  return { kind: "malformed", reason };
}

/**
 * The row a key picks in the card's list (ADR-045): the arrows step around it and a digit
 * picks by badge number; any other key picks nothing.
 */
export function rowForKey(
  key: string,
  selected: number | undefined,
  rows: number,
): number | undefined {
  if (key === "ArrowDown") return ((selected ?? -1) + 1) % rows;
  if (key === "ArrowUp") return ((selected ?? rows) - 1 + rows) % rows;
  const digit = Number(key); // → NaN for anything but a digit key
  return digit >= 1 && digit <= rows ? digit - 1 : undefined;
}

/**
 * Which tile a card shows hovered and which selected: the user's own choice (`chosen`), or,
 * while a host gives an answer on the user's behalf, that answer's tile, hovered and then
 * selected. An answer that is no branch's label leaves the user's choice as it is.
 * @param labels The branches' labels, in the card's order.
 */
export function stagedRows(
  labels: readonly string[],
  staged: { text: string; phase: AnswerPhase } | undefined,
  chosen: number | undefined,
): { hovered: number | undefined; selected: number | undefined } {
  const row = staged === undefined ? -1 : labels.indexOf(staged.text);
  if (row === -1) return { hovered: undefined, selected: chosen };
  if (staged?.phase === "hover") return { hovered: row, selected: chosen };
  return { hovered: undefined, selected: row };
}
