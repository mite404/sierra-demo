import { describe, expect, it } from "vitest";
import { colorInventorySchema, type Contrast } from "./colors-schema.ts";
import { colorViews, contrast, inventoryCss, sameColor } from "./colors.ts";

const read = (value: string) => colorViews(value) ?? expect.unreachable(value);
const ratioOf = (verdict: Contrast) => (verdict.kind === "ratio" ? verdict.ratio : Number.NaN);

const TOKENS = `
:root {
  /* --commented: #123456; */
  --paper: #f0efea; /* the app surface */
  --yak-cream: #F0EFEA;
  --rule: rgba(37, 37, 36, 0.72);
  --olive: var(--yak-green);
  --bubble-tint: color-mix(in srgb, var(--sage) 40%, var(--paper));
  --shadow: color-mix(in srgb, #111411 10%, transparent);
  --font-text: "Inter Variable", Inter, Helvetica, sans-serif;
  --p3-red: color(display-p3 1 0 0);
  --lift: 0 1px 2px rgb(0 0 0 / 0.2), 0 0 0 1px #111411;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #1b1d1a;
  }
}`;

const APP_CSS = `
/* color: #ff0000; a commented-out rule */
.card { background: rgb(240 239 234); border: 1px solid #F0EFEA80; }
.mark { fill: url(#fade); mask: url("sprite.svg#fff"); color: var(--ink, #252524); }
.names { animation-name: red; grid-area: tomato; color: white /* not #ff0000 */; outline-color: transparent; }
#fff { color: currentcolor; }
.wide { color: color(display-p3 1 0 0); }
.also-p3 { color: #ff0b0c; }
.fade {
  mask-image: linear-gradient(
    to right,
    #000 10%,
    transparent
  );
}
`;

const CHART_TSX = `
// <rect fill="#ff0000" /> is a comment, not code
/* style={{ color: "#00ff00" }} */
export function Chart({ tone }: { tone: string }) {
  return (
    <svg className="bg-[#F0EFEA] text-[color:var(--ink)] fill-[rgb(37_37_36)]/50 [color:#565650]">
      <linearGradient id="fade"><stop stopColor="#111411" /></linearGradient>
      <rect fill="url(#fade)" stroke={"#252524"} />
      <path fill="none" stroke="currentColor" />
      <a href="/docs#fff">{"#abcdef"}</a>
      <div style={{ backgroundColor: "rgba(37, 37, 36, 0.72)", border: "1px solid white", gridArea: "red", color: tone }} />
      <p style={{ color: "var(--soft-ink)" }} />
    </svg>
  );
}
const button = cva(\`rounded-[4px] \${size} hover:bg-[#565650]\`);
`;

describe("colorViews", () => {
  it("expands shorthand hex to the long form", () => {
    expect(colorViews("#FFF")?.hex).toBe("#ffffff");
  });

  it("keeps alpha in the hex, the oklch and the alpha field", () => {
    const views = colorViews("rgba(37, 37, 36, 0.72)");
    expect(views).toMatchObject({ hex: "#252524b8", alpha: 0.72, inSrgb: true });
    expect(views?.oklch).toMatch(/\/ 0\.72\)$/);
    expect(colorViews("#fff8")?.hex).toBe("#ffffff88");
  });

  it("reads hex and rgb spellings of one color identically", () => {
    expect(colorViews("rgb(240 239 234)")?.hex).toBe("#f0efea");
    expect(colorViews("rgb(240 239 234)")).toEqual(colorViews("#f0efea"));
  });

  it("round-trips an sRGB hex with no loss", () => {
    expect(colorViews("#565650")?.roundTripDelta).toBe(0);
  });

  it("flags a display-p3 color outside sRGB and measures what its hex loses", () => {
    const views = colorViews("color(display-p3 1 0 0)");
    expect(views?.inSrgb).toBe(false);
    expect(views?.roundTripDelta).toBeGreaterThan(2);
  });

  it.each(["var(--ink)", "color-mix(in srgb, red 50%, blue)", "currentcolor", "inherit", "#abcde"])(
    "returns null for %s, which it cannot resolve on its own",
    (value) => {
      expect(colorViews(value)).toBeNull();
    },
  );
});

describe("sameColor", () => {
  it("matches spellings of one color, alpha included", () => {
    expect(sameColor(read("#fff"), read("rgb(255 255 255)"))).toBe(true);
    expect(sameColor(read("#fff"), read("#ffffff80"))).toBe(false);
  });

  it("does not match a display-p3 color to the sRGB color its hex maps to", () => {
    const p3 = read("color(display-p3 1 0 0)");
    expect(sameColor(p3, read(p3.hex))).toBe(false);
  });
});

describe("contrast", () => {
  it("measures ink on paper at the 13.3:1 the tokens document", () => {
    const verdict = contrast({ foreground: "#252524", background: "#f0efea" });
    expect(verdict).toMatchObject({ kind: "ratio", composited: false });
    expect(ratioOf(verdict)).toBeCloseTo(13.3, 1);
  });

  it("lays a translucent foreground over an opaque background: --rule is 5.7:1", () => {
    const verdict = contrast({ foreground: "rgba(37, 37, 36, 0.72)", background: "#f0efea" });
    expect(verdict).toMatchObject({ kind: "ratio", composited: true });
    expect(ratioOf(verdict)).toBeCloseTo(5.7, 1);
  });

  it("stays inconclusive on a translucent background, whose backdrop it cannot see", () => {
    expect(contrast({ foreground: "#252524", background: "rgba(240, 239, 234, 0.5)" })).toEqual({
      kind: "inconclusive",
      reason: "translucent-background",
    });
  });

  it("stays inconclusive when either side is unresolved", () => {
    expect(contrast({ foreground: "var(--ink)", background: "#fff" })).toEqual({
      kind: "inconclusive",
      reason: "unparsed-foreground",
    });
    expect(contrast({ foreground: "#000", background: "var(--paper)" })).toEqual({
      kind: "inconclusive",
      reason: "unparsed-background",
    });
  });
});

describe("inventoryCss: custom properties", () => {
  const { customProperties } = inventoryCss([{ path: "tokens.css", content: TOKENS }]);
  const named = (name: string) => customProperties.filter((property) => property.name === name);

  it("lists every declaration in source order, skipping ones inside comments", () => {
    expect(customProperties.map((property) => property.name)).toEqual([
      "--paper",
      "--yak-cream",
      "--rule",
      "--olive",
      "--bubble-tint",
      "--shadow",
      "--font-text",
      "--p3-red",
      "--lift",
      "--paper",
    ]);
  });

  it("keeps the selector and at-rule chain, so each theme's --paper stays its own entry", () => {
    expect(named("--paper").map(({ context, value, line }) => ({ context, value, line }))).toEqual([
      { context: [":root"], value: "#f0efea", line: 4 },
      {
        context: ["@media (prefers-color-scheme: dark)", ':root:not([data-theme="light"])'],
        value: "#1b1d1a",
        line: 16,
      },
    ]);
  });

  it("reads a literal value as a color and keeps its alpha", () => {
    expect(named("--rule")[0]?.color).toMatchObject({
      kind: "literal",
      color: { hex: "#252524b8", alpha: 0.72 },
    });
  });

  it("lists var() and color-mix() definitions as authored, not as colors", () => {
    expect(named("--olive")[0]).toMatchObject({
      value: "var(--yak-green)",
      color: { kind: "unresolved", references: ["--yak-green"], functions: ["var"] },
    });
    expect(named("--bubble-tint")[0]?.color).toEqual({
      kind: "unresolved",
      references: ["--sage", "--paper"],
      functions: ["color-mix", "var"],
    });
    expect(named("--shadow")[0]?.color).toEqual({
      kind: "unresolved",
      references: [],
      functions: ["color-mix"],
    });
  });

  it("lists the literal colors inside a composite value such as a shadow", () => {
    expect(named("--lift")[0]?.color).toMatchObject({
      kind: "composite",
      colors: [
        { text: "rgb(0 0 0 / 0.2)", color: { hex: "#00000033" } },
        { text: "#111411", color: { hex: "#111411" } },
      ],
    });
  });

  it("marks a value with no color in it as none", () => {
    expect(named("--font-text")[0]?.color).toEqual({ kind: "none" });
  });
});

describe("inventoryCss: raw literals", () => {
  const inventory = inventoryCss([
    { path: "tokens.css", content: TOKENS },
    { path: "app.css", content: APP_CSS },
  ]);
  const texts = inventory.literals.map((literal) => literal.text);

  it("finds hex, functional and named colors in declarations", () => {
    expect(texts).toEqual([
      "rgb(240 239 234)",
      "#F0EFEA80",
      "#252524",
      "white",
      "color(display-p3 1 0 0)",
      "#ff0b0c",
      "#000",
    ]);
  });

  it("does not flag custom property values, comments, url fragments or selectors", () => {
    expect(inventory.literals.every((literal) => literal.file === "app.css")).toBe(true);
    expect(texts).not.toContain("#ff0000");
    expect(texts).not.toContain("#fff");
  });

  it("leaves named-color words in non-color properties alone", () => {
    expect(texts).not.toContain("red");
    expect(texts).not.toContain("tomato");
  });

  it("records where and in which rule each literal sits", () => {
    expect(inventory.literals[0]).toMatchObject({
      file: "app.css",
      line: 3,
      column: 21,
      origin: "css",
      property: "background",
      context: [".card"],
    });
  });

  it("points at the literal itself inside a declaration that spans lines", () => {
    expect(inventory.literals.at(-1)).toMatchObject({ text: "#000", line: 12, column: 5 });
  });

  it("offers every token with the exact same color, each as a distinct role", () => {
    expect(inventory.literals[0]?.candidates).toEqual([
      { name: "--paper", context: [":root"] },
      { name: "--yak-cream", context: [":root"] },
    ]);
  });

  it("does not match a translucent literal to its opaque token", () => {
    expect(inventory.literals[1]?.candidates).toEqual([]);
  });

  it("does not match colors that only share a gamut-mapped hex", () => {
    const p3 = inventory.literals[4];
    expect(p3?.color.inSrgb).toBe(false);
    expect(p3?.color.hex).toBe(inventory.literals[5]?.color.hex);
    expect(p3?.candidates).toEqual([{ name: "--p3-red", context: [":root"] }]);
    expect(inventory.literals[5]?.candidates).toEqual([]);
  });

  it("produces JSON the exported schema accepts", () => {
    expect(colorInventorySchema.parse(JSON.parse(JSON.stringify(inventory)))).toEqual(inventory);
  });
});

describe("inventoryCss: TSX", () => {
  const { literals } = inventoryCss([
    { path: "tokens.css", content: TOKENS },
    { path: "Chart.tsx", content: CHART_TSX },
  ]);
  const summary = literals.map(({ origin, property, text, context }) => ({
    origin,
    property,
    text,
    context,
  }));

  it("finds Tailwind arbitrary colors, SVG paint attributes and inline style colors", () => {
    expect(summary).toEqual([
      { origin: "tailwind", property: "bg-[#F0EFEA]", text: "#F0EFEA", context: ["<svg>"] },
      {
        origin: "tailwind",
        property: "fill-[rgb(37_37_36)]/50",
        text: "rgb(37 37 36)",
        context: ["<svg>"],
      },
      { origin: "tailwind", property: "[color:#565650]", text: "#565650", context: ["<svg>"] },
      { origin: "jsx-attribute", property: "stopColor", text: "#111411", context: ["<stop>"] },
      { origin: "jsx-attribute", property: "stroke", text: "#252524", context: ["<rect>"] },
      {
        origin: "jsx-style",
        property: "backgroundColor",
        text: "rgba(37, 37, 36, 0.72)",
        context: ["<div>"],
      },
      { origin: "jsx-style", property: "border", text: "white", context: ["<div>"] },
      { origin: "tailwind", property: "hover:bg-[#565650]", text: "#565650", context: [] },
    ]);
  });

  it("points at the line and column of the string that holds the color", () => {
    expect(literals[3]).toMatchObject({ file: "Chart.tsx", line: 7, column: 49 });
  });

  it("offers the same token candidates as it does for CSS", () => {
    expect(literals[0]?.candidates.map((candidate) => candidate.name)).toEqual([
      "--paper",
      "--yak-cream",
    ]);
  });

  it("refuses a file type it cannot read", () => {
    expect(() => inventoryCss([{ path: "icon.svg", content: "<svg/>" }])).toThrow(/icon\.svg/);
  });
});
