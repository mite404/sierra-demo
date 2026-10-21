import { useAuth } from "@workos-inc/authkit-react";
import type { ThreadSummary } from "@yaklabs/runtime";
import { env } from "../env";
import { BonsaiMark } from "../shell/rail-places";
import type { PaneKind } from "../shell/state";
import { DesignToolingSeal } from "./design-tooling-seal";
import { WelcomeArt } from "./splash";
import { SplashSwitch } from "./splash-switch";
import { ACTION, Actions, Projects } from "./welcome-sections";

const DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

// The part of the day the greeting names: the morning in the light theme, the evening in the
// dark one (Ethan), rather than the clock. Both are in the DOM; index.css shows the theme's.
type Part = "morning" | "evening";
const PARTS: readonly Part[] = ["morning", "evening"];

// "Good morning, Ethan", or "Good morning" for a build with no sign-in.
const greetingFor = (part: Part, name: string | null): string =>
  `Good ${part}${name === null ? "" : `, ${name}`}`;

const lineFor = (part: Part): string => `Spend your ${part} on the thing that matters.`;

function Greeting({ name }: { name: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-[0.08em] text-soft-ink uppercase">
        {DATE.format(new Date())}
      </p>
      {PARTS.map((part) => (
        <div key={part} data-part={part}>
          <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-ink">
            {greetingFor(part, name)}
          </h1>
          <p className="mt-1 text-soft-ink">{lineFor(part)}</p>
        </div>
      ))}
    </div>
  );
}

// Signed in with WorkOS (ADR-084): the greeting carries the first name.
function WorkOsGreeting() {
  const { user } = useAuth();
  return <Greeting name={user?.firstName ?? null} />;
}

function LocalGreeting() {
  return <Greeting name={null} />;
}

const GreetingLine = env.auth.kind === "workos" ? WorkOsGreeting : LocalGreeting;

/**
 * A new thread's welcome (ADR-136), after Kay's own new tab: the mark, the date, a greeting for
 * the theme's time of day, the projects, and the actions a thread can open with, with the seal
 * that leads to the design tooling page pinned above the greeting at the column's right, tilted
 * like a medal on a lapel (ADR-160). It shows in the main
 * pane while the thread has no turns, over the painting `<html data-splash>` names, and leaves
 * with the first turn. Open file and Open terminal are the desktop app's; here they wait.
 * @param pane The layout the thread is in. The switch for the painting shows only in the
 * Thread layout, where the welcome has the window to itself, and never beside the canvas or the
 * browser.
 */
export function Welcome({ thread, pane }: { thread: ThreadSummary; pane: PaneKind }) {
  return (
    <div className="welcome" data-slot="welcome">
      <WelcomeArt />
      <div className="welcome-words flex w-full max-w-sm flex-col gap-7">
        <DesignToolingSeal className="welcome-seal" />
        <div className="flex flex-col gap-4">
          <span className="grid size-10 place-items-center rounded-full bg-paper-deep text-ink">
            <BonsaiMark className="size-5" />
          </span>
          <GreetingLine />
        </div>
        <Projects />
        <Actions thread={thread} />
      </div>
      {/* The switch through the paintings, in every build, so a visitor can look through the
          design work (Ethan; amends ADR-156, which had kept it to development builds). */}
      {pane === "thread" && <SplashSwitch className={`${ACTION} absolute top-4 right-4 z-10`} />}
    </div>
  );
}
