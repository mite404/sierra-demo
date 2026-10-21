import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { limitation } from "./prose";
import { Prose } from "./QuietProse";

const limited = [
  limitation("The catalog has no pie chart, so I didn't draw one.", {
    label: "Show it as a bar chart",
    prompt: "Show first response times as a bar chart",
  }),
];

describe("a limitation in Quiet prose", () => {
  it("says the sentence, quotes the prompt and offers its button where the thread can send", () => {
    const html = renderToStaticMarkup(
      <Prose blocks={limited} recover={{ onRecover: () => {}, busy: false }} />,
    );
    expect(html).toContain("<p>The catalog has no pie chart, so I didn&#x27;t draw one.</p>");
    expect(html).toContain("<q>Show first response times as a bar chart</q>");
    expect(html).toMatch(/<button type="button" class="btn btn-sm"[^>]*>Show it as a bar chart/);
    expect(html).not.toContain("disabled");
  });

  it("holds the button while a reply streams", () => {
    const html = renderToStaticMarkup(
      <Prose blocks={limited} recover={{ onRecover: () => {}, busy: true }} />,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Show it as a bar chart/);
  });

  it("shows the prompt alone where nothing can be sent, such as a shared page", () => {
    const html = renderToStaticMarkup(<Prose blocks={limited} />);
    expect(html).toContain("<q>Show first response times as a bar chart</q>");
    expect(html).not.toContain("<button");
  });

  it("says a limitation with no recovery as its sentence alone", () => {
    const html = renderToStaticMarkup(<Prose blocks={[limitation("No live sales here.")]} />);
    expect(html).toContain("<p>No live sales here.</p>");
    expect(html).not.toContain("<q>");
  });
});
