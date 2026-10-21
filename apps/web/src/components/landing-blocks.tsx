import { Link } from "react-router";
import { HOW, MISSING, PAIRS, PICTURES, PROOF, STEPS } from "../verify-ui-tooling";
import { Seal } from "./design-tooling-seal";

// The bars' scale: the highest ratio a declared pair reaches, so every bar fits its track.
const BAR_TOP = 16;

// A ratio's place along a bar's track, as a percentage of its width.
const along = (ratio: number): string => `${((ratio / BAR_TOP) * 100).toFixed(1)}%`;

/** Ethan's question over the evidence: how does a team verify a working component? */
export function Question() {
  return (
    <section id="claim" className="land-claim" aria-labelledby="claim-heading">
      <p className="land-kicker">01</p>
      <div>
        <h2 id="claim-heading">How does a team verify a working component?</h2>
      </div>
    </section>
  );
}

// The biggest cell: the whole Pixels workbench, scaled to the cell, with its name and its count
// in a row beneath.
function PixelsCell() {
  return (
    <div className="land-cell land-cell-pixels" id="pixels">
      <img
        src={`${PICTURES}/pixels-workbench.webp`}
        width={2000}
        height={1551}
        alt="The Pixels workbench: a results list with Button / Default marked changed, a before and after wipe over the button's four states, and a pixel inspector showing the baseline's square corner beside the current rounder one."
        loading="lazy"
        decoding="async"
      />
      <div className="land-cell-words">
        <h3>Pixels</h3>
        <span className="land-chip">3,776 changed pixels · 0.154%</span>
      </div>
    </div>
  );
}

// The numeral cell: what CI may approve, and the rows a machine with no references shows.
function ZeroCell() {
  return (
    <div className="land-cell land-cell-zero">
      <p className="land-numeral">0</p>
      <h3>references CI can approve</h3>
      <ul className="land-rows">
        {MISSING.slice(0, 3).map((row) => (
          <li key={`${row.story} ${row.engine} ${row.theme}`}>
            <span>{row.story}</span>
            <span>
              {row.engine} · {row.theme}
            </span>
            <span className="land-tag">missing baseline</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The proof cell: the comparator's counts for each engine.
function ProofCell() {
  return (
    <div className="land-cell land-cell-proof">
      <h3>Comparator proof</h3>
      <table>
        <thead>
          <tr>
            <th>engine</th>
            <th>control</th>
            <th>colour</th>
            <th>geometry</th>
          </tr>
        </thead>
        <tbody>
          {PROOF.map((row) => (
            <tr key={row.engine}>
              <td>{row.engine}</td>
              <td>
                <b>{row.control}</b>
              </td>
              <td>{row.color.toLocaleString("en-US")}</td>
              <td>{row.geometry.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The ink cell: the one command that makes a reference.
function ApproveCell() {
  return (
    <div className="land-cell land-cell-ink">
      <h3>Approve</h3>
      <pre>
        {
          "pnpm verify-ui-drift approve \\\n  --run RUN_ID \\\n  --keys foundations-button--default.chromium.light \\\n  --expect 1"
        }
      </pre>
    </div>
  );
}

// The contrast cell: four measured pairs as flat bars, each with its minimum marked.
function ContrastCell() {
  return (
    <div className="land-cell land-cell-contrast">
      <h3>Accessibility</h3>
      <ul className="land-bars">
        {PAIRS.map((row) => (
          <li key={row.pair}>
            <div className="land-bar">
              <span>{row.pair}</span>
              <b>{row.ratio.toFixed(2)}:1</b>
            </div>
            <div className="land-bar-track">
              <div className="land-bar-fill" style={{ width: along(row.ratio) }} />
              <div className="land-bar-min" style={{ left: along(row.minimum) }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The steps cell: the five beats of a run, by name.
function StepsCell() {
  return (
    <div className="land-cell land-cell-steps">
      <h3>Run</h3>
      <ol className="land-steps">
        {STEPS.map((step) => (
          <li key={step}>
            <span>
              <b>{step}</b>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** How the tool works, in four large numbered points beside the Pixels picture. */
function How() {
  return (
    <div className="land-how">
      <p className="land-kicker">How it works</p>
      <ol>
        {HOW.map((step) => (
          <li key={step.lead}>
            <span>
              <strong>{step.lead}</strong>
              {step.rest}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The bento: the picture with how the tool works beside it, then five cells of what a run gives. */
export function Bento() {
  return (
    <section className="land-bento" aria-label="How the tool works and what a run gives">
      <PixelsCell />
      <How />
      <ZeroCell />
      <ProofCell />
      <ApproveCell />
      <ContrastCell />
      <StepsCell />
    </section>
  );
}

/** The band: Ethan's second headline on the window chrome's green, the contrast table beside it. */
export function Band() {
  return (
    <section className="land-band land-bleed" aria-labelledby="band-heading">
      <div className="land-band-inner">
        <div>
          <p className="land-kicker">02</p>
          <h2 id="band-heading">Build compounding leverage.</h2>
          <p>
            In the era of building with agents, one person doesn’t just ship one person’s work, they
            build the systems that build the product.
          </p>
        </div>
        <figure className="land-shots">
          <img
            src={`${PICTURES}/contrast-kay.webp`}
            width={2000}
            height={979}
            alt="Contrast in context under the Kay lens: sixteen token pairs with their measured ratio, Kay's minimum and the result, in light and dark appearance, every row meeting its minimum."
            loading="lazy"
            decoding="async"
          />
          <img
            className="land-shot-front"
            src={`${PICTURES}/review-header.webp`}
            width={2000}
            height={543}
            alt="The review app's header: Yaklabs UI Verification Tool, the latest run's source and time, and its summary row: selected matrix Incomplete, 0 of 30 screenshots compared, 5 of 85 stories covered, 3 browsers."
            loading="lazy"
            decoding="async"
          />
        </figure>
      </div>
    </section>
  );
}

/** The seal and the way back, closing the page. */
export function Closing() {
  return (
    <section className="land-close" aria-label="Back to Bonsai">
      <Seal size={168} />
      <div className="land-cta">
        <Link to="/" className="btn">
          Back to Bonsai
        </Link>
      </div>
    </section>
  );
}
