import type { CSSProperties } from "react";
import "./motion.css";

// React's style type has no custom properties; this widens it to the `--name` ones.
type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>;

type AgentTreeProps = {
  /** One full climb, in milliseconds. */
  duration?: number;
  /** What a screen reader announces. */
  label?: string;
};

/**
 * Kay's three-pill glyph as an "agent working" indicator: green runs down the branches, left
 * then right, the base holds solid for a beat, then slides down out of view once the next climb
 * has started at the top. Holds still under reduced motion.
 */
export function AgentTree({ duration = 2000, label = "Agent working" }: AgentTreeProps) {
  const style: StyleWithVars = { "--working-duration": `${duration}ms` }; // number → "2000ms"
  // <output> is a live status region, so the label is announced once when it appears.
  return (
    <output className="agent-tree" aria-label={label} style={style}>
      <span className="agent-tree-pill" />
      <span className="agent-tree-pill" />
      <span className="agent-tree-pill" />
    </output>
  );
}
