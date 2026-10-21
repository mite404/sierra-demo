import type { CSSProperties } from "react";
import "./motion.css";

// React's style type has no custom properties; this widens it to the `--name` ones.
type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>;

type Pattern = "wave" | "orbit";
type Cells = 4 | 6;

// Each square's place in a clockwise lap from the top left, listed in DOM (reading) order.
// 2x2: TL TR / BL BR → TL 0, TR 1, BR 2, BL 3.
// 2x3: TL TR / ML MR / BL BR → TL 0, TR 1, MR 2, BR 3, BL 4, ML 5.
const CLOCKWISE_STEP: Record<Cells, number[]> = {
  4: [0, 1, 3, 2],
  6: [0, 1, 5, 2, 4, 3],
};

// A square's lap position, handed to the orbit's delay in motion.css.
function stepStyle(step: number): StyleWithVars {
  return { "--working-step": step };
}

type AgentWorkingProps = {
  /** One full loop, in milliseconds. */
  duration?: number;
  /** `wave` sweeps left to right and rests; `orbit` runs clockwise from the top left. */
  pattern?: Pattern;
  /** 4 is Kay's 2x2 glyph; 6 is two columns of three in the same 12px height. */
  cells?: Cells;
  /** What a screen reader announces. */
  label?: string;
};

/**
 * Kay's task-size glyph as an "agent working" indicator: squares of green that fade in and
 * out on a loop, as a left-to-right wave or a clockwise orbit, each flash in one of seven
 * brand greens. Holds still under reduced motion.
 */
export function AgentWorking({
  duration = 2000,
  pattern = "wave",
  cells = 4,
  label = "Agent working",
}: AgentWorkingProps) {
  const style: StyleWithVars = {
    "--working-duration": `${duration}ms`, // number → "2000ms"
    "--working-cells": cells, // the orbit divides one lap by this
  };
  const steps = CLOCKWISE_STEP[cells]; // → number[], one per square
  // Keys carry the cell count: a new count replaces every square, so all of them start their
  // animation on the same frame. Reusing some would leave those on the old clock, out of step.
  // <output> is a live status region, so the label is announced once when it appears.
  return (
    <output
      className="agent-working"
      aria-label={label}
      data-pattern={pattern}
      data-cells={cells}
      style={style}
    >
      {steps.map((step) => (
        <span key={`${cells}-${step}`} className="agent-working-cell" style={stepStyle(step)} />
      ))}
    </output>
  );
}
