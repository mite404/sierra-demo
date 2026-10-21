import {
  card,
  em,
  heading,
  limitation,
  list,
  paragraph,
  strong,
  text,
} from "@yaklabs/catalog/prose";
import { activity, at, log, stream, sumUp, type Script, type Timed } from "../script";
import {
  done,
  issuesChart,
  issuesDraft,
  orderQuestion,
  responsePie,
  running,
  step,
  workloadChart,
} from "./fixtures";

// Scenario 1: the whole arc. A request, quiet narration, three children working in parallel,
// a finding written as each check settles, with selective emphasis and cards between its
// paragraphs, a draft chart that settles in place, a chart the catalog refuses and what the
// reply offers instead, one real decision, and an honest draft. About 60 seconds at 1x before
// reading time.

// The open-issues card's id: the draft and the settled chart are one card on screen.
const ISSUES_CARD = "open-issues";

// The backlog, once the workload is counted, and the open issues drawn as a draft while their
// check still runs.
const backlogFinding = stream(
  [
    paragraph([
      text("The backlog fell from "),
      strong("46 cases on Monday to 18 by Friday"),
      text(
        ". That is the steepest weekday drop since August, and it happened without anyone working the weekend.",
      ),
    ]),
    card(workloadChart),
    paragraph([
      em("Weekend activity was not collected."),
      text(
        " This is a weekday comparison, not a complete week, so Saturday's usual spike is missing from these numbers.",
      ),
    ]),
    card(issuesDraft, ISSUES_CARD),
  ],
  500,
);

// What the settled open issues say.
const billingFinding = stream(
  [
    paragraph([
      text("Of the 18 still open, "),
      strong("12 are billing"),
      text(
        ". Most arrived after Wednesday's invoice run, so they are recent rather than stuck: the median billing case has been open for two days.",
      ),
    ]),
  ],
  400,
);

// Response times, the chart the catalog refuses and what the reply offers instead, and the
// flags, once the last check is in.
const responseFinding = stream(
  [
    paragraph([
      text("First responses slowed: the median was "),
      strong("41 minutes"),
      text(", up from 28 the week before, and Thursday was the slowest day."),
    ]),
    card(responsePie),
    limitation("The catalog has no pie chart, so I didn't draw that one.", {
      label: "Show it as a bar chart",
      prompt: "Show first response times as a bar chart",
    }),
    heading([text("What I'd flag")]),
    list([
      [strong("Access requests"), text(" are few but old: two cases, nine days open on average.")],
      [strong("Product questions"), text(" are steady at four, none older than a week.")],
      [text("Nothing here needs an escalation today.")],
    ]),
  ],
  400,
);

// The draft the reply writes for the answer the script gives: oldest first.
const briefDraft: Timed[] = stream(
  [
    heading([text("Monday support brief (draft)")]),
    paragraph([
      text("Leading with the "),
      strong("longest-open cases"),
      text(", as you asked, rather than the largest category."),
    ]),
    list([
      [strong("Access"), text(": 2 open, median 9 days. Both wait on the identity team.")],
      [strong("Product"), text(": 4 open, median 6 days.")],
      [strong("Billing"), text(": 12 open, median 2 days. Recent, not stuck.")],
    ]),
    card(issuesChart),
    paragraph([
      text(
        "Nothing was sent. The draft is yours to edit, and the evidence behind each line is in ",
      ),
      strong("Work details"),
      text(" above."),
    ]),
  ],
  400,
);

/** Scenario 1: the whole arc. */
export const brief: Script = {
  id: "brief",
  label: "Weekly brief",
  shows:
    "The whole arc: narration, parallel checks, a refused chart, a finding, a decision, a draft.",
  standing: "Shipped: every surface here. Scripted: the agent, its data and its checks.",
  project: "Support desk",
  thread: "Weekly brief",
  children: {
    workload: {
      title: "Weekly workload",
      request: "Count the open cases at the end of each weekday.",
    },
    issues: {
      title: "Open issues by category",
      request: "Group Friday's open cases by category with their median age.",
    },
    response: {
      title: "First response times",
      request: "Find the median first-response time for each weekday.",
    },
  },
  beats: [
    {
      kind: "user",
      after: 900,
      text: "Can you prepare Monday's support brief? Pull last week's numbers and tell me what changed. Don't send anything yet.",
    },
    {
      kind: "reply",
      events: [
        activity(700, "Thinking."),
        activity(1100, "Reading the support records."),
        log(600, "source: support-desk fixtures · weekdays Sep 22 to 26 · 2 files"),
        step(500, running("workload", "Weekly workload")),
        step(400, running("issues", "Open issues by category")),
        step(300, running("response", "First response times")),
        activity(300, "Checking this week's workload, open issues and response times."),
        step(
          2800,
          done(
            "workload",
            "Weekly workload",
            "Backlog fell from 46 cases Monday to 18 by Friday.",
            workloadChart,
            [
              "Counted the open cases at each weekday's close",
              "Left out the weekend, which the export does not cover",
            ],
          ),
        ),
        log(200, "check:weekly-workload status=done rows=5 columns=[day, open_cases]"),
        activity(200, "Checking open issues and response times."),
        ...backlogFinding,
        step(
          1200,
          done(
            "issues",
            "Open issues by category",
            "18 cases remain open: 12 billing, 4 product, 2 access.",
            issuesChart,
            [
              "Counted the 20 cases open at Friday's close",
              "Set aside 2 billing cases logged twice",
              "Took each category's median age from its open dates",
            ],
          ),
        ),
        log(
          200,
          "check:open-issues status=done rows=3 duplicates=2 columns=[category, open_cases, median_days_open]",
        ),
        at(300, { kind: "card", payload: issuesChart, id: ISSUES_CARD }),
        ...billingFinding,
        step(
          900,
          done(
            "response",
            "First response times",
            "Median first response 41 minutes, up from 28 the week before.",
            responsePie,
            [
              "Took each case's first reply time from the ticket log",
              "Compared each weekday's median with the week before",
            ],
          ),
        ),
        log(200, "check:response-times status=done rows=5 chart=PieChart"),
        activity(400, "Writing the brief."),
        ...responseFinding,
        sumUp(0, "Checked workload, open issues and response times"),
        at(700, { kind: "question", question: orderQuestion }),
      ],
    },
    { kind: "answer", after: 4500, text: "Oldest first" },
    {
      kind: "reply",
      events: [activity(500, "Drafting the brief, oldest first."), ...briefDraft],
    },
  ],
};
