import { useId } from "react";
import { Link } from "react-router";
import { SEAL_WORDS } from "./seal-words";

// The page about the verify-ui-drift tooling (ADR-160), which the seal leads to.
const TOOLING_PATH = "/verify-ui-tooling";

// The seal's drawing, in a 120-unit box about its centre: the serrated edge, the face, the
// ring the words sit in, and the two arcs the words follow.
const CENTRE = 60;
const TEETH = 36;
const EDGE_OUTER = 58;
const EDGE_INNER = 53;
const FACE = 47;
const RING = 44;
const TOP_ARC = { radius: 35, from: -140, to: -40 };
const BOTTOM_ARC = { radius: 42, from: 150, to: 30 };
const TOP_WORDS = "YAKLABS";
const BOTTOM_WORDS = "SEAL OF QUALITY";

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

// A point `radius` out from the centre at `degrees`, clockwise from three o'clock, as SVG turns.
const pointAt = (radius: number, degrees: number): string =>
  `${(CENTRE + radius * Math.cos(radians(degrees))).toFixed(2)} ${(CENTRE + radius * Math.sin(radians(degrees))).toFixed(2)}`;

// The serrated edge as one closed path: `teeth` points out at `outer`, each followed by one in
// at `inner`, starting at twelve o'clock.
function starburst(teeth: number, outer: number, inner: number): string {
  const step = 180 / teeth; // → degrees between a point and the notch after it
  const points = Array.from({ length: teeth * 2 }, (_, i) =>
    pointAt(i % 2 === 0 ? outer : inner, i * step - 90),
  ); // → "x y"[]
  return `M${points.join("L")}Z`;
}

// An arc from `from` to `to` degrees, the short way round: clockwise where `to` is the greater
// angle, so the words along it read left to right over the top and under the bottom alike.
function arc({ radius, from, to }: { radius: number; from: number; to: number }): string {
  const sweep = to > from ? 1 : 0;
  return `M${pointAt(radius, from)}A${radius} ${radius} 0 0 ${sweep} ${pointAt(radius, to)}`;
}

// The face's ring and the words along it: a hairline of the deep gold at the face's edge, a
// glint inside it, "Yaklabs" over the top and "Seal of quality" under the bottom.
function Ring({ top, bottom }: { top: string; bottom: string }) {
  return (
    <>
      <circle cx={CENTRE} cy={CENTRE} r={FACE} fill="var(--seal-gold)" />
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={FACE}
        fill="none"
        stroke="var(--seal-gold-deep)"
        strokeWidth="1"
      />
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RING}
        fill="none"
        stroke="var(--seal-gold-glint)"
        strokeWidth="0.75"
      />
      <text className="seal-words" fontSize="8.5">
        <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">
          {TOP_WORDS}
        </textPath>
      </text>
      <text className="seal-words" fontSize="7">
        <textPath href={`#${bottom}`} startOffset="50%" textAnchor="middle">
          {BOTTOM_WORDS}
        </textPath>
      </text>
    </>
  );
}

// The medal's drawing, in its 120-unit box: the gradient and the arcs its words follow, the
// serrated edge, and the ring. `id` keeps one medal's gradient and arcs from another's.
function Medal({ id }: { id: string }) {
  const face = `${id}-face`;
  const top = `${id}-top`;
  const bottom = `${id}-bottom`;
  return (
    <>
      <defs>
        <radialGradient id={face} cx="32%" cy="28%" r="78%">
          <stop offset="0" stopColor="var(--seal-gold-glint)" />
          <stop offset="0.45" stopColor="var(--seal-gold)" />
          <stop offset="1" stopColor="var(--seal-gold-deep)" />
        </radialGradient>
        <path id={top} d={arc(TOP_ARC)} />
        <path id={bottom} d={arc(BOTTOM_ARC)} />
      </defs>
      <path
        d={starburst(TEETH, EDGE_OUTER, EDGE_INNER)}
        fill={`url(#${face})`}
        stroke="var(--seal-gold-deep)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <Ring top={top} bottom={bottom} />
    </>
  );
}

/**
 * The design tooling seal: a gold medal with a serrated edge, "Yaklabs" over the top of its
 * ring and "Seal of quality" under the bottom, drawn in the seal's own tokens so it keeps one
 * colour in either theme. A picture only, with no name of its own: the link or the heading
 * beside it says what it is.
 * @param size The seal's width and height in CSS pixels.
 */
export function Seal({ size = 112, className }: { size?: number; className?: string }) {
  const id = useId(); // → unique per instance, so two seals on a page never share a gradient
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <Medal id={id} />
    </svg>
  );
}

/** The ribbon's words: the link's name, and what the ribbon carries in capitals (seal-words.ts). */
export const RIBBON_WORDS = "Now with design tooling!";

// The welcome's seal in CSS pixels, as the HTML ribbon it replaces measured: a 112px medal
// centred on a 230px ribbon, 27px deep (8px above and below 11px words), its ends notched 8px.
// The words are Inter 600 at 11px drawn as outlines (seal-words.ts), 186px wide with the ribbon's
// 0.1em tracking, centred on a baseline that centres their capitals (Inter's cap height,
// 0.727em). Outlines, not text: Chrome redraws the grown seal at its new size once the hover
// settles and rounds text to whole pixels there, so live words jumped up against the ribbon
// (Ethan); a shape is never rounded, so it scales with the ribbon exactly.
const LINK = { width: 230, height: 112 };
const MEDAL = { size: 112, x: (LINK.width - 112) / 2 };
const RIBBON = { top: 42.5, depth: 27, notch: 8 };
const WORDS = { x: (LINK.width - SEAL_WORDS.width) / 2, baseline: 56 + (11 * 0.727) / 2 };

// The ribbon's outline: a band across the link's width with a notch cut into either end.
const ribbonPoints = (): string => {
  const { top, depth, notch } = RIBBON;
  const [right, bottom, middle] = [LINK.width, top + depth, top + depth / 2];
  return `0,${top} ${right},${top} ${right - notch},${middle} ${right},${bottom} 0,${bottom} ${notch},${middle}`;
};

// The ribbon and its words.
function Ribbon() {
  return (
    <g className="seal-ribbon">
      <polygon points={ribbonPoints()} />
      <path
        className="seal-ribbon-words"
        d={SEAL_WORDS.path}
        transform={`translate(${WORDS.x} ${WORDS.baseline})`}
      />
    </g>
  );
}

/**
 * The welcome's link to the tooling page (ADR-160): the seal with an ink ribbon across its
 * middle saying "Now with design tooling!", which runs past the seal on either side. The ribbon's
 * words are the link's name, so a screen reader hears what a sighted visitor reads. It fills
 * with moss on hover, as the site's button does. Medal, ribbon and words are one drawing, so
 * they grow and settle as one piece (Ethan): as HTML beside an SVG, the words snapped to whole
 * font sizes and the ribbon to whole pixels while the medal scaled smoothly, each on its own
 * frame.
 */
export function DesignToolingSeal({ className }: { className?: string }) {
  const id = useId();
  return (
    <Link
      to={TOOLING_PATH}
      aria-label={RIBBON_WORDS}
      data-slot="design-tooling-seal"
      className={`seal-link ${className ?? ""}`}
    >
      <svg
        viewBox={`0 0 ${LINK.width} ${LINK.height}`}
        width={LINK.width}
        height={LINK.height}
        aria-hidden="true"
        focusable="false"
      >
        <g transform={`translate(${MEDAL.x} 0) scale(${MEDAL.size / 120})`}>
          <Medal id={id} />
        </g>
        <Ribbon />
      </svg>
    </Link>
  );
}
