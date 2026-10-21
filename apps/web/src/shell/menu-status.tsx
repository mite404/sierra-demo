import type { ReactNode } from "react";

/**
 * A menu item's state at its end, as Share's "Private" and Snooze's wake time read: muted, in
 * the item's own size. The item names itself with `statusName`, since a flex row's parts would
 * otherwise reach a screen reader run together or spaced before the comma.
 */
export function MenuStatus({ children }: { children: ReactNode }) {
  return <span className="ml-auto pl-3 text-muted-foreground">{children}</span>;
}

/** An item's accessible name with its state: "Snooze, Tue 9:00" (WCAG 2.5.3, name first). */
export const statusName = (name: string, status?: string) =>
  status === undefined ? name : `${name}, ${status}`;
