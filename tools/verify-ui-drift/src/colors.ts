import Color from "colorjs.io";
import { AtRule, parse, Rule, type Container, type Document, type Root } from "postcss";
import valueParser from "postcss-value-parser";
import ts from "typescript";
import type {
  AuthoredColor,
  ColorInventory,
  ColorLiteral,
  ColorViews,
  Contrast,
  CustomProperty,
  FoundColor,
  TokenCandidate,
} from "./colors-schema.ts";

// A source file handed in by the caller; this module never touches the filesystem.
type SourceFile = { path: string; content: string };
type ParsedFile =
  | { kind: "css"; path: string; root: Root }
  | { kind: "script"; path: string; source: ts.SourceFile };
type Located = FoundColor & { index: number };
type CandidatesFor = (color: ColorViews) => TokenCandidate[];

const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
]);
// Functions whose result only the browser's cascade can settle.
const UNRESOLVED_FUNCTIONS = new Set(["var", "env", "attr", "color-mix", "light-dark"]);
const HEX = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
// Keywords that parse as colors but are not a choice of color.
const NOT_A_COLOR_CHOICE = new Set(["transparent", "currentcolor"]);
// Named colors are only read in properties that paint; elsewhere `red` is an identifier.
const PAINT_PROPERTY =
  /color|background|border|outline|fill|stroke|shadow|decoration|column-rule|filter/;
const SVG_PAINT_ATTRIBUTES = new Set([
  "fill",
  "stroke",
  "color",
  "stopColor",
  "floodColor",
  "lightingColor",
]);
// A bracketed Tailwind arbitrary value such as `bg-[#fff]`, or an arbitrary property such as
// `[color:#fff]`; the character before the bracket tells a utility from other brackets.
const TAILWIND_ARBITRARY = /(?<=^|[-:])\[([^[\]\s]+)\]/g;
const SCRIPT_KINDS = new Map([
  [".ts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".js", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
]);

// Colors: parse and read

// colorjs throws on anything it cannot read, var() and color-mix() included.
const parseColor = (value: string): Color | null => {
  try {
    return new Color(value.trim());
  } catch {
    return null;
  }
};

const round = (value: number, places: number) => Number(value.toFixed(places));

const readColor = (color: Color): ColorViews => {
  const hex = color.to("srgb").toString({ format: "hex", collapse: false }); // gamut-mapped
  return {
    hex,
    oklch: color.to("oklch").toString({ precision: 4 }),
    alpha: color.alpha,
    inSrgb: color.inGamut("srgb"),
    roundTripDelta: round(color.deltaE(new Color(hex), "2000"), 3),
  };
};

// Browsers composite in gamma-encoded sRGB, so the blend happens there.
const over = (top: Color, bottom: Color): Color => {
  const upper = top.to("srgb").coords; // → [r, g, b]
  const lower = bottom.to("srgb").coords; // → [r, g, b]
  const blend = (index: 0 | 1 | 2) =>
    (upper[index] ?? 0) * top.alpha + (lower[index] ?? 0) * (1 - top.alpha);
  return new Color("srgb", [blend(0), blend(1), blend(2)], 1);
};

// Hex is exact to 8 bits inside sRGB; outside it the hex is gamut-mapped, so OKLCH decides.
const matchKey = (views: ColorViews) => (views.inSrgb ? views.hex : views.oklch);

// CSS values

const isNamedColor = (word: string) =>
  /^[a-z]+$/i.test(word) && !NOT_A_COLOR_CHOICE.has(word.toLowerCase()) && !!parseColor(word);

// Literal colors in one CSS value, in source order. url() is skipped whole, so fragments like
// url(#fff) never read as hex; var() fallbacks are searched, since they are literals too.
// A walk callback returns whether to descend into the node.
const findColors = (value: string, { named }: { named: boolean }): Located[] => {
  const found: Located[] = [];
  const keep = (text: string, index: number) => {
    const color = colorViews(text);
    if (color) found.push({ text, color, index });
  };
  valueParser(value).walk((node) => {
    if (node.type === "function") {
      const name = node.value.toLowerCase();
      if (name === "url") return false;
      if (!COLOR_FUNCTIONS.has(name)) return true;
      keep(valueParser.stringify(node), node.sourceIndex);
      return false;
    }
    if (node.type !== "word") return true;
    if (HEX.test(node.value) || (named && isNamedColor(node.value)))
      keep(node.value, node.sourceIndex);
    return true;
  });
  return found;
};

const readAuthored = (value: string): AuthoredColor => {
  const parsed = valueParser(value);
  const references = new Set<string>();
  const functions = new Set<string>();
  parsed.walk((node) => {
    if (node.type !== "function") return true;
    const name = node.value.toLowerCase();
    const [first] = node.nodes;
    if (name === "var" && first?.type === "word") references.add(first.value);
    const unreadColor = COLOR_FUNCTIONS.has(name) && !colorViews(valueParser.stringify(node));
    if (UNRESOLVED_FUNCTIONS.has(name) || unreadColor) functions.add(name);
    return name !== "url";
  });
  if (functions.size > 0) {
    return { kind: "unresolved", references: [...references], functions: [...functions] };
  }
  const colors = findColors(value, { named: true }).map(({ text, color }) => ({ text, color }));
  const parts = parsed.nodes.filter((node) => node.type !== "comment" && node.type !== "space");
  const [only] = colors;
  if (only && parts.length === 1 && colors.length === 1)
    return { kind: "literal", color: only.color };
  return colors.length > 0 ? { kind: "composite", colors } : { kind: "none" };
};

// CSS sources

const ruleLabel = (node: Container | Document): string | null => {
  if (node instanceof Rule) return node.selector;
  if (node instanceof AtRule) return `@${node.name} ${node.params}`.trim();
  return null;
};

// The enclosing rules and at-rules of a node, outermost first.
const contextOf = (node: Container | Document | undefined): string[] => {
  if (!node) return [];
  const label = ruleLabel(node);
  return [...contextOf(node.parent), ...(label === null ? [] : [label])];
};

const cssCustomProperties = (path: string, root: Root): CustomProperty[] => {
  const properties: CustomProperty[] = [];
  root.walkDecls(/^--/, (declaration) => {
    const { prop, value, source } = declaration;
    properties.push({
      file: path,
      line: source?.start?.line ?? 0,
      column: source?.start?.column ?? 0,
      context: contextOf(declaration.parent),
      name: prop,
      value,
      color: readAuthored(value),
    });
  });
  return properties;
};

const cssLiterals = (path: string, root: Root, candidatesFor: CandidatesFor): ColorLiteral[] => {
  const literals: ColorLiteral[] = [];
  root.walkDecls((declaration) => {
    const { prop, value, raws } = declaration;
    if (prop.startsWith("--")) return;
    const context = contextOf(declaration.parent);
    // Offsets count from the declaration's own text, which carries the value as written.
    const valueStart = prop.length + (raws.between ?? "").length;
    const named = PAINT_PROPERTY.test(prop.toLowerCase());
    for (const { text, color, index } of findColors(raws.value?.raw ?? value, { named })) {
      const { line, column } = declaration.positionInside(valueStart + index);
      const candidates = candidatesFor(color);
      literals.push({
        file: path,
        line,
        column,
        context,
        origin: "css",
        property: prop,
        text,
        color,
        candidates,
      });
    }
  });
  return literals;
};

// Script sources

const kebab = (name: string) => name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

// The text of a string attribute or string expression; null for anything computed.
const staticText = (node: ts.Node | undefined): string | null => {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isJsxExpression(node)) return staticText(node.expression);
  return null;
};

// Every piece of literal string text, template chunks included.
const stringText = (node: ts.Node): string | null =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateHead(node) ||
  ts.isTemplateMiddle(node) ||
  ts.isTemplateTail(node)
    ? node.text
    : null;

const isInlineStyle = (node: ts.Node) =>
  ts.isObjectLiteralExpression(node) &&
  ts.isJsxExpression(node.parent) &&
  ts.isJsxAttribute(node.parent.parent) &&
  node.parent.parent.name.getText() === "style";

const isElement = (node: ts.Node) =>
  ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node);

const elementOf = (node: ts.Node): string[] => {
  const element = ts.findAncestor(node.parent, isElement);
  if (!element) return [];
  const tag = ts.isJsxElement(element) ? element.openingElement.tagName : element.tagName;
  return [`<${tag.getText()}>`];
};

// Tailwind writes spaces as underscores and may prefix a type hint or property (`color:`).
const tailwindColors = (text: string): { className: string; found: FoundColor }[] =>
  text
    .split(/\s+/)
    .flatMap((className) =>
      [...className.matchAll(TAILWIND_ARBITRARY)].flatMap(([, inner = ""]) =>
        findColors(inner.replaceAll("_", " ").replace(/^[a-z-]+:/, ""), { named: false }).map(
          (found) => ({ className, found }),
        ),
      ),
    );

// Colors in string literals the page paints with: SVG paint attributes, inline style objects,
// and Tailwind arbitrary values in any string. Comments never reach the syntax tree.
const scriptLiterals = (
  path: string,
  source: ts.SourceFile,
  candidatesFor: CandidatesFor,
): ColorLiteral[] => {
  const literals: ColorLiteral[] = [];
  const add = (
    node: ts.Node,
    origin: ColorLiteral["origin"],
    property: string,
    found: FoundColor,
  ) => {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    literals.push({
      file: path,
      line: start.line + 1,
      column: start.character + 1,
      context: elementOf(node),
      origin,
      property,
      text: found.text,
      color: found.color,
      candidates: candidatesFor(found.color),
    });
  };
  const jsxAttribute = (node: ts.JsxAttribute): void => {
    if (node.initializer) {
      const name = node.name.getText(source);
      const text = SVG_PAINT_ATTRIBUTES.has(name) ? staticText(node.initializer) : null;
      for (const found of text === null ? [] : findColors(text, { named: true })) {
        add(node.initializer, "jsx-attribute", name, found);
      }
    }
  };
  const styleProperty = (node: ts.PropertyAssignment): void => {
    if (isInlineStyle(node.parent)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
      const text = staticText(node.initializer);
      const named = PAINT_PROPERTY.test(kebab(key));
      for (const found of text === null ? [] : findColors(text, { named })) {
        add(node.initializer, "jsx-style", key, found);
      }
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node)) jsxAttribute(node);
    if (ts.isPropertyAssignment(node)) styleProperty(node);
    const text = stringText(node);
    for (const { className, found } of text === null ? [] : tailwindColors(text)) {
      add(node, "tailwind", className, found);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return literals;
};

// Inventory

const parseFile = ({ path, content }: SourceFile): ParsedFile => {
  const extension = /\.[^./]+$/.exec(path)?.[0].toLowerCase() ?? "";
  const scriptKind = SCRIPT_KINDS.get(extension);
  if (extension === ".css") return { kind: "css", path, root: parse(content, { from: path }) };
  if (scriptKind !== undefined) {
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKind);
    return { kind: "script", path, source };
  }
  throw new Error(`Cannot inventory colors in ${path}: expected .css, .ts, .tsx, .js or .jsx`);
};

// Every literal-valued token, keyed by its exact color. Same-colored tokens stay separate
// entries: sharing a value does not make two roles interchangeable.
const indexTokens = (customProperties: CustomProperty[]): Map<string, TokenCandidate[]> => {
  const index = new Map<string, TokenCandidate[]>();
  for (const { name, context, color } of customProperties) {
    if (color.kind !== "literal") continue;
    const key = matchKey(color.color);
    index.set(key, [...(index.get(key) ?? []), { name, context }]);
  }
  return index;
};

/**
 * Read one CSS color, typically a browser-computed value, as hex, OKLCH, alpha, sRGB gamut
 * membership and the CIEDE2000 its hex loses.
 * @returns null for anything that is not a color on its own: `var()`, `color-mix()`,
 *   `currentcolor`, CSS-wide keywords, malformed hex.
 */
export function colorViews(value: string): ColorViews | null {
  const color = parseColor(value);
  return color && readColor(color);
}

/**
 * Whether two readings are exactly the same color: the same 8-bit hex, alpha included, inside
 * sRGB; the same OKLCH outside it, where the hex is gamut-mapped. Sameness is not
 * interchangeability; tokens that match still name different roles.
 */
export function sameColor(a: ColorViews, b: ColorViews): boolean {
  return matchKey(a) === matchKey(b);
}

/**
 * The WCAG 2.1 contrast of an already computed foreground on an already computed background.
 * A translucent foreground is laid over the background first; a translucent background is
 * inconclusive, since what shows through it is unknown here.
 */
export function contrast({
  foreground,
  background,
}: {
  foreground: string;
  background: string;
}): Contrast {
  const fore = parseColor(foreground);
  const back = parseColor(background);
  if (!fore) return { kind: "inconclusive", reason: "unparsed-foreground" };
  if (!back) return { kind: "inconclusive", reason: "unparsed-background" };
  if (back.alpha < 1) return { kind: "inconclusive", reason: "translucent-background" };
  const composited = fore.alpha < 1;
  const shown = composited ? over(fore, back) : fore;
  return { kind: "ratio", ratio: shown.contrast(back, "WCAG21"), composited };
}

/**
 * Inventory the colors authored in a set of sources, as written: every CSS custom property
 * declaration with its rule context, and every raw color literal outside custom property
 * declarations, with the literal-valued tokens of exactly its color as candidates. Script
 * sources are read with the TypeScript parser for SVG paint attributes, inline style objects
 * and Tailwind arbitrary values. Values that need the cascade (`var()`, `color-mix()`) are
 * listed as unresolved, never guessed.
 * @throws when a file is not `.css`, `.ts`, `.tsx`, `.js` or `.jsx`, or when its CSS does not
 *   parse.
 */
export function inventoryCss(files: readonly SourceFile[]): ColorInventory {
  const parsed = files.map((file) => parseFile(file)); // → ParsedFile[]
  const customProperties = parsed.flatMap((file) =>
    file.kind === "css" ? cssCustomProperties(file.path, file.root) : [],
  );
  const tokens = indexTokens(customProperties); // → Map<matchKey, TokenCandidate[]>
  const candidatesFor = (color: ColorViews) => tokens.get(matchKey(color)) ?? [];
  const literals = parsed.flatMap((file) =>
    file.kind === "css"
      ? cssLiterals(file.path, file.root, candidatesFor)
      : scriptLiterals(file.path, file.source, candidatesFor),
  );
  return { customProperties, literals };
}
