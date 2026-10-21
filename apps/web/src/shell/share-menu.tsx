import { ExternalIcon, LinkIcon, ShareIcon } from "@yaklabs/catalog/icons";
import type { ThreadShare, ThreadSummary } from "@yaklabs/runtime";
import { Button } from "@yaklabs/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@yaklabs/ui/components/dropdown-menu";
import { Timer, Users, X } from "lucide-react";
import { MenuStatus, statusName } from "./menu-status";
import type { Shell } from "./model";
import { LIFETIMES, liveShare } from "./share-thread";
import { wakeText } from "./wake-text";

// What the submenu acts on: the shell's verbs and the thread.
type ShareProps = { shell: Shell; thread: ThreadSummary };

// The thread's live share, if any (see `liveShare`).
const shareOf = (shell: Shell, thread: ThreadSummary) =>
  liveShare(shell.workspace.shares, thread.id);

// What Share says the thread is: private, or public until when, at the menu's length.
function shareStatus(share: ThreadShare | undefined): string {
  return share === undefined ? "Private" : `Until ${wakeText(new Date(share.expiresAt), "menu")}`;
}

// What a public thread's page offers: its end, its link, and taking it down.
function PublicItems({ shell, thread, share }: ShareProps & { share: ThreadShare }) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>
          Public until {wakeText(new Date(share.expiresAt), "row")}
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            shell.copyPublicLink(thread.id);
          }}
        >
          <LinkIcon />
          Copy public link
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.open(share.link, "_blank", "noopener");
          }}
        >
          <ExternalIcon />
          Open public page
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            shell.stopSharing(thread.id);
          }}
        >
          <X aria-hidden="true" />
          Stop sharing
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  );
}

// What Share offers, wherever it opens: a public thread's link, page and Stop sharing first,
// then how long to make it public, then the permissions dialog, which shows the same choices.
function ShareOptions({ shell, thread }: ShareProps) {
  const share = shareOf(shell, thread);
  return (
    <>
      {share !== undefined && <PublicItems shell={shell} thread={thread} share={share} />}
      <LifetimeItems shell={shell} thread={thread} isPublic={share !== undefined} />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          shell.askSharePermissions(thread.id);
        }}
      >
        <Users aria-hidden="true" />
        Share permissions
      </DropdownMenuItem>
    </>
  );
}

// How long to make it public: each lifetime starts a new link, in place of any old one.
function LifetimeItems({ shell, thread, isPublic }: ShareProps & { isPublic: boolean }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{isPublic ? "New link, public for" : "Make public for"}</DropdownMenuLabel>
      {LIFETIMES.map(({ label, seconds }) => (
        <DropdownMenuItem
          key={seconds}
          onClick={() => {
            shell.share(thread.id, seconds);
          }}
        >
          <Timer aria-hidden="true" />
          {label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}

/**
 * The thread menu's Share item (ADR-131): it says whether the thread is private or public
 * until when, and opens how long to make it public (1 hour, 6 hours, 1 day, 7 days). A public
 * thread also offers its link, its page, and Stop sharing, so how long a page stays public is
 * never a guess.
 */
export function ShareItem({ shell, thread }: ShareProps) {
  const share = shareOf(shell, thread); // → ThreadShare | undefined
  const status = shareStatus(share); // → "Private" | "Until Fri 9:00"
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className="whitespace-nowrap"
        aria-label={statusName("Share thread", status)}
      >
        <ShareIcon />
        Share thread
        <MenuStatus>{status}</MenuStatus>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <ShareOptions shell={shell} thread={thread} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * The Share button in a thread's title bar: the same options as the thread menu's Share item
 * (ADR-131), one press nearer. It sits left of the close, which is always last. A public thread
 * shows its glyph filled in, and its name says until when, so the state is never a guess.
 */
export function ThreadShareButton({ shell, thread }: ShareProps) {
  const share = shareOf(shell, thread); // → ThreadShare | undefined
  const status = shareStatus(share); // → "Private" | "Until Fri 9:00"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={statusName("Share thread", status)}
            data-public={share === undefined ? undefined : ""}
            className="text-soft-ink hover:text-ink data-public:text-ink"
          />
        }
      >
        <ShareIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <ShareOptions shell={shell} thread={thread} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
