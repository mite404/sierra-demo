import type { AwaitingInput } from "@yaklabs/catalog/awaiting";
import type { Selection } from "@yaklabs/catalog/catalog";
import type { InteractiveSelection } from "@yaklabs/catalog/interactive";
import type { WorkStep } from "@yaklabs/catalog/reply";
import { at, type Timed } from "../script";

// Every payload here is fixture data, named as such on the card, never a claim of a live query.
const SOURCE = "Demo support desk · fixture data, weekdays Sep 22 to 26";

/** Last week's backlog by weekday. */
export const workloadChart = {
  catalogVersion: "1",
  component: "LineChart",
  props: {
    title: "Backlog, Monday to Friday",
    source: SOURCE,
    unit: "cases",
    variant: "trend",
    rows: [
      { label: "Mon", value: 46 },
      { label: "Tue", value: 39 },
      { label: "Wed", value: 31 },
      { label: "Thu", value: 24 },
      { label: "Fri", value: 18 },
    ],
  },
} satisfies Selection;

/** Friday's open cases by category. */
export const issuesChart = {
  catalogVersion: "1",
  component: "BarChart",
  props: {
    title: "Still open on Friday, by category",
    source: SOURCE,
    unit: "cases",
    variant: "comparison",
    rows: [
      { label: "Billing", value: 12 },
      { label: "Product", value: 4 },
      { label: "Access", value: 2 },
    ],
  },
} satisfies Selection;

/**
 * Friday's open cases as the reply first drew them, before the check set aside two billing
 * cases logged twice: shown under the settled card's id, so the settled one takes its place.
 */
export const issuesDraft = {
  ...issuesChart,
  props: {
    ...issuesChart.props,
    title: "Still open on Friday, by category (draft)",
    rows: [
      { label: "Billing", value: 14 },
      { label: "Product", value: 4 },
      { label: "Access", value: 2 },
    ],
  },
} satisfies Selection;

/**
 * First response times by weekday, as a chart the catalog does not have: a child asked for a
 * pie, and the boundary refuses it whole rather than drawing something else (ADR-023, ADR-024).
 * The refusal is the point: the same card shows the catalog's limit in the reply and behind
 * Work details, the child's number stands on its own words, and the reply says what it could not
 * draw and offers a bar chart instead (a limitation with a recovery).
 */
export const responsePie = {
  catalogVersion: "1",
  component: "PieChart",
  props: {
    title: "First response, share of slow replies by weekday",
    source: SOURCE,
    unit: "minutes",
    variant: "share",
    rows: [
      { label: "Mon", value: 31 },
      { label: "Tue", value: 36 },
      { label: "Wed", value: 44 },
      { label: "Thu", value: 52 },
      { label: "Fri", value: 41 },
    ],
  },
};

/** September's matched invoices by site. */
export const sitesChart = {
  catalogVersion: "1",
  component: "BarChart",
  props: {
    title: "September invoices matched, by site",
    source: "Demo supplier ledger · fixture data, September",
    unit: "cases",
    variant: "comparison",
    rows: [
      { label: "Northern", value: 84 },
      { label: "Southern", value: 67 },
      { label: "Central", value: 61 },
    ],
  },
} satisfies Selection;

/** The one decision the weekly brief asks for. */
export const orderQuestion = {
  question: "How should Monday's brief order the backlog?",
  options: [
    { label: "Billing first", detail: "Lead with the largest open category." },
    { label: "Oldest first", detail: "Lead with the cases waiting longest, whatever their size." },
  ],
  answer: { placeholder: "Or name the order you want" },
  elsewhere: "Skip the draft for now",
} satisfies AwaitingInput;

// One number a site: Northern, Southern, Central, in that order.
const bySite = ([northern, southern, central]: [number, number, number]) => [
  { label: "Northern", value: northern },
  { label: "Southern", value: southern },
  { label: "Central", value: central },
];

/**
 * September's invoices by site at three depths (ADR-029): billed, delivered, and the difference
 * between them. The user steps the card to the view they want, and the choice rides along with
 * their next request (ADR-030), so the reply can speak to that view.
 */
export const invoicesCard = {
  catalogVersion: "1",
  component: "BarChart",
  props: {
    title: "September invoices, by site",
    source: "Demo supplier ledger · fixture data, September",
    period: "September",
    unit: "USD",
    variant: "measure-steps",
    control: {
      label: "Show",
      initial: "billed",
      stops: [
        {
          id: "billed",
          label: "Billed",
          description: "What the suppliers invoiced for each site.",
          rows: bySite([412_300, 338_900, 296_100]),
        },
        {
          id: "delivered",
          label: "Delivered",
          description: "The value of what each site signed for.",
          rows: bySite([412_300, 331_400, 296_100]),
        },
        {
          id: "difference",
          label: "Difference",
          description: "Billed minus delivered: what would be paid for nothing.",
          rows: bySite([0, 7_500, 0]),
        },
      ],
    },
    sentence:
      "{measure} across the three sites came to {total} in {period}; {peakLabel} was the largest at {peakValue}.",
    steps: [
      "Read the 212 September invoices from the supplier ledger",
      "Matched each to the delivery it names, per site",
      "Summed what was billed and what was signed for",
      "Took the difference where the two disagree",
    ],
  },
} satisfies InteractiveSelection;

/** The one decision left when the user comes back to the September invoices. */
export const holdQuestion = {
  question: "Two southern invoices bill more than was delivered. What should happen to them?",
  options: [
    { label: "Hold them", detail: "Mark both for review; nothing is paid until someone looks." },
    { label: "Pay what arrived", detail: "Pay the delivered amount and query the difference." },
  ],
  answer: { placeholder: "Or say what you'd rather do" },
  elsewhere: "Leave them for now",
} satisfies AwaitingInput;

/** A step of the work after a pause. */
export const step = (after: number, work: WorkStep): Timed =>
  at(after, { kind: "step", step: work });
/** A child thread's step, just started. */
export const running = (id: string, label: string): WorkStep => ({
  id,
  label,
  status: "running",
  threadId: id,
});
/**
 * A child thread's step, finished, with what it found, the card that backs it, and the lines
 * that say how it was found.
 */
export const done = (
  id: string,
  label: string,
  outcome: string,
  evidence?: unknown,
  basis?: string[],
): WorkStep => ({
  id,
  label,
  status: "done",
  outcome,
  evidence,
  threadId: id,
  ...(basis !== undefined && { basis }),
});
