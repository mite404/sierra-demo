import { Input } from "@yaklabs/ui/components/input";
import { useRef } from "react";

const SCRUB_THRESHOLD_PX = 3;

type Drag = { pointerId: number; startClientX: number; startValue: number; scrubbing: boolean };

/** Rounds a source-pixel coordinate into a dimension's zero-based bounds. */
export function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max - 1, Math.round(value)));
}

/** A numeric field that scrubs horizontally on drag, like Figma's coordinate inputs; vertical movement is ignored. */
export function CoordinateInput({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const drag = useRef<Drag | null>(null);
  return (
    <Input
      id={id}
      aria-label={label}
      type="number"
      min={0}
      max={max - 1}
      value={value}
      onChange={(event) => {
        onChange(clamp(Number(event.target.value), max));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startValue: value,
          scrubbing: false,
        };
      }}
      onPointerMove={(event) => {
        if ((event.buttons & 1) === 0) drag.current = null;
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const delta = event.clientX - active.startClientX;
        if (!active.scrubbing) {
          if (Math.abs(delta) < SCRUB_THRESHOLD_PX) return;
          active.scrubbing = true;
        }
        event.preventDefault();
        onChange(clamp(active.startValue + delta, max));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = null;
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    />
  );
}
