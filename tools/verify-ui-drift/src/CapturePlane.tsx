import { Button } from "@yaklabs/ui/components/button";
import { Input } from "@yaklabs/ui/components/input";
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Point = { x: number; y: number };
const KEY_MOVES: Record<string, Point | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function WipeHandleIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M2 8h12M5 4.5 1.5 8 5 11.5M11 4.5 14.5 8 11 11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Keeps wipe layers and pointer/keyboard inspection in one source-pixel coordinate system. */
export function CapturePlane({
  images,
  frame,
  view,
  onPoint,
  onSplit,
  baselineLabel,
}: {
  images: {
    current: HTMLImageElement;
    baseline: HTMLImageElement | null;
    diff: HTMLImageElement | null;
  };
  frame: { x: number; y: number; width: number; height: number };
  view: { zoom: string; difference: boolean; split: number; point: Point };
  onPoint: (point: Point) => void;
  onSplit: (split: number) => void;
  baselineLabel: string;
}) {
  const { current, baseline, diff } = images;
  const { zoom, difference, split, point } = view;
  const showBaseline = Boolean(baseline) && !difference;
  const drag = useRef<number | null>(null);
  const size = (image: HTMLImageElement) => ({
    left: `${(-100 * frame.x) / frame.width}%`,
    top: `${(-100 * frame.y) / frame.height}%`,
    width: `${(100 * image.naturalWidth) / frame.width}%`,
    height: `${(100 * image.naturalHeight) / frame.height}%`,
  });
  const pointFrom = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: frame.x + ((event.clientX - rect.left) / rect.width) * frame.width,
      y: frame.y + ((event.clientY - rect.top) / rect.height) * frame.height,
    };
  };
  return (
    <>
      {showBaseline && (
        <div className="comparison-labels">
          <span className="image-tag">{baselineLabel}</span>
          <span className="image-tag">Current</span>
        </div>
      )}
      <div className="comparison-viewport">
        <div
          className="comparison-plane"
          style={{
            width:
              zoom === "fit"
                ? `min(100%, calc(var(--viewer-height) * ${frame.width / frame.height}))`
                : frame.width * Number(zoom),
            aspectRatio: `${frame.width} / ${frame.height}`,
          }}
        >
          <img src={current.src} alt="Current capture" draggable={false} style={size(current)} />
          {baseline && !difference && (
            <div className="baseline-layer" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <img
                src={baseline.src}
                alt="Baseline capture"
                draggable={false}
                style={size(baseline)}
              />
            </div>
          )}
          {difference && diff && (
            <img
              src={diff.src}
              alt="Pixel difference capture"
              draggable={false}
              style={size(diff)}
            />
          )}
          <Button
            variant="ghost"
            className="inspection-target"
            aria-label="Inspect capture pixels. Arrow keys move the inspection point."
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = event.pointerId;
              onPoint(pointFrom(event));
            }}
            onPointerMove={(event) => {
              if ((event.buttons & 1) === 0) drag.current = null;
              if (drag.current !== event.pointerId) return;
              onPoint(pointFrom(event));
            }}
            onPointerUp={(event) => {
              if (drag.current === event.pointerId) drag.current = null;
            }}
            onPointerCancel={(event) => {
              if (drag.current === event.pointerId) drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              const move = KEY_MOVES[event.key];
              if (!move) return;
              const step = event.shiftKey ? 10 : 1;
              onPoint({ x: point.x + move.x * step, y: point.y + move.y * step });
              event.preventDefault();
            }}
          />
          <span
            className="inspection-marker"
            aria-hidden="true"
            style={{
              left: `${(100 * (point.x - frame.x)) / frame.width}%`,
              top: `${(100 * (point.y - frame.y)) / frame.height}%`,
            }}
          />
          {showBaseline && (
            <>
              <span className="wipe-divider" style={{ left: `${split}%` }} aria-hidden="true">
                <span>
                  <WipeHandleIcon />
                </span>
              </span>
              <Input
                type="range"
                className="wipe-slider"
                aria-label="Before and after split"
                aria-valuetext={`${split}% baseline, ${100 - split}% current`}
                min={0}
                max={100}
                step={1}
                value={split}
                onChange={(event) => {
                  onSplit(Number(event.target.value));
                }}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
