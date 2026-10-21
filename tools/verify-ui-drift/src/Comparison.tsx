import { Button } from "@yaklabs/ui/components/button";
import { useEffect, useId, useRef, useState } from "react";
import { CapturePlane } from "./CapturePlane.tsx";
import { clamp, CoordinateInput } from "./CoordinateInput.tsx";
import { framePixels } from "./framing.ts";
import type { RenderedCell } from "./report.ts";
import "./comparison.css";

type Images = {
  current: HTMLImageElement;
  baseline: HTMLImageElement | null;
  diff: HTMLImageElement | null;
  frame: ReturnType<typeof framePixels>;
};
type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; images: Images };
type Point = { x: number; y: number };

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

function readPixels(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Pixel inspection requires a canvas context");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function Crop({
  image,
  point,
  label,
  empty,
}: {
  image: HTMLImageElement | null;
  point: Point;
  label: string;
  empty: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context || !image) return;
    context.clearRect(0, 0, 192, 112);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      (24 - point.x) * 4,
      (14 - point.y) * 4,
      image.naturalWidth * 4,
      image.naturalHeight * 4,
    );
  }, [image, point]);
  return (
    <figure className="pixel-crop">
      <figcaption>{label}</figcaption>
      {image ? (
        <div className="crop-image">
          {/* Canvas renders the sampled pixels; its image role supplies an accessible name. */}
          {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
          <canvas ref={ref} width={192} height={112} role="img" aria-label={`${label} pixels`} />
          <span className="crop-crosshair" aria-hidden="true" />
        </div>
      ) : (
        <p className="crop-empty">{empty}</p>
      )}
    </figure>
  );
}

function CaptureSummary({
  images: { baseline, current, diff },
  frame,
  framing,
}: {
  images: Images;
  frame: Images["frame"];
  framing: string;
}) {
  return (
    <>
      <div className="comparison-caption">
        <span>
          {baseline
            ? "Drag the handle to compare. Drag the image to inspect."
            : "Click or drag the image to inspect the current capture."}
        </span>
        <span>
          {framing === "content" ? "Content frame" : "Full capture"} · {frame.width} ×{" "}
          {frame.height} px
        </span>
      </div>
      <div className="capture-links">
        {baseline && (
          <a href={baseline.src} target="_blank" rel="noreferrer">
            Baseline · {baseline.naturalWidth} × {baseline.naturalHeight} ↗
          </a>
        )}
        <a href={current.src} target="_blank" rel="noreferrer">
          Current · {current.naturalWidth} × {current.naturalHeight} ↗
        </a>
        {diff && (
          <a href={diff.src} target="_blank" rel="noreferrer">
            Difference ↗
          </a>
        )}
      </div>
      {diff && (
        <p className="comparison-caption">
          Highlight = changed pixels · grayscale = unchanged context. A size change flags the entire
          frame.
        </p>
      )}
    </>
  );
}

function Viewer({ images, pixels }: { images: Images; pixels: RenderedCell["pixels"] }) {
  const id = useId();
  const { current, baseline, diff } = images;
  const width = Math.max(current.naturalWidth, baseline ? baseline.naturalWidth : 0);
  const height = Math.max(current.naturalHeight, baseline ? baseline.naturalHeight : 0);
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState("fit");
  const [difference, setDifference] = useState(false);
  const [framing, setFraming] = useState(
    pixels.kind === "changed" && pixels.delta.resized ? "full" : "content",
  );
  const frame = framing === "content" ? images.frame : { x: 0, y: 0, width, height };
  const [point, setPoint] = useState<Point>({
    x: Math.floor(images.frame.x + images.frame.width / 2),
    y: Math.floor(images.frame.y + images.frame.height / 2),
  });
  return (
    <div className="comparison-workbench">
      <div className="comparison-viewer">
        <div className="comparison-toolbar">
          <fieldset className="view-modes" aria-label="Comparison view">
            <Button
              variant="ghost"
              aria-pressed={!difference}
              onClick={() => {
                setDifference(false);
              }}
            >
              {baseline ? "Before / after" : "Current capture"}
            </Button>
            <Button
              variant="ghost"
              aria-pressed={difference}
              disabled={!diff}
              onClick={() => {
                setDifference(true);
              }}
            >
              Difference
            </Button>
          </fieldset>
          <label>
            Frame
            <select
              aria-label="Image framing"
              value={framing}
              onChange={(event) => {
                setFraming(event.target.value);
              }}
            >
              <option value="content">Content</option>
              <option value="full">Full capture</option>
            </select>
          </label>
          <label>
            Image zoom
            <select
              value={zoom}
              onChange={(event) => {
                setZoom(event.target.value);
              }}
            >
              <option value="fit">Fit</option>
              <option value="1">100%</option>
              <option value="2">200%</option>
              <option value="4">400%</option>
            </select>
          </label>
        </div>
        <CapturePlane
          images={images}
          frame={frame}
          view={{ zoom, difference, split, point }}
          onPoint={(next) => {
            setPoint({ x: clamp(next.x, width), y: clamp(next.y, height) });
          }}
          onSplit={setSplit}
          baselineLabel={pixels.kind === "stale-baseline" ? "Unverified baseline" : "Baseline"}
        />
        <CaptureSummary images={images} frame={frame} framing={framing} />
      </div>
      <aside className="pixel-inspector" aria-label="Pixel inspector">
        <div className="inspector-heading">
          <h3>Pixel inspector</h3>
          <span>4× · no smoothing</span>
        </div>
        <p>
          Same point. Same 48 × 28 px region. Drag either number left or right, or click to type.
        </p>
        <div className="inspection-inputs">
          <label htmlFor={`${id}-x`}>
            X
            <CoordinateInput
              id={`${id}-x`}
              label="Inspect X"
              value={point.x}
              max={width}
              onChange={(x) => {
                setPoint({ ...point, x });
              }}
            />
          </label>
          <label htmlFor={`${id}-y`}>
            Y
            <CoordinateInput
              id={`${id}-y`}
              label="Inspect Y"
              value={point.y}
              max={height}
              onChange={(y) => {
                setPoint({ ...point, y });
              }}
            />
          </label>
        </div>
        <output aria-label="Inspection coordinates">
          x {point.x} · y {point.y}
        </output>
        <div className="pixel-crops">
          <Crop image={baseline} point={point} label="Baseline" empty="No approved baseline" />
          <Crop image={current} point={point} label="Current" empty="No current image" />
          <Crop
            image={diff}
            point={point}
            label="Difference"
            empty={pixels.kind === "match" ? "No changed pixels" : "No comparison evidence"}
          />
        </div>
      </aside>
    </div>
  );
}

/** Inspects immutable capture evidence on a shared source-pixel coordinate plane. */
export function Comparison({ run, cell }: { run: string; cell: RenderedCell }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const current = `/evidence/${run}/${cell.current.path}`;
  const baseline =
    cell.pixels.kind === "missing-baseline"
      ? null
      : `/evidence/${run}/${cell.pixels.baseline.path}`;
  const diff = cell.pixels.kind === "changed" ? `/evidence/${run}/${cell.pixels.diff.path}` : null;
  useEffect(() => {
    let active = true;
    void Promise.all([
      loadImage(current),
      baseline ? loadImage(baseline) : null,
      diff ? loadImage(diff) : null,
    ])
      .then(([currentImage, baselineImage, diffImage]) => {
        if (active)
          setLoad({
            kind: "ready",
            images: {
              current: currentImage,
              baseline: baselineImage,
              diff: diffImage,
              frame: framePixels([
                readPixels(currentImage),
                ...(baselineImage ? [readPixels(baselineImage)] : []),
              ]),
            },
          });
        return;
      })
      .catch(() => {
        if (active)
          setLoad({
            kind: "error",
            message:
              "Capture images could not be loaded. The visual comparison is unavailable. Reload the page or rerun verification.",
          });
      });
    return () => {
      active = false;
    };
  }, [current, baseline, diff]);
  if (load.kind === "error")
    return (
      <p role="alert" className="notice">
        {load.message}
      </p>
    );
  if (load.kind === "loading")
    return <output className="comparison-loading">Loading capture images…</output>;
  return <Viewer images={load.images} pixels={cell.pixels} />;
}
