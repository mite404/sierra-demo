import { useEffect, useRef } from "react";
import { Navigate } from "react-router";
import type { ProjectId } from "@yaklabs/runtime";
import { QuietButton } from "../components/quiet-button";
import { focusThreadIn } from "../components/thread-pane";
import { usePaths } from "../runtime";
import { homeTarget, type HomeTarget } from "../shell/home";
import { useHubAsked } from "../shell/home-hub";
import { useShell, type Shell } from "../shell/model";
import { Notice, RuntimePending } from "../shell/pending";

export function meta() {
  return [{ title: "Kay" }];
}

// Start a thread leaves with this page, which would drop the focus to the page; once the thread
// it starts is on screen, the focus goes into it instead, unless something else took it
// meanwhile. Returns what arms that hand-off.
function useHandOn(): () => void {
  const armed = useRef(false);
  useEffect(
    () => () => {
      const shown = document.querySelector('[role="tabpanel"]:not([inert])');
      if (armed.current && document.activeElement === document.body && shown !== null) {
        focusThreadIn(shown);
      }
    },
    [],
  );
  return () => {
    armed.current = true;
  };
}

// Starts Home's blank thread in the Live Playground once, and goes to it; the ref keeps a
// second run of the effect (Strict Mode, a state push) from starting another.
function StartHome({ shell, project }: { shell: Shell; project: ProjectId }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    shell.newThread(project);
  }, [shell, project]);
  return null;
}

function NothingOpen({ shell }: { shell: Shell }) {
  const handOn = useHandOn();
  return (
    <Notice title="Nothing open">
      <p className="text-sm text-soft-ink">Open a thread from the sidebar, or start one.</p>
      <QuietButton
        onClick={() => {
          handOn();
          shell.newThread();
        }}
      >
        Start a thread
      </QuietButton>
    </Notice>
  );
}

// The page "/" leads to: the thread it goes to, a live thread starting, or "Nothing open".
function Destination({ shell, target }: { shell: Shell; target: HomeTarget }) {
  const { pathTo } = usePaths();
  if (target.kind === "go") return <Navigate replace to={pathTo(target.to)} />;
  if (target.kind === "start") return <StartHome shell={shell} project={target.in} />;
  return <NothingOpen shell={shell} />;
}

/**
 * Home: the tab last on screen, else a first visit's page, the Live Playground's blank thread
 * with its welcome, whose composer goes to the live model. The rail's Home asks for that page
 * whatever is open. Only a source with no Live Playground and nothing open shows "Nothing open".
 */
export default function Home() {
  const shell = useShell();
  const asked = useHubAsked();
  if (shell === null) return <RuntimePending />;
  const target = homeTarget(shell.workspace, shell.resumeTo, asked); // → HomeTarget
  return <Destination shell={shell} target={target} />;
}
