import type { Notification } from "@yaklabs/runtime";
import { Button } from "@yaklabs/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@yaklabs/ui/components/dropdown-menu";
import { Bell as BellIcon } from "lucide-react";
import { useState } from "react";
import type { Shell } from "./model";
import { badgeText } from "./state";

// "18:47": a scenario's clock is UTC, so its times never move with the machine's zone.
function timeOf(at: string, utc: boolean): string {
  const format = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: utc ? "UTC" : undefined,
  });
  return format.format(new Date(at));
}

function Row({ item, fresh, utc }: { item: Notification; fresh: boolean; utc: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 items-start gap-2">
      <span
        aria-hidden="true"
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${fresh ? "bg-ink" : "bg-transparent"}`}
      />
      <span className="min-w-0 flex-1 text-ink">{item.text}</span>
      <span className="shrink-0 text-soft-ink tabular-nums">{timeOf(item.at, utc)}</span>
    </span>
  );
}

// The bell itself, and the count on it.
function BellTrigger({ unread, disabled }: { unread: number; disabled: boolean }) {
  const badge = badgeText(unread);
  return (
    <DropdownMenuTrigger
      disabled={disabled}
      render={
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={badge === null ? "Notifications" : `Notifications, ${unread} unread`}
        />
      }
    >
      <BellIcon />
      {badge !== null && (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] leading-none font-medium text-[var(--on-ink)] tabular-nums"
        >
          {badge}
        </span>
      )}
    </DropdownMenuTrigger>
  );
}

/**
 * The bell: the notifications in the snapshot, newest first, each opening its thread. A badge
 * counts the unread, "9+" past nine; opening the menu marks them read, and the ones that were
 * new keep their dot until it closes.
 */
export function Bell({ shell }: { shell: Shell | null }) {
  if (shell === null) {
    return (
      <DropdownMenu>
        <BellTrigger unread={0} disabled />
      </DropdownMenu>
    );
  }
  return <BellMenu shell={shell} />;
}

// The bell once the shell is ready, and the menu of notifications it opens.
function BellMenu({ shell }: { shell: Shell }) {
  const [fresh, setFresh] = useState<string[]>([]);
  const items = shell.workspace.notifications;
  const utc = shell.source.kind === "scenario";
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        const unseen = items.filter((item) => !shell.doc.read.includes(item.id));
        setFresh(open ? unseen.map((item) => item.id) : []);
        if (open) shell.markRead(items.map((item) => item.id));
      }}
    >
      <BellTrigger unread={shell.unread} disabled={false} />
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {items.length === 0 ? (
            <p className="px-2 pb-2 text-xs text-soft-ink">No notifications</p>
          ) : (
            items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => {
                  shell.open(item.threadId);
                }}
              >
                <Row item={item} fresh={fresh.includes(item.id)} utc={utc} />
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
