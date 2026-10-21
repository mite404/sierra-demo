import type { ReactNode } from "react";
import {
  REGISTERED_PAGES,
  START_PAGE,
  type Page,
  type PageAddress,
  type PageKind,
} from "./browser";

/** What a page's links do: open another address in the same pane. */
export type Go = (to: PageAddress) => void;

// A link inside a simulated page; it never leaves the pane.
function PageLink({ to, go, children }: { to: PageAddress; go: Go; children: ReactNode }) {
  return (
    <a
      href={to}
      className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
      onClick={(event) => {
        event.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}

function StartPage({ go }: { go: Go }) {
  return (
    <article className="flex flex-col gap-4">
      <h1 className="font-serif text-3xl text-ink">Start</h1>
      <p className="text-soft-ink">
        A simulated browser: every page here is drawn by the app, and nothing reaches the network.
      </p>
      <ul className="flex flex-col gap-2">
        {REGISTERED_PAGES.filter((page) => page.address !== START_PAGE).map((page) => (
          <li key={page.address} className="flex items-baseline gap-3">
            <PageLink to={page.address} go={go}>
              {page.title}
            </PageLink>
            <span className="text-xs text-soft-ink">{page.address}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

// Rain as the radar draws it: fixed cells, so every visit looks the same.
const CELLS = [
  { cx: 132, cy: 86, r: 34, strength: 0.28 },
  { cx: 150, cy: 96, r: 18, strength: 0.55 },
  { cx: 92, cy: 150, r: 24, strength: 0.2 },
  { cx: 176, cy: 160, r: 12, strength: 0.45 },
];

const FORECAST = [
  { time: "15:00", rain: "Heavy", wind: "31 km/h" },
  { time: "16:00", rain: "Moderate", wind: "24 km/h" },
  { time: "17:00", rain: "Light", wind: "18 km/h" },
];

function RadarPage() {
  return (
    <article className="flex flex-col gap-4">
      <h1 className="font-serif text-3xl text-ink">Radar</h1>
      <figure className="flex max-w-72 flex-col gap-2">
        <svg viewBox="0 0 240 240" aria-hidden="true" className="w-full text-ink">
          <rect width="240" height="240" rx="8" fill="var(--paper-deep)" />
          {[40, 80, 110].map((r) => (
            <circle key={r} cx="120" cy="120" r={r} fill="none" stroke="var(--hairline)" />
          ))}
          <path d="M120 10v220M10 120h220" stroke="var(--hairline)" />
          {CELLS.map((cell) => (
            <circle
              key={`${cell.cx}-${cell.cy}`}
              cx={cell.cx}
              cy={cell.cy}
              r={cell.r}
              fill="var(--olive)"
              opacity={cell.strength}
            />
          ))}
          <path d="M120 120L203 57" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="120" cy="120" r="3" fill="currentColor" />
        </svg>
        <figcaption className="text-sm text-soft-ink">
          A storm cell north-east of the harbour, moving east.
        </figcaption>
      </figure>
      <table className="max-w-72 text-xs *:*:*:text-left">
        <thead>
          <tr>
            <th>Time</th>
            <th>Rain</th>
            <th>Wind</th>
          </tr>
        </thead>
        <tbody className="text-ink">
          {FORECAST.map((row) => (
            <tr key={row.time}>
              <td>{row.time}</td>
              <td>{row.rain}</td>
              <td>{row.wind}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function DocsPage() {
  return (
    <article className="flex max-w-prose flex-col gap-4">
      <h1 className="font-serif text-3xl text-ink">Kay docs</h1>
      <p className="text-ink">
        A project holds main threads. Each main thread has a canvas beside it, and a thread started
        there is its child, listed under it in the sidebar.
      </p>
      <h2 className="font-serif text-xl text-ink">Carrying something to the canvas</h2>
      <p className="text-ink">
        Pick up a highlight or a card by its header and let go between two lanes. A highlight starts
        a thread with the quote waiting in its compose box; a card opens large.
      </p>
    </article>
  );
}

function SimulatedPage({ page, go }: { page: Page; go: Go }) {
  return (
    <article className="flex flex-col gap-4">
      <h1 className="font-serif text-3xl text-ink">This page is simulated</h1>
      <p className="text-soft-ink">
        Nothing here reaches the network, so{" "}
        <span className="text-ink wrap-anywhere">{page.address}</span> has no page of its own.
      </p>
      <p>
        <PageLink to={START_PAGE} go={go}>
          Back to the start page
        </PageLink>
      </p>
    </article>
  );
}

// Every kind of page and how it draws; a new kind in the registry fails to compile here.
const PAGE_VIEWS = {
  start: ({ go }) => <StartPage go={go} />,
  radar: () => <RadarPage />,
  docs: () => <DocsPage />,
  simulated: ({ page, go }) => <SimulatedPage page={page} go={go} />,
} satisfies Record<PageKind, (props: { page: Page; go: Go }) => ReactNode>;

/** A page's body, drawn by its kind. */
export function PageBody({ page, go }: { page: Page; go: Go }) {
  const View = PAGE_VIEWS[page.kind];
  return <View page={page} go={go} />;
}
