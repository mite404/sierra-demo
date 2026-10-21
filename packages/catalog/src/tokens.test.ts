import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The window chrome's tokens (ADR-110 to ADR-115): [foreground, background, the ratio tokens.css
// writes beside them, the floor it must clear]. Each ratio is recomputed from the token values
// and must also appear, as written, in tokens.css, so a comment that drifts fails too.
type Pair = [string, string, number, number];
// A translucent fill as it lands on a ground: [fill, ground, ratio written, floor].
type Wash = [string, string, number, number];

const CSS = readFileSync(new URL("tokens.css", import.meta.url), "utf8");
// What paint-chrome.mjs measured on the painting it shipped, decoded from the file itself.
const PAINTING: unknown = JSON.parse(
  readFileSync(new URL("../../../apps/web/public/chrome/painting.json", import.meta.url), "utf8"),
);

// The bar is green in the light theme and Umbralkai's grey in the dark one (ADR-162), so each
// theme writes its own ratios.
const CHROME: Record<"light" | "dark", Pair[]> = {
  light: [
    ["--on-chrome", "--chrome", 8.98, 4.5],
    ["--on-chrome-soft", "--chrome", 5.56, 4.5],
    ["--chrome-hover", "--chrome", 1.25, 1.2],
    ["--on-chrome", "--chrome-hover", 7.21, 4.5],
    ["--chrome-pill", "--chrome", 8.98, 3],
    ["--on-chrome-pill", "--chrome-pill", 16.11, 4.5],
    ["--on-chrome-pill-soft", "--chrome-pill", 6.93, 4.5],
    ["--on-chrome-pill-soft", "--chrome-pill-hover", 5.89, 4.5],
    ["--on-chrome", "--chrome-painting", 7.41, 4.5],
    ["--on-chrome-painting-soft", "--chrome-painting", 5.79, 4.5],
  ],
  dark: [
    ["--on-chrome", "--chrome", 12.6, 4.5],
    ["--on-chrome-soft", "--chrome", 7.64, 4.5],
    ["--chrome-hover", "--chrome", 1.26, 1.2],
    ["--on-chrome", "--chrome-hover", 10.02, 4.5],
    ["--chrome-pill", "--chrome", 15.96, 3],
    ["--on-chrome-pill", "--chrome-pill", 17.61, 4.5],
    ["--on-chrome-pill-soft", "--chrome-pill", 7.31, 4.5],
    ["--on-chrome-pill-soft", "--chrome-pill-hover", 6.21, 4.5],
    ["--on-chrome", "--chrome-painting", 6.34, 4.5],
    ["--on-chrome-painting-soft", "--chrome-painting", 5.48, 4.5],
  ],
};
const LIGHT: Pair[] = [
  ["--desk", "--yak-paper-bright", 1.54, 1.3],
  ["--desk", "--paper", 1.43, 1.3],
  ["--desk", "--chrome", 6.3, 1.5],
];
const DARK: Pair[] = [
  ["--desk", "--paper", 1.52, 1.3],
  ["--desk", "--chrome", 1.63, 1.5],
];
const WASHES: Wash[] = [
  ["--chrome-line", "--chrome", 1.63, 1],
  ["--chrome-painting-hover", "--chrome-painting", 1.37, 1.2],
];
// The inks on the painted bar's hover fill, which only darkens the painting.
const ON_WASH: Pair[] = [
  ["--on-chrome", "--chrome-painting-hover", 10.12, 4.5],
  ["--on-chrome-painting-soft", "--chrome-painting-hover", 7.91, 4.5],
];
// An archived thread's title and icon (ADR-129): dimmer than the soft ink, and still text on the
// sidebar's paper and on its hover fill.
const FAINT: Record<"light" | "dark", Pair[]> = {
  light: [
    ["--faint-ink", "--paper", 5.17, 4.5],
    ["--faint-ink", "--paper-deep", 4.67, 4.5],
  ],
  dark: [
    ["--faint-ink", "--paper", 6.19, 4.5],
    ["--faint-ink", "--paper-deep", 4.56, 4.5],
  ],
};
// The splash's figure, the ink at a share over nothing, as it lands on the open space's paper
// (ADR-135): a sketch behind the words, never competing with them.
const SPLASH_FIGURE = { light: 1.84, dark: 2.29 };
// The splash's paintings show through their paper wash at a share in this range: a picture
// under the field, not a photograph on it, the same for both.
const SPLASH_PAINT = { min: 0.1, max: 0.3 };
// No pixel of the decoded painting may be brighter than this (paint-chrome.mjs).
const PAINTING_BOUND = 0.1;

type Rgb = [number, number, number];

// The declarations of one block: `:root {` or `:root[data-theme="dark"] {`.
function block(selector: string): Map<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  const body = CSS.slice(start, CSS.indexOf("\n}", start));
  const declarations = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const [name, value] = [match[1] ?? "", match[2] ?? ""];
    declarations.set(name, value.replaceAll(/\/\*.*?\*\//g, "").trim());
  }
  return declarations;
}

const hex = (value: string): Rgb => {
  const byte = (at: number) => parseInt(value.slice(1 + at, 3 + at), 16);
  return [byte(0), byte(2), byte(4)];
};

// A token's colour in a theme: a hex, a var() of another token, or a color-mix() in srgb of
// two of those; the dark block overrides the root one, as the cascade does.
function colour(name: string, theme: Map<string, string>[], ground?: Rgb): Rgb {
  let value: string | undefined;
  for (const each of theme) value = each.get(name) ?? value;
  if (value === undefined) throw new Error(`${name} is not declared`);
  return resolve(value, theme, ground);
}

// `transparent` is what the colour lands on, a `ground` a translucent token is given.
function resolve(value: string, theme: Map<string, string>[], ground?: Rgb): Rgb {
  if (value.startsWith("#")) return hex(value);
  if (value === "transparent" && ground !== undefined) return ground;
  const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return reference === undefined ? mixOf(value, theme, ground) : colour(reference, theme, ground);
}

// `color-mix(in srgb, A n%, B)`: A at n% over B.
function mixOf(value: string, theme: Map<string, string>[], ground?: Rgb): Rgb {
  const [, first = "", share = "", second = ""] =
    /^color-mix\(in srgb, (.+) (\d+)%, (.+)\)$/.exec(value) ?? [];
  if (first === "") throw new Error(`cannot resolve ${value}`);
  const [a, b] = [resolve(first, theme, ground), resolve(second, theme, ground)];
  const k = Number(share) / 100;
  const blend = (i: 0 | 1 | 2) => a[i] * k + b[i] * (1 - k);
  return [blend(0), blend(1), blend(2)];
}

const linear = (channel: number): number => {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb): number =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const ROOT = block(":root");
const THEMES = { light: [ROOT], dark: [ROOT, block(':root[data-theme="dark"]')] };

// A token's declared value in a theme: the last block that declares it wins, as the cascade does.
function declared(name: string, theme: Map<string, string>[]): string {
  let value = "";
  for (const each of theme) value = each.get(name) ?? value;
  return value;
}
// How much of a splash painting shows through its wash: one less the wash's share of paper.
const shown = (token: string, theme: Map<string, string>[]): number =>
  1 - Number(/(\d+)%/.exec(declared(token, theme))?.[1]) / 100;

// A ratio as tokens.css writes it: "8.98:1", "16.1:1", "6.3:1".
const writtenInCss = (ratio: number): boolean =>
  [ratio.toFixed(2), ratio.toFixed(1), String(ratio)].some((text) => CSS.includes(`${text}:1`));

// Each pair that misses its floor, no longer matches its written ratio, or whose written ratio
// tokens.css no longer carries. A `ground` is where a translucent token lands.
function misses(pairs: Pair[], theme: Map<string, string>[], ground?: string): string[] {
  const under = ground === undefined ? undefined : colour(ground, theme);
  return pairs.flatMap(([fg, bg, written, floor]) => {
    const ratio = contrast(
      luminance(colour(fg, theme, under)),
      luminance(colour(bg, theme, under)),
    );
    const rounded = Math.round(ratio * 100) / 100;
    const off = ratio < floor || Math.abs(rounded - written) > 0.05 || !writtenInCss(written);
    return off ? [`${fg} on ${bg}: ${rounded}, written ${written}, floor ${floor}`] : [];
  });
}

describe("the window chrome's tokens", () => {
  it("clear their ratios in either theme, as tokens.css writes them", () => {
    expect([...misses(CHROME.light, THEMES.light), ...misses(CHROME.dark, THEMES.dark)]).toEqual(
      [],
    );
  });

  it("set the window apart from its desk, and the trim apart from the body", () => {
    expect([...misses(LIGHT, THEMES.light), ...misses(DARK, THEMES.dark)]).toEqual([]);
  });

  it("lay their translucent fills over the bar where they show, and the inks on them", () => {
    const washes = WASHES.flatMap(([fill, ground, written, floor]) =>
      misses([[fill, ground, written, floor]], THEMES.light, ground),
    );
    const inks = misses(ON_WASH, THEMES.light, "--chrome-painting");
    expect([...washes, ...inks]).toEqual([]);
  });

  it("keep the painted bar's inks readable on its brightest pixel, as the file holds it", () => {
    const facts =
      typeof PAINTING === "object" &&
      PAINTING !== null &&
      "mean" in PAINTING &&
      "brightest" in PAINTING
        ? { mean: String(PAINTING.mean), brightest: Number(PAINTING.brightest) }
        : { mean: "", brightest: Infinity };
    const ratios = ["--on-chrome", "--on-chrome-painting-soft"].map((ink) =>
      contrast(luminance(colour(ink, THEMES.light)), facts.brightest),
    );
    expect({
      mean: ROOT.get("--chrome-painting"),
      withinBound: facts.brightest <= PAINTING_BOUND,
      readable: Math.min(...ratios) >= 4.5,
    }).toEqual({ mean: facts.mean, withinBound: true, readable: true });
  });

  it("draw the splash's figure faintly off the paper in either theme", () => {
    const measured = Object.entries(THEMES).map(([name, theme]) => {
      const share = Number(/(\d+)%/.exec(declared("--splash-figure", theme))?.[1]) / 100;
      const paper = colour("--paper", theme);
      const ink = colour("--ink", theme);
      const over = (i: 0 | 1 | 2) => ink[i] * share + paper[i] * (1 - share);
      const line: Rgb = [over(0), over(1), over(2)];
      return [name, Math.round(contrast(luminance(line), luminance(paper)) * 100) / 100];
    });
    expect(Object.fromEntries(measured)).toEqual(SPLASH_FIGURE);
  });

  it("show the splash's paintings through their one wash in either theme", () => {
    for (const theme of Object.values(THEMES)) {
      const through = shown("--splash-wash", theme);
      expect(through).toBeGreaterThanOrEqual(SPLASH_PAINT.min);
      expect(through).toBeLessThanOrEqual(SPLASH_PAINT.max);
    }
  });
});

describe("the faint ink (ADR-129)", () => {
  it("dim an archived thread and keep it readable in either theme", () => {
    expect([...misses(FAINT.light, THEMES.light), ...misses(FAINT.dark, THEMES.dark)]).toEqual([]);
  });
});

// The rules whose selectors name a button that sits beside `.btn` (Cancel, Done, Skip, Submit).
// They take their corners from --btn-radius, so no two of them can drift apart again.
const BUTTON_SELECTORS = [".btn", ".dictation-footer button:not(.btn)", ".awaiting-action"];

// Every `selector { body }` pair in the catalog's stylesheets, with nested at-rules flattened.
function rules(): { selector: string; body: string }[] {
  const dir = new URL(".", import.meta.url);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".css"))
    .flatMap((file) => {
      const css = readFileSync(new URL(file, dir), "utf8").replaceAll(/\/\*[\s\S]*?\*\//g, "");
      return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
        selector: (match[1] ?? "").trim(),
        body: match[2] ?? "",
      }));
    });
}

describe("the button radius", () => {
  it("is one token, 4px, that every button beside .btn takes its corners from", () => {
    const radii: Record<string, (string | undefined)[]> = {};
    for (const selector of BUTTON_SELECTORS) {
      const found = rules().filter((rule) => rule.selector === selector);
      radii[selector] = found.map((rule) => /border-radius:\s*([^;]+);/.exec(rule.body)?.[1]);
    }
    expect({ token: ROOT.get("--btn-radius"), radii }).toEqual({
      token: "4px",
      radii: {
        ".btn": ["var(--btn-radius)"],
        ".dictation-footer button:not(.btn)": ["var(--btn-radius)"],
        ".awaiting-action": ["var(--btn-radius)"],
      },
    });
  });
});

describe("the edge shadow", () => {
  it("drops below the box, more than it reaches right, and leaves the top and left clear", () => {
    const reach = Object.values(THEMES).map((theme) => {
      const [x = NaN, y = NaN, blur = NaN, spread = NaN] =
        /^(-?\d+)px (-?\d+)px (\d+)px (-?\d+)px /
          .exec(declared("--edge-shadow", theme))
          ?.slice(1)
          .map(Number) ?? [];
      // How far the blur reaches past an edge is the blur and the spread plus the offset toward
      // it. Nothing reaches the top; the left stays inside one sigma (half the blur), where
      // the shadow is too faint to see; the bottom is the edge it falls from.
      return {
        bottomOverRight: y > x && x >= 0,
        clearOfTop: blur + spread <= y,
        leftUnseen: blur + spread - x <= blur / 2,
      };
    });
    expect(reach).toEqual([
      { bottomOverRight: true, clearOfTop: true, leftUnseen: true },
      { bottomOverRight: true, clearOfTop: true, leftUnseen: true },
    ]);
  });
});
