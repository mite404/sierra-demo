import type { AnswerPhase } from "./awaiting";
import { scenarios, trend } from "./fixtures";
import type { CardAttachment, InteractiveSelection } from "./interactive";
import {
  card,
  em,
  heading,
  limitation,
  list,
  paragraph,
  plainText,
  strong,
  text,
  type Block,
} from "./prose";
import type { RecapItem } from "./recapRules";
import type { Ended, Failure, Work } from "./reply";

/**
 * One turn in a thread. A user turn is a request, or the answer to a question the agent was
 * blocked on (`question`), which the thread shows as the question and its answer together. An
 * agent turn is plain `text`, or structured `blocks` with the work behind them; the host
 * validates every card payload.
 */
export type ThreadMessage =
  | {
      id: string;
      role: "user";
      text: string;
      time: string;
      /** Card choices sent with this message, shown as chips under it (ADR-030). */
      attachments?: CardAttachment[];
      /** Files and screenshots sent with this message (ADR-063). */
      files?: { id: string; label: string }[];
      /** The question this turn answers, when it answered a docked one (ADR-039). */
      question?: string;
    }
  | {
      id: string;
      role: "agent";
      /** The words, plain: what a search reads, and all a plain-text reply has. */
      text: string;
      time: string;
      payload?: unknown;
      /** An interactive catalog card (ADR-029), validated separately from static cards. */
      interactive?: unknown;
      /** Still streaming in from the agent (ADR-041). */
      streaming?: boolean;
      /** The reply's structure (ADR-140): paragraphs, headings, lists, cards between them. */
      blocks?: Block[];
      /** The work behind the reply, shown behind Work details (ADR-139). */
      work?: Work;
      /** What the agent is doing right now, while the reply streams. */
      activity?: string;
      /** The latest approach summary, shown folded apart from the reply; never sent back. */
      thinking?: string;
      /** How the reply stopped short; absent for one that completed or is still streaming. */
      ended?: Ended;
      /** Why it stopped, when the agent said. */
      failure?: Failure;
      /** The question the reply ended on (ADR-039), kept in the record; the dock reads it. */
      asks?: unknown;
    };

/**
 * What a host that drives the thread can do (a scripted demo, a test): fill and send the
 * compose box, answer the docked question, step a card, stop every reply in flight, or try a
 * stopped reply again. Every call takes the same path a person's click would.
 */
export type ThreadHandle = {
  setDraft(text: string): void;
  /** Sends the compose box's draft, as Enter would; nothing happens on an empty draft. */
  send(): void;
  /** Answers the docked question with a tile's label or typed text. */
  answer(text: string): void;
  /**
   * Shows an answer on the docked question's card before it is sent, as a hand giving it would:
   * the pointer over its tile, the tile selected, Submit pressed; null clears it. Sends nothing.
   */
  stageAnswer(text: string, phase: AnswerPhase | null): void;
  /**
   * Steps an interactive card to the stop named by its label, as the card's own control would,
   * so the choice rides along with the next message (ADR-030): the card on the turn named, or
   * the latest turn that carries one. Nothing happens for a label the card lacks.
   */
  choose(measure: string, turnId?: string): void;
  /** Stops every reply still streaming; each is marked cancelled, never complete. */
  stop(): void;
  /**
   * Sends the request behind a reply that stopped short again, as a new turn: the turn named,
   * or the latest such turn.
   */
  retry(turnId?: string): void;
};

/** A deterministic conversation used to evaluate cards in their real context. */
export type Thread = {
  title: string;
  messages: ThreadMessage[];
  /** Structured outcomes recorded during the thread, shown after the user is away. */
  recap?: RecapItem[];
  /** A question the agent is blocked on (ADR-039), validated before it is shown. */
  awaiting?: unknown;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const byDay = (values: number[]) => values.map((value, i) => ({ label: DAYS[i], value }));

/** Last week's profit at three depths; every stop is precomputed so the slider never calls a model. */
export const profitCard = {
  catalogVersion: "1",
  component: "BarChart",
  props: {
    title: "Last week's profit by day",
    source: "Demo store sales · Sep 14–20",
    period: "Sep 14–20",
    unit: "USD",
    variant: "measure-steps",
    control: {
      label: "Profit measure",
      initial: "gross",
      stops: [
        {
          id: "gross",
          label: "Gross profit",
          description: "Sales minus the cost of the goods you sold.",
          rows: byDay([6200, 7100, 6800, 7900, 9400, 11200, 8600]),
        },
        {
          id: "operating",
          label: "Operating profit",
          description: "Gross profit minus rent, salaries, and other running costs.",
          rows: byDay([2900, 3800, 3500, 4600, 6100, 7900, 5300]),
        },
        {
          id: "net",
          label: "Net profit",
          description: "Operating profit minus interest and tax: what you keep.",
          rows: byDay([2200, 2850, 2600, 3450, 4600, 5900, 4000]),
        },
      ],
    },
    sentence: "{measure} was {total} for {period}, peaking on {peakLabel} at {peakValue}.",
    steps: [
      "Pulled last week's orders (Sep 14–20) from the sales system",
      "Grouped sales by day",
      "Subtracted cost of goods sold to get gross profit",
      "Subtracted operating costs to get operating profit",
      "Subtracted interest and tax to get net profit",
      "Linked the slider to those three results",
    ],
  },
} satisfies InteractiveSelection;

// Edge cases: a single reading and a view the catalog does not have.
const fallbacks: Thread = {
  title: "Checking the edges",
  messages: [
    {
      id: "u1",
      role: "user",
      time: "14:10",
      text: scenarios.sparse.question,
    },
    {
      id: "a1",
      role: "agent",
      time: "14:10",
      text: "There is only one known reading, so I can't draw a trend honestly. Here are the exact values.",
      payload: scenarios.sparse.payload,
    },
    {
      id: "u2",
      role: "user",
      time: "14:12",
      text: scenarios.unsupported.question,
    },
    {
      id: "a2",
      role: "agent",
      time: "14:12",
      text: "That view isn't in the catalog yet, so I haven't guessed at one.",
      payload: scenarios.unsupported.payload,
    },
  ],
  recap: [
    {
      text: "Showed the single reading as exact values instead of a trend.",
      turnId: "a1",
    },
  ],
};

// The weekly brief's answer: findings in semibold, an aside in italics, a card between
// paragraphs, a heading and a list.
const briefBlocks: Block[] = [
  paragraph([
    text("Closed cases rose from 24 on Monday to "),
    strong("a peak of 62 on Saturday"),
    text(", then eased on Sunday. The weekend carried the week."),
  ]),
  paragraph([
    text("Support closed the most, 84 cases, ahead of Operations at 71. "),
    em("Success ran a person short from Wednesday, which explains its 56."),
  ]),
  card(scenarios.trend.payload),
  heading([text("What needs you")]),
  list([
    [strong("Approve weekend cover"), text(" for Success before Friday.")],
    [text("Nothing else needs escalation this week.")],
  ]),
];

// A weekly review answered in structure (ADR-139, ADR-140): findings in semibold, an aside in
// italics, a card between paragraphs, a heading and a list, and the work behind it: two checks,
// one run as a child thread with a table as its evidence.
const brief: Thread = {
  title: "Service desk weekly brief",
  messages: [
    {
      id: "u1",
      role: "user",
      time: "9:02",
      text: "Give me the weekly brief for the service desk. What changed, and what needs me?",
    },
    {
      id: "a1",
      role: "agent",
      time: "9:03",
      text: plainText(briefBlocks),
      blocks: briefBlocks,
      work: {
        steps: [
          {
            id: "workload",
            label: "Weekly workload",
            status: "done",
            outcome: "Closed cases by day, Sep 14–20: the peak was Saturday at 62.",
            basis: [
              "Counted the cases closed each day in the service desk export",
              "Took the busiest day's count as the peak",
            ],
            evidence: scenarios.table.payload,
            threadId: "workload-check",
          },
          {
            id: "teams",
            label: "Cases by team",
            status: "done",
            outcome: "Support closed 84, Operations 71 and Success 56.",
            basis: ["Grouped the week's closed cases by the team that closed them"],
          },
        ],
        logs: [
          "fixture:workload rows=7 source=demo-service-desk",
          "check:weekly-workload status=done peak=Sat:62",
          "check:cases-by-team status=done teams=3",
        ],
        narration: ["Reading this week's cases.", "Checking the workload by day."],
      },
    },
  ],
};

// A chart asked for in a view the catalog lacks (ADR-147, widened): the refused card, what the
// reply could not do said in its words, and the bar chart it offers to send instead.
const limitedBlocks: Block[] = [
  paragraph([
    text("First responses slowed: the median was "),
    strong("41 minutes"),
    text(", up from 28 the week before."),
  ]),
  card({ ...trend, component: "PieChart" }),
  limitation("The catalog has no pie chart, so I didn't draw one.", {
    label: "Show it as a bar chart",
    prompt: "Show first response times as a bar chart",
  }),
  paragraph([text("Thursday was the slowest day.")]),
];

// Structured prose from its plain words, as the fixtures below use it.
const said = (words: string): Block[] => [paragraph([text(words)])];

// Synthetic conversations: every payload comes from the shared fixtures,
// so a card in a thread and a card in a story are the exact same input.
export const threads: Record<string, Thread> = {
  trend: {
    title: "Service desk weekly review",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "9:02",
        text: scenarios.trend.question,
      },
      {
        id: "a1",
        role: "agent",
        time: "9:02",
        text: "Closed cases rose from 24 on Monday to a peak of 62 on Saturday, then eased slightly on Sunday.",
        payload: scenarios.trend.payload,
      },
      {
        id: "u2",
        role: "user",
        time: "9:04",
        text: scenarios.comparison.question,
      },
      {
        id: "a2",
        role: "agent",
        time: "9:04",
        text: "Support closed the most, 84 cases, followed by Operations at 71.",
        payload: scenarios.comparison.payload,
      },
    ],
    recap: [
      {
        text: "Charted closed cases for Sep 14–20: peak of 62 on Saturday.",
        turnId: "a1",
      },
      {
        text: "Compared teams: Support closed the most, 84 cases.",
        turnId: "a2",
      },
    ],
  },
  profit: {
    title: "Last week's sales",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "10:02",
        text: "Make a graph of last week's sales. Build a slider underneath that slides from net to gross profit.",
      },
      {
        id: "a1",
        role: "agent",
        time: "10:02",
        text: "Here's last week's profit by day. I used three stops instead of a free slider, since there's nothing between net and gross profit; the middle stop shows where the money goes.",
        interactive: profitCard,
      },
    ],
  },
  fallbacks,
  brief,
  /** A limitation in the words: the pie the catalog lacks, and a bar chart one click away. */
  limited: {
    title: "First response times",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "9:40",
        text: "Show first response times as a pie chart.",
      },
      {
        id: "a1",
        role: "agent",
        time: "9:40",
        text: plainText(limitedBlocks),
        blocks: limitedBlocks,
      },
    ],
  },
  /** A reply cut off partway: its words stay, marked incomplete, with a way to ask again. */
  interrupted: {
    title: "Region comparison",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "11:20",
        text: "Compare closed cases across the three regions.",
      },
      {
        id: "a1",
        role: "agent",
        time: "11:20",
        text: "North closed 84 cases and Central 71.",
        blocks: said("North closed 84 cases and Central 71."),
        ended: "interrupted",
        failure: {
          title: "Reply interrupted",
          detail: "The South region's records stopped answering before I could count them.",
        },
        work: {
          steps: [
            { id: "north", label: "North region", status: "done", outcome: "84 closed." },
            { id: "central", label: "Central region", status: "done", outcome: "71 closed." },
            { id: "south", label: "South region", status: "failed" },
          ],
          logs: ["check:south status=failed reason=timeout after=30s"],
          narration: ["Counting each region's cases."],
        },
      },
    ],
  },
  /** A reply that could not start and that asking again cannot help: it says why, no Try again. */
  "no-retry": {
    title: "Live numbers",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "11:05",
        text: "Pull this week's numbers from the live model.",
      },
      {
        id: "a1",
        role: "agent",
        time: "11:05",
        text: "",
        ended: "failed",
        failure: {
          title: "Sign-in needed",
          detail: "The live model answers signed-in users only. Nothing was sent.",
          retry: false,
        },
      },
    ],
  },
  /** The POC's model budget spent mid-visit: live answers pause, the Demos still play, no Try again. */
  credit: {
    title: "Live numbers",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "11:05",
        text: "Pull this week's numbers from the live model.",
      },
      {
        id: "a1",
        role: "agent",
        time: "11:05",
        text: "",
        ended: "failed",
        failure: {
          title: "The live model is out of credit",
          detail:
            "This POC's model budget is spent, so live answers are paused. The 3 scripted Demos still play.",
          retry: false,
        },
      },
    ],
  },
  /** A reply the user stopped: what finished is kept, what was running says it stopped. */
  cancelled: {
    title: "Refund audit",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "15:04",
        text: "Check every refund from last week against its order.",
      },
      {
        id: "a1",
        role: "agent",
        time: "15:04",
        text: "Monday's 41 refunds all match their orders.",
        blocks: said("Monday's 41 refunds all match their orders."),
        ended: "cancelled",
        work: {
          steps: [
            { id: "mon", label: "Monday's refunds", status: "done", outcome: "41 of 41 match." },
            { id: "tue", label: "Tuesday's refunds", status: "cancelled" },
          ],
          logs: [],
          narration: [],
        },
      },
    ],
  },
  /** Two questions the agent was blocked on, answered in a row: one surface, question over
   *  answer. */
  answered: {
    title: "Forecast setup",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "10:40",
        text: scenarios.unsupported.question,
      },
      {
        id: "a1",
        role: "agent",
        time: "10:40",
        text: "That view isn't in the catalog yet, so I haven't guessed at one.",
        payload: scenarios.unsupported.payload,
      },
      {
        id: "u2",
        role: "user",
        time: "10:41",
        question: "A forecast view isn't in the catalog yet. How should I handle it?",
        text: "Request a forecast view",
      },
      {
        id: "u3",
        role: "user",
        time: "10:42",
        question: "How many weeks ahead should it forecast?",
        text: "Four weeks",
      },
      {
        id: "a2",
        role: "agent",
        time: "10:42",
        text: "Requested a four-week forecast view. Until it ships, I'll keep showing exact values.",
      },
    ],
  },
  /** A long pasted request: the bubble folds past eight lines behind a fade and Show more. */
  "long-request": {
    title: "Handover notes",
    messages: [
      {
        id: "u1",
        role: "user",
        time: "8:30",
        text: [
          "Here are the handover notes from the night shift. Can you pull out what needs me?",
          "",
          "- Ticket 4411: billing export failed twice, retried at 02:10, succeeded.",
          "- Ticket 4415: a customer in Leeds cannot reset their password.",
          "- The status page showed a partial outage from 03:05 to 03:40.",
          "- Two refunds are waiting for approval over the usual limit.",
          "- The weekend rota still has a gap on Sunday afternoon.",
          "- Support's macro for shipping delays links to an old page.",
          "- A new starter needs access to the order system on Monday.",
          "- The chat widget was slow for an hour after midnight.",
          "- Ticket 4420: duplicate charge, customer already refunded.",
          "- Printer on floor two is out of toner again.",
          "",
          "Thanks!",
        ].join("\n"),
      },
      {
        id: "a1",
        role: "agent",
        time: "8:31",
        text: "Three need you: the two refunds over the limit, the Sunday rota gap, and the new starter's access.",
      },
    ],
  },
  /** The fallbacks thread with the agent blocked on the user: whether to request the missing view. */
  awaiting: {
    ...fallbacks,
    awaiting: {
      question: "A forecast view isn't in the catalog yet. How should I handle it?",
      options: [
        {
          label: "Request a forecast view",
          detail:
            "I'll add it to the catalog backlog and keep showing exact values until it ships.",
        },
      ],
      answer: { placeholder: "How many weeks ahead should it forecast?" },
      elsewhere: "Chat about a plan to capture a different selection of sales data",
    },
  },
  /** The same question, malformed: the way out was written into the one-line typed-answer
   *  row, too long to fit, so there is no card; the agent asks in plain words (ADR-040). */
  malformed: {
    ...fallbacks,
    awaiting: {
      question: "A forecast view isn't in the catalog yet. How should I handle it?",
      options: [
        {
          label: "Request a forecast view",
          detail:
            "I'll add it to the catalog backlog and keep showing exact values until it ships.",
        },
      ],
      answer: { placeholder: "Chat about a plan to capture a different selection of sales data" },
    },
  },
};
