import { z } from "zod";

const text = z.string().trim().min(1).max(120);
const rows = z
  .array(
    z.strictObject({
      label: z.string().min(1).max(40),
      value: z.number().min(-1e12).max(1e12),
    }),
  )
  .min(1)
  .max(100);

// The only values a live sentence may show; the runtime computes every one of them.
const PLACEHOLDERS = ["measure", "total", "peakLabel", "peakValue", "period"] as const;
type Placeholder = (typeof PLACEHOLDERS)[number];
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

function isPlaceholder(name: string): name is Placeholder {
  return PLACEHOLDERS.some((placeholder) => placeholder === name);
}

function usesOnlyKnownPlaceholders(template: string): boolean {
  return [...template.matchAll(PLACEHOLDER_PATTERN)].every(([, name]) => isPlaceholder(name));
}

/**
 * An interactive catalog card (ADR-029): one chart whose measure the user steps through.
 * The agent supplies every stop's data and a sentence template up front; the runtime
 * switches between them, so no model call happens while the user explores.
 */
export const interactiveSchema = z
  .strictObject({
    catalogVersion: z.literal("1"),
    component: z.literal("BarChart"),
    props: z.strictObject({
      title: text,
      source: text,
      period: z.string().trim().min(1).max(40),
      unit: z.literal("USD"),
      variant: z.literal("measure-steps"),
      control: z.strictObject({
        label: text,
        initial: z.string().min(1).max(40),
        stops: z
          .array(
            z.strictObject({
              id: z.string().regex(/^[a-z][a-z-]{0,39}$/),
              label: z.string().trim().min(1).max(40),
              description: text,
              rows,
            }),
          )
          .min(2)
          .max(6),
      }),
      sentence: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .refine(usesOnlyKnownPlaceholders, "Sentence uses an unknown placeholder"),
      steps: z.array(text).min(1).max(8),
    }),
  })
  .superRefine(({ props }, context) => {
    const { stops, initial } = props.control;
    const labels = stops[0].rows.map((row) => row.label).join("|");
    if (!stops.some((stop) => stop.id === initial))
      context.addIssue({ code: "custom", message: "Initial stop does not exist" });
    if (new Set(stops.map((stop) => stop.id)).size !== stops.length)
      context.addIssue({ code: "custom", message: "Stop ids must be unique" });
    if (stops.some((stop) => stop.rows.map((row) => row.label).join("|") !== labels))
      context.addIssue({ code: "custom", message: "Every stop must cover the same rows" });
  });

/** A validated interactive card selection. */
export type InteractiveSelection = z.infer<typeof interactiveSchema>;
/** One position on the stepped control, with its own data. */
export type Stop = InteractiveSelection["props"]["control"]["stops"][number];

/** A card choice that rides along with the user's next message (ADR-030, ADR-031). */
export type CardAttachment = {
  turnId: string;
  label: string;
  state: { measure: string };
};

/** Validates untrusted agent output; anything invented rejects the whole card (ADR-024). */
export function resolveInteractive(
  input: unknown,
): { kind: "approved"; selection: InteractiveSelection } | { kind: "rejected" } {
  const parsed = interactiveSchema.safeParse(input);
  return parsed.success ? { kind: "approved", selection: parsed.data } : { kind: "rejected" };
}

// Axis maxima snap to these multiples of a power of ten, so ticks land on round numbers.
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

// One decimal where it carries information, none where it would read "9.0".
function compact(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** Formats dollars compactly for sentences and axes, e.g. "$57.2k", "$9k", or "$950". */
export function formatUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${compact(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${compact(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

/** Rounds an axis maximum up to a round number, e.g. 11,200 becomes 12,000. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = NICE_STEPS.find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** The values a live sentence can show for one stop; the first row wins a tied peak. */
export function summarize(stop: Stop, period: string): Record<Placeholder, string> {
  const total = stop.rows.reduce((sum, row) => sum + row.value, 0);
  const peak = stop.rows.reduce((best, row) => (row.value > best.value ? row : best));
  return {
    measure: stop.label,
    total: formatUsd(total),
    peakLabel: peak.label,
    peakValue: formatUsd(peak.value),
    period,
  };
}

/** A run of a filled sentence: the template's own words, or a live value the card emphasises. */
export type SentencePart = { text: string; live: boolean };

/**
 * Splits a sentence template into text and filled values, so the card can emphasise
 * the live numbers. The schema rejects unknown placeholders; should one reach here anyway,
 * it stays in the text as written rather than filling in as blank.
 */
export function fillSentence(
  template: string,
  values: Record<Placeholder, string>,
): SentencePart[] {
  const parts: SentencePart[] = [];
  let cursor = 0;
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const [whole, name] = match; // → "{total}", "total"
    if (!isPlaceholder(name)) continue;
    if (match.index > cursor)
      parts.push({ text: template.slice(cursor, match.index), live: false });
    parts.push({ text: values[name], live: true });
    cursor = match.index + whole.length;
  }
  if (cursor < template.length) parts.push({ text: template.slice(cursor), live: false });
  return parts;
}

/** One axis for every stop: rescaling per stop would make net look as tall as gross. */
export function axisMax(selection: InteractiveSelection): number {
  const values = selection.props.control.stops.flatMap((stop) => stop.rows.map((row) => row.value));
  return niceCeiling(Math.max(...values));
}

/** The stop a card opens on: its `initial`, by id, which the schema holds to be one of its stops. */
export function initialStopIndex(selection: InteractiveSelection): number {
  const { control } = selection.props;
  return control.stops.findIndex((stop) => stop.id === control.initial);
}

/** The stop a card shows: the host's, by its label, when it holds one the card has; else its own. */
export function shownStopIndex({
  stops,
  measure,
  own,
}: {
  stops: Stop[];
  measure: string | undefined;
  own: number;
}): number {
  const held = stops.findIndex((each) => each.label === measure); // → -1 when none is held
  return held === -1 ? own : held;
}

/** Where a stop sits along the slider's track, and whether it is one of the track's two ends. */
export type StopPlace = { left: string; edge: "start" | "end" | undefined };

/** A stop's place on the track; the schema holds two stops or more, so the span is never zero. */
export function stopPlace({ index, count }: { index: number; count: number }): StopPlace {
  const left = `${(index / (count - 1)) * 100}%`;
  if (index === 0) return { left, edge: "start" };
  return { left, edge: index === count - 1 ? "end" : undefined };
}

/** The chip label for a card choice, e.g. "Net profit · Sep 14–20". */
export function attachmentLabel(stop: Stop, period: string): string {
  return `${stop.label} · ${period}`;
}
