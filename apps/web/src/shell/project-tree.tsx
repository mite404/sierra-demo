import { sidebarTree, type Located, type ProjectNode, type ThreadId } from "@yaklabs/runtime";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@yaklabs/ui/components/sidebar";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { QuietButton } from "../components/quiet-button";
import { useRestart, useRuntimeState } from "../runtime";
import { useShell, type Shell } from "./model";
import { ProjectButton, ThreadRow } from "./tree-rows";

// Fixed widths, so a loading screenshot is the same every time.
const SKELETON_WIDTHS = [168, 132, 150];

// Ids folded by hand: projects, and mains with their children. Nothing is folded at first.
type Folds = { folded: Set<string>; toggle: (id: string) => void };

function useFolds(): Folds {
  const [folded, setFolded] = useState<Set<string>>(new Set());
  return {
    folded,
    toggle: (id) => {
      setFolded((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    },
  };
}

// The thread the address names: a child, else its main.
function threadOn(active: Located | null): ThreadId | null {
  return active === null ? null : (active.focus ?? active.main);
}

// New project leaves with the empty tree it sat in, taking focus with it; once the thread it
// starts is open, its row takes focus, unless something else has taken it meanwhile. Returns
// what arms that hand-off.
function useHandOff(tree: RefObject<HTMLElement | null>, shell: Shell | null): () => void {
  const armed = useRef(false);
  const at = shell === null ? null : threadOn(shell.active); // → ThreadId | null
  useEffect(() => {
    if (!armed.current || at === null) return;
    armed.current = false;
    const row = tree.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (document.activeElement === document.body) row?.focus();
  }, [tree, at]);
  return () => {
    armed.current = true;
  };
}

// A main thread and the children below it, folded by its own row's arrow when it has any. `at`
// is the thread the address names, which is marked.
function MainRows({
  node,
  at,
  folds,
}: {
  node: ProjectNode["mains"][number];
  at: ThreadId | null;
  folds: Folds;
}) {
  const { main, children } = node;
  const open = !folds.folded.has(main.id);
  const hasChildren = children.length > 0;
  return (
    <>
      <SidebarMenuItem className="group/thread">
        <ThreadRow
          thread={main}
          active={at === main.id}
          kind="main"
          fold={
            hasChildren
              ? {
                  open,
                  count: children.length,
                  onToggle: () => {
                    folds.toggle(main.id);
                  },
                }
              : undefined
          }
        />
      </SidebarMenuItem>
      {open &&
        children.map((thread) => (
          <SidebarMenuItem key={thread.id} className="group/thread">
            <ThreadRow thread={thread} active={at === thread.id} kind="child" />
          </SidebarMenuItem>
        ))}
    </>
  );
}

// A project and its main threads; the "+" at its right starts a main thread in it.
function ProjectRows({ node, shell, folds }: { node: ProjectNode; shell: Shell; folds: Folds }) {
  const { project, mains } = node;
  const open = !folds.folded.has(project.id);
  return (
    <SidebarMenuItem>
      <ProjectButton
        name={project.name}
        open={open}
        onToggle={() => {
          folds.toggle(project.id);
        }}
      />
      <SidebarMenuAction
        aria-label={`New thread in ${project.name}`}
        className="top-1.5 rounded-[var(--radius)] text-soft-ink hover:text-ink"
        onClick={() => {
          shell.newThread(project.id);
        }}
      >
        <Plus />
      </SidebarMenuAction>
      {open && (
        <SidebarMenu className="mt-0.5">
          {mains.map((each) => (
            <MainRows key={each.main.id} node={each} at={threadOn(shell.active)} folds={folds} />
          ))}
        </SidebarMenu>
      )}
    </SidebarMenuItem>
  );
}

// What the tree says before the workspace arrives: rows on their way, another tab that has
// them, or a failed start.
function Unready() {
  const state = useRuntimeState();
  const restart = useRestart();
  if (state.kind === "held") {
    return <p className="px-2 py-1 text-sm text-soft-ink">Open in another tab.</p>;
  }
  if (state.kind !== "broken") {
    return SKELETON_WIDTHS.map((width) => <SidebarMenuSkeleton key={width} width={width} />);
  }
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-1 text-sm">
      <p className="text-soft-ink">Your threads could not be opened.</p>
      {restart && <QuietButton onClick={restart}>Try again</QuietButton>}
    </div>
  );
}

// What the tree says while there is no tree: why the workspace has not arrived, or nothing yet.
function TreeState({ shell, onNewProject }: { shell: Shell | null; onNewProject: () => void }) {
  if (shell === null) return <Unready />;
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-1 text-sm">
      <p className="text-soft-ink">No projects yet</p>
      <QuietButton
        onClick={() => {
          onNewProject();
          shell.newProject();
        }}
      >
        New project
      </QuietButton>
    </div>
  );
}

/**
 * The projects, their main threads and each main's children (ADR-092, ADR-093), newest main
 * first and each main's children newest first, both by creation (ADR-125). Rows open threads by
 * address; the URL's thread is marked. It fills the projects panel beside the rail (ADR-144).
 */
export function ProjectTree() {
  const shell = useShell();
  const folds = useFolds();
  const group = useRef<HTMLDivElement>(null);
  const handOff = useHandOff(group, shell);
  const tree = shell === null ? [] : sidebarTree(shell.workspace);
  return (
    <SidebarGroup ref={group}>
      <SidebarGroupLabel className="text-soft-ink">Projects</SidebarGroupLabel>
      {shell === null || tree.length === 0 ? (
        <TreeState shell={shell} onNewProject={handOff} />
      ) : (
        <SidebarMenu className="gap-2">
          {tree.map((node) => (
            <ProjectRows key={node.project.id} node={node} shell={shell} folds={folds} />
          ))}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}
