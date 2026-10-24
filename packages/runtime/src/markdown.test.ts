import { code, em, heading, link, list, paragraph, strong, text } from "@yaklabs/catalog/prose";
import { applyChunk, startReply, type ReplyChunk } from "@yaklabs/catalog/reply";
import { describe, expect, it } from "vitest";
import { parseQuietProse } from "./markdown";
import { closeMarkdown, newEmitter, writeMarkdown, type MarkdownEmitter } from "./markdownEmitter";

describe("parseQuietProse: blocks", () => {
  it("reads every heading level as one heading", () => {
    expect(parseQuietProse("# One\n## Two\n### Three")).toEqual([
      heading([text("One")]),
      heading([text("Two")]),
      heading([text("Three")]),
    ]);
  });

  it("gathers consecutive list lines of any marker into one list", () => {
    expect(parseQuietProse("- a\n* b\n1. c\n  more of c")).toEqual([
      list([[text("a")], [text("b")], [text("c more of c")]]),
    ]);
  });

  it("splits paragraphs on blank lines and joins wrapped lines with a space", () => {
    expect(parseQuietProse("One line\nwraps here.\n\nNext.")).toEqual([
      paragraph([text("One line wraps here.")]),
      paragraph([text("Next.")]),
    ]);
  });

  it("ends a list at a paragraph line and drops rules and empty input", () => {
    expect(parseQuietProse("- a\nAfter\n\n---\n")).toEqual([
      list([[text("a")]]),
      paragraph([text("After")]),
    ]);
    expect(parseQuietProse("")).toEqual([]);
  });
});

describe("parseQuietProse: inline", () => {
  it("reads strong, em, code and links", () => {
    expect(
      parseQuietProse("**Bold** and *em* and _also_ and `x = 1` and [docs](https://a.test/b)."),
    ).toEqual([
      paragraph([
        strong("Bold"),
        text(" and "),
        em("em"),
        text(" and "),
        em("also"),
        text(" and "),
        code("x = 1"),
        text(" and "),
        link("docs", "https://a.test/b"),
        text("."),
      ]),
    ]);
  });

  it("keeps mailto links and flattens markers nested in a span", () => {
    expect(parseQuietProse("[**mail** us](mailto:a@b.test)")).toEqual([
      paragraph([link("mail us", "mailto:a@b.test")]),
    ]);
  });

  it("leaves arithmetic, snake_case and bare brackets as text", () => {
    expect(parseQuietProse("2 * 3 and 5*3 and snake_case_name and [sic] here")).toEqual([
      paragraph([text("2 * 3 and 5*3 and snake_case_name and [sic] here")]),
    ]);
  });

  it("shows only the text of links with unsafe or missing schemes", () => {
    expect(
      parseQuietProse(
        "[a](javascript:void) [b](JaVaScRiPt:x) [c](http://a.test) [d](/path) [e](data:x)",
      ),
    ).toEqual([paragraph([text("a b c d e")])]);
  });
});

describe("parseQuietProse: unfinished syntax while streaming", () => {
  it("shows an unclosed span as its kind with the marker hidden", () => {
    expect(parseQuietProse("a **bol")).toEqual([paragraph([text("a "), strong("bol")])]);
    expect(parseQuietProse("a *ita")).toEqual([paragraph([text("a "), em("ita")])]);
    expect(parseQuietProse("a _ita")).toEqual([paragraph([text("a "), em("ita")])]);
    expect(parseQuietProse("a `co")).toEqual([paragraph([text("a "), code("co")])]);
  });

  it("hides a lone marker at the very end", () => {
    expect(parseQuietProse("a **")).toEqual([paragraph([text("a ")])]);
    expect(parseQuietProse("a *")).toEqual([paragraph([text("a ")])]);
    expect(parseQuietProse("a _")).toEqual([paragraph([text("a ")])]);
    expect(parseQuietProse("a `")).toEqual([paragraph([text("a ")])]);
  });

  it("shows only a link's text until its url closes", () => {
    expect(parseQuietProse("see [do")).toEqual([paragraph([text("see do")])]);
    expect(parseQuietProse("see [docs](")).toEqual([paragraph([text("see docs")])]);
    expect(parseQuietProse("see [docs](https://a.te")).toEqual([paragraph([text("see docs")])]);
  });

  it("shows nothing for a heading or list marker with no text yet", () => {
    expect(parseQuietProse("Intro\n\n###")).toEqual([paragraph([text("Intro")])]);
    expect(parseQuietProse("### ")).toEqual([]);
    expect(parseQuietProse("- a\n-")).toEqual([list([[text("a")]])]);
  });

  it("never throws on odd input", () => {
    expect(() => parseQuietProse("**_`[](*)`_**\n\n- \n#\n[")).not.toThrow();
  });
});

// Sources the emitter must stream exactly: every block kind, every mark, and the edge cases
// the parser keeps as text. No two spans of one mark touch, since the fold joins those.
const fixtures = [
  "Friday was **busiest**, at *62 cases*, with `peak = Sat` noted. See [the brief](https://a.test/b).",
  "# Weekly brief\n\nClosed cases rose to **62**.\n\n- Support closed 84\n- Operations _71_\n  and more\n1. Approve cover\n\nAfter the list.",
  "2 * 3 and 5*3 and snake_case_name and [sic] here, a _b_c and x_",
  "Wrapped lines\njoin with a space\n---\n## Next *step*\n* one\n* two\n\n1) three",
  "**unclosed bold at the end and a [half](https://a.test",
  "a [link](javascript:x) and [ok](mailto:a@b.test) and *em* _em_ **strong**",
  "Trailing spaces   \r\n\n\n  Indented start\n- \n-\n- last",
  "### \n#hashtag and 12345 and 1. not a list\n1. a list",
];

// The blocks a turn gains from `deltas` streamed through one emitter, then closed.
function streamed(deltas: string[]): unknown {
  const chunks: ReplyChunk[] = [];
  const emitter = deltas.reduce((state, delta) => {
    const step = writeMarkdown(state, delta);
    chunks.push(...step.chunks);
    return step.emitter;
  }, newEmitter);
  chunks.push(...closeMarkdown(emitter));
  return (
    chunks.reduce((turn, chunk) => applyChunk(turn, chunk), startReply("a1", "9:00")).blocks ?? []
  );
}

// What the emitter yields for `source` arriving in one delta, before the block closes.
const settledFor = (source: string): unknown =>
  writeMarkdown(newEmitter, source).chunks.reduce(
    (turn, chunk) => applyChunk(turn, chunk),
    startReply("a1", "9:00"),
  ).blocks;

describe("the markdown emitter adds exactly the parse of the whole block", () => {
  it.each(fixtures)("at every split point of %j", (source) => {
    const whole = parseQuietProse(source);
    for (let at = 0; at <= source.length; at += 1) {
      expect(streamed([source.slice(0, at), source.slice(at)])).toEqual(whole);
    }
  });

  it.each(fixtures)("one character at a time for %j", (source) => {
    expect(streamed(Array.from(source))).toEqual(parseQuietProse(source));
  });
});

describe("the markdown emitter streams what is settled", () => {
  it("commits the open line word by word", () => {
    expect(settledFor("Friday was the busiest")).toEqual([paragraph([text("Friday was the ")])]);
  });

  it("commits a closed span, and holds the word an unclosed marker starts", () => {
    expect(settledFor("**Friday** led, then **Satur")).toEqual([
      paragraph([strong("Friday"), text(" led, then ")]),
    ]);
    expect(settledFor("see 5*3 and more")).toEqual([paragraph([text("see ")])]);
  });

  it("commits closed lines whole, and waits for an open line's kind", () => {
    expect(settledFor("# Brief\n\n- one item\n1.")).toEqual([
      heading([text("Brief")]),
      list([[text("one ")]]),
    ]);
  });
});

// An emitter whose shown run is not what its source parses to, as a parser change could leave.
const rewritten: MarkdownEmitter = {
  source: "alpha beta",
  shown: [paragraph([text("alpha gamma")])],
};

describe("the markdown emitter never rewrites a run already shown", () => {
  it("breaks on the next write, rather than stream the wrong words", () => {
    expect(() => writeMarkdown(rewritten, "")).toThrow(
      'A run already shown changed: "alpha gamma" became "alpha "',
    );
  });

  it("breaks on close, rather than fill in the wrong words", () => {
    expect(() => closeMarkdown(rewritten)).toThrow(
      'A run already shown changed: "alpha gamma" became "alpha beta"',
    );
  });
});
