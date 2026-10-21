import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { encodeCard } from "./share";
import { ShareView } from "./ShareView";
import { profitCard, threads } from "./thread";

it("renders every turn and marks embedded cards as thread-placed", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.trend} />);
  const cards = html.match(/data-context="thread"/g) ?? [];
  expect(html.match(/class="turn turn-user"/g)).toHaveLength(2);
  expect(html.match(/class="turn turn-agent"/g)).toHaveLength(2);
  expect(cards).toHaveLength(2);
});

it("keeps the catalog boundary inside a thread: unsupported payloads never render a chart", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.fallbacks} />);
  expect(html).toContain("We don’t have a safe view for this yet.");
  expect(html).toContain("Showing the exact values instead.");
});

it("keeps an interactive card's work collapsed until the user asks for it", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.profit} />);
  expect(html).toContain("Show my work");
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('class="work-steps"');
});

it("floats the agent's question above the compose box with numbered choices and no close button", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.awaiting} />);
  expect(html).toContain('aria-label="Needs attention"');
  expect(html.match(/class="awaiting-key"/g)).toHaveLength(3);
  expect(html).toContain("Request a forecast view");
  expect(html).toContain('placeholder="How many weeks ahead should it forecast?"');
  expect(html).toContain("Chat about a plan to capture a different selection of sales data");
  expect(html).not.toContain("Dismiss");
});

it("waits for a choice: Submit stays disabled until a tile is selected, Skip is always there", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.awaiting} />);
  expect(html).toMatch(
    /<button class="awaiting-action awaiting-submit" disabled="">Submit<\/button>/,
  );
  expect(html).toContain(">Skip</button>");
  expect(html).not.toContain('aria-checked="true"');
});

it("shows no card and no error when the agent's question is malformed", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.malformed} />);
  expect(html).not.toContain('aria-label="Needs attention"');
  expect(html).not.toContain("Chat about a plan to capture");
  expect(html).not.toContain("answer.placeholder");
});

it("never lets the recap ask for anything, even when the user has been away", () => {
  const now = Date.UTC(2026, 8, 25, 9, 16);
  const idle = { active: true, lastUserInputAt: now - 25 * 60_000 };
  const blocked = renderToStaticMarkup(
    <ChatThreadPanel thread={threads.awaiting} activity={idle} now={now} />,
  );
  expect(blocked).not.toContain('aria-label="Recap"');
  const recap = renderToStaticMarkup(
    <ChatThreadPanel thread={threads.fallbacks} activity={idle} now={now} />,
  );
  expect(recap).toContain('aria-label="Recap"');
  expect(recap).not.toContain("Needs attention");
});

it("reads the recap and the idle time from turns that carry instants and outcomes", () => {
  const now = Date.UTC(2026, 8, 30, 9, 30);
  const away = new Date(now - 25 * 60_000).toISOString();
  const thread = {
    title: "Came back",
    messages: [
      { id: "u1", role: "user" as const, text: "Reconcile September.", time: away },
      {
        id: "a1",
        role: "agent" as const,
        text: "Done.",
        time: away,
        work: {
          steps: [{ id: "n", label: "North", status: "done" as const, outcome: "84 matched." }],
          logs: [],
          narration: [],
        },
      },
    ],
  };
  const html = renderToStaticMarkup(<ChatThreadPanel thread={thread} now={now} />);
  expect(html).toContain('aria-label="Recap"');
  expect(html).toContain("84 matched.");
  expect(html).toContain("25 min since your last message");
});

it("docks the question the latest reply ended on, read from the record", () => {
  const thread = {
    title: "Asked",
    messages: [
      { id: "u1", role: "user" as const, text: "Go.", time: "9:00" },
      {
        id: "a1",
        role: "agent" as const,
        text: "Ready.",
        time: "9:01",
        asks: threads.awaiting.awaiting,
      },
    ],
  };
  const html = renderToStaticMarkup(<ChatThreadPanel thread={thread} />);
  expect(html).toContain('aria-label="Needs attention"');
});

it("keeps a card's header draggable by default, and drops data-carry when told not to", () => {
  const carrying = renderToStaticMarkup(<ChatThreadPanel thread={threads.trend} />);
  expect(carrying.match(/data-carry=""/g)).toHaveLength(2);
  const viewOnly = renderToStaticMarkup(
    <ChatThreadPanel thread={threads.trend} cardsCarry={false} />,
  );
  expect(viewOnly).not.toContain("data-carry");
});

it("gives every card in the thread a share button, and the public page none", () => {
  const thread = renderToStaticMarkup(<ChatThreadPanel thread={threads.trend} />);
  expect(thread.match(/aria-label="Share this card"/g)).toHaveLength(2);
  const page = renderToStaticMarkup(
    <ShareView hash={"#" + encodeCard({ v: 1, kind: "interactive", payload: profitCard })} />,
  );
  expect(page).toContain("profit by day");
  expect(page).not.toContain('aria-label="Share this card"');
  expect(page).toContain("Only this view is shared, not the conversation.");
});

it("puts the host's actions at the end of the title bar", () => {
  const html = renderToStaticMarkup(
    <ChatThreadPanel
      thread={threads.trend}
      headerActions={<button type="button">Thread actions</button>}
    />,
  );
  expect(html).toMatch(
    /<header class="thread-header"><h2>.*<\/h2><div class="thread-header-actions"><button type="button">Thread actions<\/button><\/div><\/header>/,
  );
});

it("shows the host's own question in the dock, named by the host, over the agent's", () => {
  const question = {
    question: "When should this thread come back?",
    options: [{ label: "In 1 hour" }],
    answer: { placeholder: "Or type a time" },
    elsewhere: "Keep it awake",
  };
  const html = renderToStaticMarkup(
    <ChatThreadPanel
      thread={threads.awaiting}
      hostAsk={{ label: "Snooze", question, onAnswer: () => {}, onDismiss: () => {} }}
    />,
  );
  expect(html).toContain('aria-label="Snooze"');
  expect(html).toContain("When should this thread come back?");
  expect(html).not.toContain("Request a forecast view");
});

it("renders a structured reply as quiet prose: strong findings, italic asides, a heading", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.brief} />);
  expect(html).toContain('class="quiet-prose"');
  expect(html).toContain("<strong>a peak of 62 on Saturday</strong>");
  expect(html).toContain(
    "<em>Success ran a person short from Wednesday, which explains its 56.</em>",
  );
  expect(html).toContain("<h3>What needs you</h3>");
  expect(html).toContain(
    "<li><strong>Approve weekend cover</strong> for Success before Friday.</li>",
  );
  expect(html.match(/class="prose-card"/g)).toHaveLength(1);
});

it("keeps a reply's work folded under one disclosure above the words until the reader asks", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.brief} />);
  expect(html).toMatch(
    /aria-expanded="false"[^>]*>Work finished<span class="disclosure-detail">2 checks<\/span>/,
  );
  // The disclosure comes before the prose in the turn.
  expect(html.indexOf('class="work-details"')).toBeLessThan(html.indexOf('class="quiet-prose"'));
  expect(html).not.toContain('class="work-list"');
  expect(html).not.toContain("Technical details");
});

it("labels a cut-off reply incomplete and offers Try again, keeping its words", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.interrupted} />);
  expect(html).toContain("North closed 84 cases and Central 71.");
  expect(html).toContain("Interrupted · Incomplete answer");
  expect(html).toContain("The South region&#x27;s records stopped answering");
  expect(html).toContain(">Try again</button>");
  expect(html).toContain("3 checks · 1 needs attention");
  expect(html).not.toContain("aria-busy");
});

it("offers no Try again when the failure says asking again cannot help", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads["no-retry"]} />);
  expect(html).toContain("Could not start");
  expect(html).toContain("The live model answers signed-in users only. Nothing was sent.");
  expect(html).not.toContain("Try again");
});

it("says who stopped a cancelled reply, and offers no Try again", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.cancelled} />);
  expect(html).toContain("Stopped by you");
  expect(html).not.toContain("Try again");
});

it("sets consecutive answers on one surface, each question over its answer", () => {
  const html = renderToStaticMarkup(<ChatThreadPanel thread={threads.answered} />);
  expect(html.match(/aria-label="Your answers"/g)).toHaveLength(1);
  expect(html.match(/class="answered-pair" data-turn-id="u[23]"/g)).toHaveLength(2);
  expect(html).toContain("<dt>How many weeks ahead should it forecast?</dt><dd>Four weeks</dd>");
  expect(html.match(/class="turn turn-user"/g)).toHaveLength(1);
});

it("puts a host's footnote under the compose box and offers no Stop while nothing streams", () => {
  const html = renderToStaticMarkup(
    <ChatThreadPanel thread={threads.trend} footnote="Belongs to Weekly brief" />,
  );
  expect(html).toContain('<div class="thread-footnote">Belongs to Weekly brief</div>');
  expect(html).toContain('class="thread-compose" data-footnote=""');
  expect(html).not.toContain('aria-label="Stop"');
});
