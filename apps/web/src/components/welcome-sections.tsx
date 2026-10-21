import type { Project, ThreadId, ThreadSummary } from "@yaklabs/runtime";
import { sidebarTree } from "@yaklabs/runtime";
import { Button } from "@yaklabs/ui/components/button";
import { FileText, Folder, Globe, Plus, Terminal } from "lucide-react";
import { Link } from "react-router";
import { usePaths } from "../runtime";
import { useShell } from "../shell/model";
import { entryOf } from "../shell/state";

const NOT_HERE = "Not in the web build yet";

/**
 * Kay's own corners for the greeting's actions, the app's 8px and not the site's 4px button:
 * one step up from --radius, so it follows the token.
 */
export const ACTION = "h-8 rounded-xl px-3";

// A welcome section's heading: small, spaced capitals in soft ink.
const LABEL = "text-[11px] font-medium tracking-[0.1em] text-soft-ink uppercase";

// A project row's box; the padding sits outside the column's edge, so the name lines up with
// the heading above it while the hover fill reaches past it, as a sidebar row's does.
const ROW = "-mx-2 flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm text-ink";

// One project, a link to the main it opens on; a project with no main yet has nowhere to go.
function ProjectRow({ project, entry }: { project: Project; entry: ThreadId | undefined }) {
  const { pathTo } = usePaths();
  const words = (
    <>
      <Folder className="size-4 text-soft-ink" aria-hidden="true" />
      {project.name}
    </>
  );
  if (entry === undefined) return <li className={ROW}>{words}</li>;
  return (
    <li>
      <Link
        to={pathTo(entry)}
        data-slot="welcome-project"
        className={`${ROW} outline-hidden hover:bg-paper-deep focus-visible:ring-2 focus-visible:ring-ring`}
      >
        {words}
      </Link>
    </li>
  );
}

/**
 * The welcome's projects, in the sidebar's order, each a link to the main it opens on, and
 * New project.
 */
export function Projects() {
  const shell = useShell();
  const ws = shell?.workspace;
  const projects = ws === undefined ? [] : sidebarTree(ws).map((node) => node.project);
  return (
    <section aria-labelledby="welcome-projects" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 id="welcome-projects" className={LABEL}>
          Projects
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="New project"
          onClick={() => shell?.newProject()}
        >
          <Plus />
        </Button>
      </div>
      {projects.length > 0 && (
        <ul className="flex flex-col">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              entry={ws === undefined ? undefined : entryOf(ws, project.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * What a thread can open with: the browser, and a file and a terminal, which wait for the
 * desktop app.
 */
export function Actions({ thread }: { thread: ThreadSummary }) {
  const shell = useShell();
  return (
    <section aria-labelledby="welcome-actions" className="flex flex-col gap-2">
      <h2 id="welcome-actions" className={LABEL}>
        More actions
      </h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className={ACTION} disabled title={NOT_HERE}>
          <FileText />
          Open file
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={ACTION}
          onClick={() => shell?.setPane(thread.id, "browser")}
        >
          <Globe />
          Open browser
        </Button>
        <Button variant="outline" size="sm" className={ACTION} disabled title={NOT_HERE}>
          <Terminal />
          Open terminal
        </Button>
      </div>
    </section>
  );
}
