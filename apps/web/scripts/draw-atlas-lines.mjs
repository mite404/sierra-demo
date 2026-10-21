#!/usr/bin/env node
// Draws the construction lines behind Atlas on the empty canvas (ADR-136), after Ethan's
// composed surface: a dotted circle and a small one concentric with his globe, the small
// circle's diameter, and six spokes through the globe's centre. The file is a CSS mask filled
// with --splash-line, so only the strokes exist; they are one screen pixel at any size.
//
//   node apps/web/scripts/draw-atlas-lines.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./harness.mjs";

const OUT = path.join(ROOT, "apps/web/public/splash/atlas-lines.svg");
// The box is eight globe radii wide, centred on the globe, so the spokes run four radii out,
// past any surface's edge; index.css fades them out before they get there.
const SIZE = 1000;
const C = SIZE / 2;
const R = SIZE / 8; // the globe's radius
const DOTTED = 1.48 * R;
const SMALL = 0.49 * R;
const SPOKE = 4 * R;
// The spokes' angles from the horizontal, in degrees: three pairs, mirrored top and bottom.
const ANGLES = [29, 45, 61, -29, -45, -61];

const round = (n) => Math.round(n * 10) / 10;
const rad = (deg) => (deg * Math.PI) / 180;

// A spoke through the centre at `deg`, from -SPOKE to +SPOKE.
const spoke = (deg) => {
  const [dx, dy] = [Math.cos(rad(deg)) * SPOKE, -Math.sin(rad(deg)) * SPOKE];
  return `M${round(C - dx)} ${round(C - dy)}L${round(C + dx)} ${round(C + dy)}`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" fill="none" stroke="#000" stroke-linecap="round" vector-effect="non-scaling-stroke">
<g stroke-width="1" vector-effect="non-scaling-stroke">
<circle cx="${C}" cy="${C}" r="${round(DOTTED)}" stroke-dasharray="2 5"/>
<circle cx="${C}" cy="${C}" r="${round(SMALL)}"/>
<path d="M${round(C - SMALL)} ${C}H${round(C + SMALL)}"/>
<path stroke-opacity=".7" d="${ANGLES.map(spoke).join("")}"/>
</g>
</svg>
`;

writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: ${svg.length} bytes`);
