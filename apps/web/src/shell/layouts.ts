import { Globe, LayoutDashboard, MessageSquareText, type LucideIcon } from "lucide-react";
import type { PaneKind } from "./state";

/** Each layout's name and glyph; the tab's icon and the layout switch read the same table. */
export const LAYOUTS = {
  thread: { label: "Thread", Icon: MessageSquareText },
  canvas: { label: "Canvas", Icon: LayoutDashboard },
  browser: { label: "Browser", Icon: Globe },
} as const satisfies Record<PaneKind, { label: string; Icon: LucideIcon }>;

/** The layouts in the order the switch offers them. */
export const PANES: PaneKind[] = ["thread", "canvas", "browser"];

/**
 * The layout a press on the switch asks for. A press on another layout picks it; a press on the
 * side pane already open (Canvas or Browser) takes it away, and the toggle group reports no layout
 * at all, so it closes back to the thread, which is always there; the thread pressed again stays.
 * @param values What the toggle group holds after the press.
 */
export function paneAfterPress(values: readonly unknown[]): PaneKind {
  return PANES.find((each) => values.includes(each)) ?? "thread"; // → the pressed layout, or the thread
}
