import { useEffect, useEffectEvent, useRef } from "react";
import { prefersReducedMotion } from "./reducedMotion";

// One sample every TICK_MS; each sample is a bar BAR px wide with GAP px after it.
const TICK_MS = 45;
const BAR = 3;
const GAP = 3;
const STEP = BAR + GAP;
// Spacing of the dotted "future" baseline to the right of the playhead.
const DOT_SPACING = 6;

type Palette = { accent: string; bar: string; future: string };

function readPalette(el: HTMLElement): Palette {
  const style = getComputedStyle(el);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    accent: token("--olive", "#515e38"),
    bar: token("--ink", "#252524"),
    future: token("--soft-ink", "#5c5c57"),
  };
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, mid: number, height: number) {
  const y = mid - height / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, BAR, height, BAR / 2);
  ctx.fill();
}

/**
 * A DAW-style recording waveform: the playhead is locked to the center, new audio
 * enters at the playhead and scrolls right to left, and the empty timeline ahead is
 * a dotted baseline. `read` is sampled once per tick and returns a 0-1 level.
 */
export function Waveform({ read }: { read: () => number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Samples through the latest `read` without restarting the animation loop when it changes.
  const sample = useEffectEvent(read);

  useEffect((): void | (() => void) => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const palette = readPalette(el);
    const smooth = !prefersReducedMotion();
    const levels: number[] = [];
    let lastTick = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
        el.width = Math.round(width * dpr);
        el.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // A hidden tab can skip seconds; resume from now instead of replaying them.
      if (now - lastTick > 1000) lastTick = now - TICK_MS;
      while (now - lastTick >= TICK_MS) {
        levels.unshift(sample());
        lastTick += TICK_MS;
      }
      const playhead = Math.round(width / 2);
      levels.length = Math.min(levels.length, Math.ceil(playhead / STEP) + 2);
      const drift = smooth ? (now - lastTick) / TICK_MS : 0;
      const mid = height / 2;

      ctx.fillStyle = palette.future;
      ctx.globalAlpha = 0.45;
      for (let x = playhead + 10; x < width; x += DOT_SPACING) ctx.fillRect(x, mid - 1, 2, 2);

      ctx.fillStyle = palette.bar;
      levels.forEach((level, index) => {
        const x = playhead - 6 - (index + drift) * STEP;
        if (x < -BAR) return;
        ctx.globalAlpha = 0.25 + 0.75 * Math.max(0, x / playhead);
        drawBar(ctx, x, mid, Math.max(3, level * (height - 12)));
      });

      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.accent;
      ctx.fillRect(playhead - 1, 6, 2, height - 12);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      className="waveform"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a live canvas cannot be an <img>; role="img" names its drawing
      role="img"
      aria-label="Live audio waveform, newest sound at the center"
    />
  );
}
