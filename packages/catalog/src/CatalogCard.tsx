import { useId, useState, type ReactNode } from "react";
import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { CardHeader } from "./CardHeader";
import { resolve, type DataProps, type Selection } from "./catalog";
import { ShareButton } from "./ShareButton";

/** Bars are flat data colour with the button's 4px top corners; no gradient (ADR-055). */
export const BAR_RADIUS = 4;

// The table scrolls inside a capped height, so its wrapper is a named region that takes focus:
// otherwise rows below the fold are out of reach without a mouse (axe scrollable-region-focusable).
function DataTable({ props }: { props: DataProps }) {
  const caption = useId();
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll region must take focus to scroll by keyboard (WCAG 2.1.1)
    <section className="table-wrap" aria-labelledby={caption} tabIndex={0}>
      <table>
        <caption id={caption}>
          {props.title} · {props.unit}
        </caption>
        <thead>
          <tr>
            <th scope="col">Observation</th>
            <th scope="col">Value ({props.unit})</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index}>
              <th scope="row">{row.label}</th>
              <td>{row.value === null ? "Not recorded" : String(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Chart({ selection }: { selection: Selection }) {
  const props = selection.props;
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--hairline)" />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        tick={{ fill: "var(--soft-ink)", fontSize: 12 }}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={48}
        tick={{ fill: "var(--soft-ink)", fontSize: 12 }}
      />
      <Tooltip />
    </>
  );
  return (
    <div
      className="chart"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a live Recharts SVG cannot be an <img>; role="img" names the drawing
      role="img"
      aria-label={`${props.title}. Values available in the data table.`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {selection.component === "LineChart" ? (
          <RechartsLineChart
            data={props.rows}
            margin={{ top: 20, right: 24, bottom: 10, left: 0 }}
            accessibilityLayer
          >
            {axes}
            <Line
              dataKey="value"
              name={props.unit}
              type="linear"
              stroke="var(--data)"
              strokeWidth={props.variant === "snapshot" ? 0 : 3}
              dot={{ r: 4, fill: "var(--data)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </RechartsLineChart>
        ) : (
          <RechartsBarChart
            data={props.rows}
            margin={{ top: 20, right: 24, bottom: 10, left: 0 }}
            accessibilityLayer
          >
            {axes}
            <Bar
              dataKey="value"
              name={props.unit}
              fill="var(--data)"
              radius={[BAR_RADIUS, BAR_RADIUS, 0, 0]}
              isAnimationActive={false}
            />
          </RechartsBarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// The host's controls on a card with no header: the collapse at its top left, the close at its
// top right.
function HostEnds({ leading, trailing }: { leading: ReactNode; trailing: ReactNode }) {
  return (
    <>
      {leading !== undefined && <div className="header-leading">{leading}</div>}
      {trailing !== undefined && <div className="header-trailing">{trailing}</div>}
    </>
  );
}

/**
 * The only entry point for agent-selected UI. All content passes the catalog boundary.
 * @param context Host-owned placement, never part of the agent payload: "page" for the
 * evaluation workbench, "thread" for a card inside a chat thread (ADR-023).
 * @param shareable Show the share button (ADR-064); off on the public page itself.
 * @param draggable Let the header carry the card out, as onto the compose canvas (ADR-089).
 * @param leading A host's control before the title, such as a lane's collapse (ADR-134); a
 * card with no header shows it at its top.
 * @param trailing A host's control at the title bar's far end, after the share button, such as
 * a lane's close; a card with no header shows it at its top right.
 */
export function CatalogCard({
  payload,
  context = "page",
  shareable = true,
  draggable = false,
  leading,
  trailing,
}: {
  payload: unknown;
  context?: "page" | "thread";
  shareable?: boolean;
  draggable?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const result = resolve(payload);
  const [showTable, setShowTable] = useState(false);
  if (result.kind === "rejected")
    return (
      <section className="card state" data-context={context}>
        <HostEnds leading={leading} trailing={trailing} />
        <span className="state-symbol">↗</span>
        <p className="eyebrow">CATALOG LIMIT</p>
        <h2>We don’t have a safe view for this yet.</h2>
        <p>{result.reason}</p>
        <p className="page-only">
          Try an approved view, or capture the missing capability below. We won’t substitute an
          unrelated chart.
        </p>
      </section>
    );
  if (result.kind === "empty")
    return (
      <section className="card state" data-context={context}>
        <HostEnds leading={leading} trailing={trailing} />
        <span className="state-symbol">∅</span>
        <p className="eyebrow">NO DATA</p>
        <h2>{result.title}</h2>
        <p>No observations were supplied. This is not a value of zero.</p>
      </section>
    );
  const { selection } = result;
  const { props } = selection;
  return (
    <section className="card" data-context={context}>
      <CardHeader
        eyebrow={`${selection.component} / ${props.variant}`}
        title={props.title}
        leading={leading}
        drag={
          draggable ? { card: { v: 1, kind: "catalog", payload }, title: props.title } : undefined
        }
        actions={
          <>
            <span className="badge">Validated</span>
            {shareable && <ShareButton card={{ v: 1, kind: "catalog", payload }} />}
            {trailing}
          </>
        }
      />
      {result.kind === "fallback" && (
        <p className="notice">
          <output>{result.reason}</output>
        </p>
      )}
      <div className="measure">
        <span className="legend-dot" /> {props.unit} <span className="muted">· supplied order</span>
      </div>
      {selection.component === "DataTable" || showTable ? (
        <DataTable props={props} />
      ) : (
        <Chart selection={selection} />
      )}
      {props.rows.some((row) => row.value === null) && (
        <p className="notice">
          Missing observations remain gaps. No interpolation or zero-filling.
        </p>
      )}
      <footer>
        <span>
          {props.source}
          <br />
          <span className="muted">
            Source label supplied with data · not independently verified
          </span>
        </span>
        {selection.component !== "DataTable" && (
          <button
            className="btn btn-sm card-toggle"
            onClick={() => {
              setShowTable(!showTable);
            }}
          >
            {showTable ? "Show chart" : "View data table"}
          </button>
        )}
      </footer>
    </section>
  );
}
