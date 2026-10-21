import { Button } from "@yaklabs/ui/components/button";
import { Input } from "@yaklabs/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@yaklabs/ui/components/tabs";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Comparison } from "./Comparison.tsx";
import { StoryInventory, StorySource } from "./StoryNavigation.tsx";
import { APP_SHELL } from "./app-target.ts";
import { reviewStateSchema, verdict } from "./report.ts";
import type { Cell, RenderedCell, Report, ReviewState, StorybookState } from "./report.ts";

type ReviewLoad =
  | { kind: "loading" }
  | { kind: "ready"; state: ReviewState }
  | { kind: "offline" }
  | { kind: "error"; message: string };

const PROFILES = {
  Kay: {
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
    note: "Kay requires 4.5:1 for text and 3:1 for essential UI marks. Ratios below use declared token pairs, not every possible placement.",
  },
  Apple: {
    url: "https://developer.apple.com/design/human-interface-guidelines/accessibility",
    note: "Apple recommends checking light and dark appearances and supporting Increase Contrast. These checks use the conservative 4.5:1 text target. Native point sizes and VoiceOver need separate review.",
  },
  Microsoft: {
    url: "https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessible-text-requirements",
    note: "Microsoft recommends 4.5:1 for visible text by default. High-contrast mode is not a substitute for readable default colors. Windows contrast themes need separate review.",
  },
  Material: {
    url: "https://m3.material.io/foundations/designing/color-contrast",
    note: "Material recommends 4.5:1 for small text and 3:1 for large text and relevant graphics. Disabled states are exempt. This is a contrast lens, not a switch to Material's palette.",
  },
};

function cellStatus(cell: Cell) {
  return cell.kind === "rendered" ? cell.pixels.kind : cell.kind;
}
function title(id: string) {
  if (id === APP_SHELL.id) return `${APP_SHELL.title} / ${APP_SHELL.name}`;
  return id
    .replace(/^foundations-/u, "")
    .replaceAll("--", " / ")
    .replaceAll("-", " ");
}
function evidence(run: string, file: string) {
  return `/evidence/${run}/${file}`;
}

function CopyCommand({ command }: { command: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="command">
      <code>{command}</code>
      <Button
        variant="outline"
        onClick={() => {
          void (async () => {
            try {
              await navigator.clipboard.writeText(command);
              setMessage("Copied");
            } catch {
              setMessage("Select and copy the command");
            }
          })();
        }}
      >
        Copy
      </Button>
      <output>{message}</output>
    </div>
  );
}

function ImagePanel({
  run,
  file,
  label,
  empty = "No comparison evidence",
}: {
  run: string;
  file: string | null;
  label: string;
  empty?: string;
}) {
  return (
    <figure className="image-panel">
      <figcaption>{label}</figcaption>
      {file ? (
        <a
          href={evidence(run, file)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${label.toLowerCase()} at full resolution`}
        >
          <img src={evidence(run, file)} alt={`${label} component capture`} />
        </a>
      ) : (
        <div className="no-image">{empty}</div>
      )}
    </figure>
  );
}

function pixelMessage(pixels: RenderedCell["pixels"]) {
  switch (pixels.kind) {
    case "changed":
      return `${pixels.delta.changedPixels.toLocaleString()} changed pixels · ${((100 * pixels.delta.changedPixels) / pixels.delta.totalPixels).toFixed(3)}% of the image${pixels.delta.resized ? " · dimensions changed" : ""}`;
    case "match":
      return "No changed pixels. Compared against an explicitly approved reference in the same environment.";
    case "stale-baseline":
      return pixels.reason;
    case "missing-baseline":
      return "First capture. Nothing has been compared or approved. No comparison evidence yet.";
    default:
      return pixels satisfies never;
  }
}

function PixelDetail({
  cell,
  report,
  stale,
  index,
}: {
  cell: Cell;
  report: Report;
  stale: boolean;
  index: StorybookState;
}) {
  if (cell.kind !== "rendered")
    return (
      <section className="detail">
        <h2>{title(cell.story)}</h2>
        <p>{cell.kind === "not-run" ? cell.reason : cell.errors.join("\n")}</p>
      </section>
    );
  const pixels = cell.pixels;
  return (
    <section className="detail" aria-label="Selected comparison">
      <div className="detail-heading">
        <div>
          <p className="eyebrow">
            {cell.engine} · {cell.theme} · {cell.fingerprint.width} × {cell.fingerprint.height} @2×
          </p>
          <h2>{title(cell.story)}</h2>
        </div>
        <span className="status" data-status={pixels.kind}>
          {pixels.kind.replaceAll("-", " ")}
        </span>
      </div>
      <StorySource run={report.id} story={cell.story} index={index} />
      <p className="pixel-summary">{pixelMessage(pixels)}</p>
      <Comparison
        key={`${report.id}/${cell.key}/${cell.current.sha256}`}
        run={report.id}
        cell={cell}
      />
      <div className="evidence-line">
        <span>
          {cell.fingerprint.environment} · browser {cell.fingerprint.browser}
        </span>
        <a href={evidence(report.id, cell.aria)}>Read accessibility tree</a>
      </div>
      {!stale && cell.axe.violations.length === 0 && (
        <details>
          <summary>Review and approve this capture</summary>
          <p>
            Inspect the full-resolution images first. Approval changes the reference for this one
            capture; it does not fix the code.
          </p>
          <CopyCommand
            command={`pnpm verify-ui-drift approve --run ${report.id} --keys ${cell.key} --expect 1`}
          />
        </details>
      )}
    </section>
  );
}

function Pixels({
  report,
  stale,
  index,
}: {
  report: Report;
  stale: boolean;
  index: StorybookState;
}) {
  const [engine, setEngine] = useState("all");
  const [theme, setTheme] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect((): void | (() => void) => {
    const container = resultsRef.current;
    const table = container?.querySelector("table");
    if (!container || !table) return;
    const resize = () => {
      const tenthRow = table.tBodies[0]?.rows.item(9);
      container.style.maxHeight = tenthRow
        ? `${tenthRow.getBoundingClientRect().bottom - table.getBoundingClientRect().top + container.offsetHeight - container.clientHeight}px`
        : "none";
    };
    const observer = new ResizeObserver(resize);
    observer.observe(table);
    resize();
    return () => {
      observer.disconnect();
    };
  });
  const cells = report.cells.filter(
    (cell) =>
      (engine === "all" || cell.engine === engine) &&
      (theme === "all" || cell.theme === theme) &&
      cell.story.includes(query.toLowerCase().replaceAll(" ", "-")),
  );
  const chosen = cells.find((cell) => cell.key === selected) ?? cells[0];
  return (
    <>
      <StoryInventory report={report} index={index} />
      <div className="filters">
        <label>
          Engine
          <select
            value={engine}
            onChange={(event) => {
              setEngine(event.target.value);
            }}
          >
            <option value="all">All engines</option>
            {report.engines.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Appearance
          <select
            value={theme}
            onChange={(event) => {
              setTheme(event.target.value);
            }}
          >
            <option value="all">Both themes</option>
            {report.themes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="search" htmlFor="story-query">
          Find a story
          <Input
            id="story-query"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Button, text field…"
          />
        </label>
        <span className="count">{cells.length} captures</span>
      </div>
      <div className="results-scroll" ref={resultsRef}>
        <table>
          <thead>
            <tr>
              <th>Component / state</th>
              <th>Engine</th>
              <th>Theme</th>
              <th>Pixels</th>
              <th>Axe violations</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={cell.key} data-selected={chosen?.key === cell.key}>
                <td>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelected(cell.key);
                    }}
                    aria-pressed={chosen?.key === cell.key}
                  >
                    {title(cell.story)}
                  </Button>
                  <StorySource run={report.id} story={cell.story} index={index} />
                </td>
                <td>{cell.engine}</td>
                <td>{cell.theme}</td>
                <td>
                  <span className="status" data-status={cellStatus(cell)}>
                    {cellStatus(cell).replaceAll("-", " ")}
                  </span>
                </td>
                <td>{cell.kind === "rendered" ? cell.axe.violations.length : "Not run"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cells.length === 0 && (
          <p className="empty">
            No captures match. A self-test checks the comparator, not the component matrix.
          </p>
        )}
      </div>
      {chosen && <PixelDetail cell={chosen} report={report} stale={stale} index={index} />}
    </>
  );
}

function Tokens({ report }: { report: Report }) {
  const [format, setFormat] = useState<"hex" | "oklch">("hex");
  const [theme, setTheme] = useState("light");
  const [scope, setScope] = useState(":root");
  const [query, setQuery] = useState("");
  const samples = report.tokens.filter(
    (sample) => sample.theme === theme && sample.scope === scope && sample.name.includes(query),
  );
  return (
    <>
      <div className="section-intro">
        <h2>Same color. Different responsibilities.</h2>
        <p>
          A matching value is a candidate, not permission to reuse a role. Keep a separate semantic
          name when the purpose differs.
        </p>
      </div>
      <div className="filters">
        <fieldset aria-label="Color notation">
          <Button
            variant="outline"
            aria-pressed={format === "hex"}
            onClick={() => {
              setFormat("hex");
            }}
          >
            Hex
          </Button>
          <Button
            variant="outline"
            aria-pressed={format === "oklch"}
            onClick={() => {
              setFormat("oklch");
            }}
          >
            OKLCH
          </Button>
        </fieldset>
        <label>
          Appearance
          <select
            value={theme}
            onChange={(event) => {
              setTheme(event.target.value);
            }}
          >
            {report.themes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Context
          <select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value);
            }}
          >
            {[":root", ".attention-surface", ".chrome-surface"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="search" htmlFor="token-query">
          Find a token
          <Input
            id="token-query"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="--ink"
          />
        </label>
      </div>
      <p className="quiet">
        Read-only conversion. Swatches keep the measured CSS color. Changing notation does not
        change the source, gamut, or contrast.
      </p>
      <div className="token-grid">
        {samples.map((sample) => (
          <article className="token" key={sample.name}>
            <span
              className="swatch"
              style={{ backgroundColor: sample.computed }}
              aria-hidden="true"
            />
            <div>
              <h3>
                <code>{sample.name}</code>
              </h3>
              <code className="color-value">{sample.color[format]}</code>
              {!sample.color.inSrgb && (
                <p>Outside sRGB. Hex is gamut-mapped · ΔE {sample.color.roundTripDelta}</p>
              )}
            </div>
          </article>
        ))}
      </div>
      <h2 className="subheading">Raw color candidates · {report.inventory.literals.length}</h2>
      {report.inventory.literals.length === 0 ? (
        <p>
          No raw colors found in the supported CSS and JSX syntax. This does not cover canvas
          drawing or computed JavaScript strings.
        </p>
      ) : (
        report.inventory.literals.map((literal, i) => (
          <article className="finding" key={`${literal.file}-${literal.line}-${i}`}>
            <code>
              {literal.file}:{literal.line}
            </code>
            <p>
              <code>
                {literal.property}: {literal.text}
              </code>
            </p>
            <p>
              {literal.candidates.length > 0
                ? `Same value in ${literal.candidates.map((candidate) => candidate.name).join(", ")}. Check the role and context before replacing.`
                : "No literal-valued token matches. Name a new semantic role if this is a design color; mask and compositing constants may be intentional."}
            </p>
          </article>
        ))
      )}
      <details>
        <summary>
          {report.inventory.customProperties.length} authored declarations, including unresolved
          expressions
        </summary>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Authored value</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {report.inventory.customProperties.map((token, i) => (
              <tr key={`${token.file}-${token.line}-${i}`}>
                <td>
                  <code>{token.name}</code>
                </td>
                <td>
                  <code>{token.value}</code>
                </td>
                <td>{token.context.join(" → ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function Accessibility({ report }: { report: Report }) {
  const [profile, setProfile] = useState<keyof typeof PROFILES>("Kay");
  const violations = report.cells.flatMap((cell) =>
    cell.kind === "rendered"
      ? cell.axe.violations.map((finding) => ({ ...finding, key: cell.key }))
      : [],
  );
  const incomplete = report.cells.flatMap((cell) =>
    cell.kind === "rendered"
      ? cell.axe.incomplete.map((finding) => ({ ...finding, key: cell.key }))
      : [],
  );
  return (
    <>
      <div className="section-intro">
        <h2>Contrast in context</h2>
        <p>
          Platform recommendations are review lenses. They do not rewrite Kay’s theme or certify
          platform compliance.
        </p>
      </div>
      <fieldset className="filters" aria-label="Recommendation profile">
        {(["Kay", "Apple", "Microsoft", "Material"] as const).map((item) => (
          <Button
            key={item}
            variant="outline"
            aria-pressed={profile === item}
            onClick={() => {
              setProfile(item);
            }}
          >
            {item}
          </Button>
        ))}
      </fieldset>
      <p className="profile-note">
        {PROFILES[profile].note}{" "}
        <a href={PROFILES[profile].url} target="_blank" rel="noreferrer">
          Read the recommendation ↗
        </a>
      </p>
      <table>
        <thead>
          <tr>
            <th>Foreground / background</th>
            <th>Appearance</th>
            <th>Measured ratio</th>
            <th>Kay minimum</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {report.contrasts.map((pair) => (
            <tr key={`${pair.foreground}-${pair.background}-${pair.theme}`}>
              <td>
                <code>{pair.foreground}</code> on <code>{pair.background}</code>
              </td>
              <td>{pair.theme}</td>
              <td>
                {pair.measurement.kind === "ratio"
                  ? `${pair.measurement.ratio.toFixed(2)}:1`
                  : "Inconclusive"}
              </td>
              <td>{pair.minimum}:1</td>
              <td>
                {pair.measurement.kind === "ratio"
                  ? pair.measurement.ratio >= pair.minimum
                    ? "Meets minimum"
                    : "Below minimum"
                  : pair.measurement.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="subheading">Axe results</h2>
      <p>
        {violations.length} violations · {incomplete.length} findings need human review. Automated
        results do not replace keyboard and screen-reader checks.
      </p>
      {[...violations, ...incomplete].map((finding, i) => (
        <article className="finding" key={`${finding.key}-${finding.id}-${i}`}>
          <code>{finding.key}</code>
          <h3>{finding.help}</h3>
          <p>
            {finding.id} · {finding.impact} · {finding.nodes} elements
          </p>
        </article>
      ))}
      <aside className="profile-note">
        <h3>Rams is a separate review checkpoint</h3>
        <p>
          Use the connected Rams MCP for targeted source review after a UI change. It sends selected
          source to a hosted service. Its suggestions are advisory, not an axe pass or a pixel
          comparison.
        </p>
      </aside>
    </>
  );
}

function Proof({ report }: { report: Report }) {
  return (
    <>
      <div className="section-intro">
        <h2>Test the test.</h2>
        <p>
          A passing comparison earns trust only if a deliberate mistake makes it fail. These probes
          alter the real Button story in an isolated page.
        </p>
        <p>
          Red highlights the deliberately changed pixels; grayscale is unchanged context. The Pixels
          workbench uses green for component differences. Saved reports retain their original
          overlay colors.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Engine</th>
            <th>Unchanged recapture</th>
            <th>Color mutation</th>
            <th>Geometry mutation</th>
          </tr>
        </thead>
        <tbody>
          {report.probes.map((probe) => (
            <tr key={probe.engine}>
              <td>{probe.engine}</td>
              <td>{probe.control.changedPixels.toLocaleString()} changed pixels</td>
              <td>{probe.color.changedPixels.toLocaleString()} changed pixels</td>
              <td>{probe.geometry.changedPixels.toLocaleString()} changed pixels</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.probes.map((probe) => (
        <section className="detail" key={probe.engine}>
          <h3>{probe.engine}</h3>
          <div className="image-grid">
            <ImagePanel
              run={report.id}
              file={`${probe.engine}.control.png`}
              label="Unchanged control"
            />
            <ImagePanel
              run={report.id}
              file={`${probe.engine}.color-diff.png`}
              label="Color mutation difference"
            />
            <ImagePanel
              run={report.id}
              file={`${probe.engine}.geometry-diff.png`}
              label="Geometry mutation difference"
            />
          </div>
        </section>
      ))}
      <CopyCommand command="pnpm verify-ui-drift selftest" />
    </>
  );
}

/** Presents captured evidence without executing checks or approving references. */
export function ReportView({
  state,
  disconnected,
  run,
  onRun,
}: {
  state: ReviewState;
  disconnected: boolean;
  run: string;
  onRun: (run: string) => void;
}) {
  const report = state.report;
  if (report === null)
    return (
      <section className="detail">
        <h2>No run yet.</h2>
        <p>
          Run the matrix in the repository terminal, then return here. A missing report is not a
          passing check.
        </p>
        <CopyCommand command="pnpm verify-ui-drift run" />
      </section>
    );
  const stale = state.stale || disconnected;
  const measured = report.cells.filter(
    (cell) => cell.kind === "rendered" && ["match", "changed"].includes(cell.pixels.kind),
  ).length;
  return (
    <>
      <div className="run-bar">
        <label>
          Evidence run
          <select
            value={run}
            onChange={(event) => {
              onRun(event.target.value);
            }}
          >
            <option value="">Latest run</option>
            {state.runs.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <code>source {report.source.slice(0, 12)}</code>
        <span>{new Date(report.createdAt).toLocaleString()}</span>
      </div>
      {stale && (
        <output className="notice">
          Stale evidence. The source or connection changed. These results describe an earlier
          capture; run verification again before approving.
        </output>
      )}
      {report.errors.map((message) => (
        <p className="notice" key={message}>
          {message}
        </p>
      ))}
      <section className="metrics" aria-label="Run coverage">
        <div>
          <span>{report.mode === "selftest" ? "Comparator self-test" : "Selected matrix"}</span>
          <strong>{stale ? "Stale" : verdict(report)}</strong>
        </div>
        <div>
          <span>Screenshots compared</span>
          <strong>
            {measured}
            <small> / {report.cells.length}</small>
          </strong>
        </div>
        <div>
          <span>Story coverage</span>
          <strong>
            {report.selectedStories.filter((story) => story !== APP_SHELL.id).length}
            <small> / {report.indexedStories}</small>
          </strong>
          {report.selectedStories.includes(APP_SHELL.id) && <span>+ app shell composition</span>}
        </div>
        <div>
          <span>Rendering targets</span>
          <strong>
            {report.engines.length}
            <small> browsers</small>
          </strong>
        </div>
      </section>
      <Tabs defaultValue={report.mode === "selftest" ? "proof" : "pixels"}>
        <TabsList variant="line" aria-label="Evidence type">
          <TabsTrigger value="pixels">Pixels</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="accessibility">Accessibility</TabsTrigger>
          <TabsTrigger value="proof">Comparator proof</TabsTrigger>
        </TabsList>
        <TabsContent value="pixels">
          <Pixels report={report} stale={stale} index={state.storybook} />
        </TabsContent>
        <TabsContent value="tokens">
          <Tokens report={report} />
        </TabsContent>
        <TabsContent value="accessibility">
          <Accessibility report={report} />
        </TabsContent>
        <TabsContent value="proof">
          <Proof report={report} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Read-only review of the exact reports produced by the local CLI and CI. */
export function App() {
  const [review, setReview] = useState<ReviewLoad>({ kind: "loading" });
  const [run, setRun] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      let next: ReviewLoad;
      try {
        const response = await fetch(`/api/state?refresh=${refresh}${run ? `&run=${run}` : ""}`, {
          signal: controller.signal,
        }).catch(() => null);
        if (response === null) next = { kind: "offline" };
        else if (response.ok)
          next = { kind: "ready", state: reviewStateSchema.parse(await response.json()) };
        else
          next = {
            kind: "error",
            message: `The server answered with HTTP ${response.status}. Check the verify terminal for the report error, then try again.`,
          };
      } catch {
        next = {
          kind: "error",
          message:
            "The server answered, but its response is not a valid verification report. Check the verify terminal, then try again.",
        };
      }
      if (!controller.signal.aborted) setReview(next);
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [run, refresh]);
  return (
    <div className="verify-app">
      <header className="topbar">
        <span className="wordmark">
          Yaklabs <span>/ Verify</span>
        </span>
        <span className="local-label">Local evidence · no uploads</span>
        <Button
          variant="outline"
          aria-pressed={dark}
          onClick={() => {
            setDark(!dark);
          }}
        >
          Dark appearance
        </Button>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Design engineering / verification</p>
            <h1>Yaklabs UI Verification Tool</h1>
            <p>Internal Use Only</p>
          </div>
          <div className="reload-report">
            <Button
              variant="outline"
              onClick={() => {
                setRefresh((value) => value + 1);
              }}
            >
              Reload saved report
            </Button>
            <span>Reads saved evidence. Does not take screenshots.</span>
          </div>
        </div>
        {(review.kind === "offline" || review.kind === "error") && (
          <section className="detail recovery" aria-labelledby="recovery-title">
            <div role="alert">
              <h2 id="recovery-title">
                {review.kind === "offline"
                  ? "Verify server not running"
                  : "Report could not be read"}
              </h2>
              <p>
                {review.kind === "offline"
                  ? "This page cannot reach the verify server. If it has stopped, run this command from the repository root."
                  : review.message}
              </p>
            </div>
            {review.kind === "offline" && <CopyCommand command="pnpm verify-ui-drift review" />}
            <p>Your saved evidence is unchanged. This page retries every ten seconds.</p>
            <Button
              variant="outline"
              onClick={() => {
                setRefresh((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </section>
        )}
        {review.kind === "loading" && <output>Reading local evidence…</output>}
        {review.kind === "ready" && (
          <ReportView state={review.state} disconnected={false} run={run} onRun={setRun} />
        )}
        <footer>
          <span>Code is the reference. Figma receives the tokens.</span>
          <code>pnpm verify-ui-drift run</code>
          <span>Approval is explicit. No automatic baseline updates.</span>
        </footer>
      </main>
    </div>
  );
}
