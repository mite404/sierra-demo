import { em, list, paragraph, strong, text } from "@yaklabs/catalog/prose";
import { activity, at, log, stream, type Script, sumUp } from "../script";
import { done, running, step } from "./fixtures";

// Scenario 2: a reply that breaks off halfway, kept as interrupted, and a retry that reads as a
// new attempt beside the old one. One check fails and the finding says so plainly.
/** Scenario 2: an interrupted reply and its retry. */
export const interrupted: Script = {
  id: "interrupted",
  label: "Interrupted reply",
  shows: "A reply that stops halfway stays honest, and a retry reads as a new attempt.",
  standing: "Shipped: the failure, Try again and the record. Scripted: the outage itself.",
  project: "Finance",
  thread: "Refund audit",
  children: {
    refunds: { title: "Refund export", request: "Export every refund issued Sep 22 to 26." },
    orders: { title: "Order lookups", request: "Look up the order behind each refund." },
  },
  beats: [
    {
      kind: "user",
      after: 900,
      text: "Check last week's refunds against their orders and tell me what doesn't match.",
    },
    {
      kind: "reply",
      events: [
        activity(700, "Thinking."),
        activity(1000, "Reading the refund records."),
        step(600, running("refunds", "Refund export")),
        step(300, running("orders", "Order lookups")),
        activity(300, "Matching 41 refunds to their orders."),
        step(2400, done("refunds", "Refund export", "41 refunds issued Sep 22 to 26, exported.")),
        log(200, "export:refunds rows=41 range=Sep22..Sep26"),
        step(2200, {
          id: "orders",
          label: "Order lookups",
          status: "failed",
          outcome: "The order system stopped answering after 39 of 41 lookups.",
          threadId: "orders",
        }),
        log(100, "lookup:orders 39/41 answered · then HTTP 503 from orders.example (3 retries)"),
        activity(500, "Writing what I found."),
        ...stream(
          [
            paragraph([
              strong("39 of the 41 refunds match an order."),
              text(
                " Two refunds carry no order number at all, so before I could check whether they were",
              ),
            ]),
          ],
          400,
        ),
        at(600, {
          kind: "failure",
          failure: {
            title: "Reply interrupted",
            detail:
              "The order system stopped answering. The text above is what arrived before it did; nothing below it was written.",
          },
        }),
      ],
    },
    { kind: "retry", after: 3500 },
    {
      kind: "reply",
      events: [
        activity(600, "Trying the order lookups again."),
        step(400, running("orders", "Order lookups")),
        step(2200, done("orders", "Order lookups", "All 41 lookups answered on the second try.")),
        log(100, "lookup:orders 41/41 answered"),
        sumUp(0, "Looked up every order on the second try"),
        activity(400, "Writing the result."),
        ...stream(
          [
            paragraph([
              strong("39 of the 41 refunds match an order."),
              text(" The other two carry no order number, so there is nothing to match them to."),
            ]),
            paragraph([
              text("Both unmatched refunds were issued on Thursday by the same agent, for "),
              em("45.00"),
              text(" and "),
              em("120.00"),
              text(". They may be goodwill credits rather than returns; only that agent can say."),
            ]),
            list([
              [strong("R-2231"), text(": 45.00, Thursday 14:10, no order number.")],
              [strong("R-2240"), text(": 120.00, Thursday 16:42, no order number.")],
            ]),
            paragraph([
              text(
                "I haven't changed anything. If you want, I can ask the agent for the two order numbers.",
              ),
            ]),
          ],
          400,
        ),
      ],
    },
  ],
};
