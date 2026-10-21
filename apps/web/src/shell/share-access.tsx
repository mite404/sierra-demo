import type { ThreadShare, ThreadSummary } from "@yaklabs/runtime";
import { Button } from "@yaklabs/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@yaklabs/ui/components/dropdown-menu";
import { ChevronDown, Globe } from "lucide-react";
import type { ReactNode } from "react";
import type { Shell } from "./model";
import { LIFETIMES } from "./share-thread";
import { wakeText } from "./wake-text";

// What a row acts on: the shell's verbs, the thread, and its live share if it has one.
export type AccessProps = { shell: Shell; thread: ThreadSummary; share: ThreadShare | undefined };

// The radio values of Public Access: no access, or a lifetime's seconds. A public thread has no
// lifetime of its own to tick, since the time left is not one of the choices.
const NO_ACCESS = "none";
const PUBLIC_NOW = "public";

// Reads the dropdown's radio value and does what it says: end the public page, or start a new
// link that lasts that long, in place of the old one (ADR-131).
function choose(
  shell: Shell,
  thread: ThreadSummary,
  share: ThreadShare | undefined,
  value: unknown,
) {
  const lifetime = LIFETIMES.find((each) => String(each.seconds) === value);
  if (lifetime !== undefined) shell.share(thread.id, lifetime.seconds);
  else if (value === NO_ACCESS && share !== undefined) shell.stopSharing(thread.id);
}

/** One row of Permissions: an icon, what it grants, and its control on the right. */
export function PermissionRow({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1">
      <span className="grid size-4 shrink-0 place-items-center text-soft-ink [&_svg]:size-4">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-ink">{title}</span>
        <span className="text-xs text-soft-ink">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Public Access: No access, or how long the page stays public. A choice is the Share menu's
 * own, through the same verbs.
 */
export function PublicAccess({ shell, thread, share }: AccessProps) {
  const value =
    share === undefined ? "No access" : `Until ${wakeText(new Date(share.expiresAt), "menu")}`;
  return (
    <PermissionRow
      icon={<Globe aria-hidden="true" />}
      title="Public Access"
      subtitle="Anyone on the Internet"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Public Access: ${value}`}
              className="h-8 gap-1.5 px-2 text-[13px] text-ink"
            />
          }
        >
          {value}
          <ChevronDown aria-hidden="true" className="text-soft-ink" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuRadioGroup
            value={share === undefined ? NO_ACCESS : PUBLIC_NOW}
            onValueChange={(next) => {
              choose(shell, thread, share, next);
            }}
          >
            <DropdownMenuRadioItem value={NO_ACCESS} closeOnClick>
              No access
            </DropdownMenuRadioItem>
            {LIFETIMES.map(({ label, seconds }) => (
              <DropdownMenuRadioItem key={seconds} value={String(seconds)} closeOnClick>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </PermissionRow>
  );
}
