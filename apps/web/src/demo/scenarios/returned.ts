import { list, paragraph, plainText, strong, text, type Block } from "@yaklabs/catalog/prose";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { activity, at, log, stream, sumUp, type Script } from "../script";
import { done, holdQuestion, invoicesCard, sitesChart } from "./fixtures";

// Scenario 3: a run the user did not watch. The thread opens on its record, 25 minutes after
// the request: three children ran and finished, and the recap leads with their outcomes, each
// a jump to the turn that holds the evidence. The user steps the run's card to the view they
// want, and the request after it carries that choice, so the reply speaks to it; the one
// decision docks, and the answer is recorded. About 35 seconds at 1x before reading time.
const summaryBlocks: Block[] = [
  paragraph([
    strong("212 invoices matched to deliveries across three sites."),
    text(
      " Five need a look: three deliveries at the northern warehouse have no invoice yet, and two southern invoices bill more than arrived.",
    ),
  ]),
  paragraph([text("Nothing was changed or sent. The per-site detail is in Work details.")]),
];

// The run as it ended: the request, and the reply that closed it with its three steps done.
const run: ThreadMessage[] = [
  {
    id: "returned-1",
    role: "user",
    text: "Go through all of September's supplier invoices and match them to deliveries. Flag anything that doesn't line up. I'm in a meeting until ten.",
    time: "",
  },
  {
    id: "returned-2",
    role: "agent",
    text: plainText(summaryBlocks),
    time: "",
    blocks: summaryBlocks,
    interactive: invoicesCard,
    work: {
      steps: [
        done(
          "north",
          "Northern warehouse",
          "84 invoices matched; 3 deliveries have no invoice yet.",
        ),
        done("central", "Central depot", "61 invoices matched; every delivery accounted for."),
        done(
          "south",
          "Southern warehouse",
          "67 invoices matched; 2 bill more than was delivered.",
          sitesChart,
        ),
      ],
      logs: [
        "source: supplier-ledger fixtures · September · 212 invoices · 3 sites",
        "match:north invoices=84 unmatched_deliveries=3",
        "match:central invoices=61 unmatched_deliveries=0",
        "match:south invoices=67 over_billed=2",
      ],
      narration: [
        "Thinking.",
        "Opening the September invoices.",
        "Matching 212 invoices to deliveries across three sites.",
      ],
      summary: "Matched 212 invoices to deliveries across three sites",
    },
  },
];

/** Scenario 3: a run the user did not watch, read back from its record. */
export const returned: Script = {
  id: "returned",
  label: "Came back to it",
  shows:
    "A run you did not watch: outcomes first, evidence a layer down, a card's view carried into the next request, then what needs you.",
  standing: "Proposed: the recap as a missed run's summary. Shipped: the rest.",
  project: "Operations",
  thread: "September invoices",
  children: {
    north: {
      title: "Northern warehouse",
      request: "Match September's invoices to deliveries at the northern warehouse.",
    },
    south: {
      title: "Southern warehouse",
      request: "Match September's invoices to deliveries at the southern warehouse.",
    },
    central: {
      title: "Central depot",
      request: "Match September's invoices to deliveries at the central depot.",
    },
  },
  opening: { awayMinutes: 25, turns: run },
  beats: [
    { kind: "choose", after: 4500, measure: "Difference" },
    {
      kind: "user",
      after: 2500,
      text: "Back now. Anything I need to decide before this batch goes to payment?",
    },
    {
      kind: "reply",
      events: [
        activity(600, "Reading the difference view."),
        ...stream(
          [
            paragraph([
              strong("One thing, and it is the difference on your card."),
              text(
                " The 7,500 sits at the southern warehouse, where two invoices bill more than was delivered: ",
              ),
              strong("S-1187"),
              text(" for 12 pallets against 9 received, and "),
              strong("S-1203"),
              text(
                " for 6 against 4. The other 210 line up, and the three northern deliveries without an invoice can wait for the supplier.",
              ),
            ]),
          ],
          400,
        ),
        at(700, { kind: "question", question: holdQuestion }),
      ],
    },
    { kind: "answer", after: 4500, text: "Hold them" },
    {
      kind: "reply",
      events: [
        activity(500, "Marking both for review."),
        log(300, "hold:south S-1187 S-1203 status=review"),
        sumUp(0, "Held both invoices for review"),
        ...stream(
          [
            paragraph([
              strong("Both are marked for review."),
              text(" Nothing was paid and nothing else changed; the batch can go without them."),
            ]),
            list([
              [strong("S-1187"), text(": 12 pallets billed, 9 received. Held.")],
              [strong("S-1203"), text(": 6 billed, 4 received. Held.")],
            ]),
            paragraph([
              text("The evidence behind each site is in "),
              strong("Work details"),
              text(" on the earlier turn."),
            ]),
          ],
          400,
        ),
      ],
    },
  ],
};
