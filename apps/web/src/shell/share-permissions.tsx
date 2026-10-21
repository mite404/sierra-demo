import { ExternalIcon, LinkIcon } from "@yaklabs/catalog/icons";
import { Button } from "@yaklabs/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@yaklabs/ui/components/dialog";
import { Input } from "@yaklabs/ui/components/input";
import { Globe, Lock, Users } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useHref, useShell } from "./model";
import { PermissionRow, PublicAccess, type AccessProps } from "./share-access";
import { liveShare } from "./share-thread";
import { wakeText } from "./wake-text";

// The welcome's words for what the web build cannot do yet (teams need a backend, ADR-137).
const NOT_HERE = "Not in the web build yet";

const SECTION = "flex flex-col gap-2 border-b border-border px-4 py-3";
const LABEL = "text-xs text-soft-ink";
const FIELD_BUTTON = "text-soft-ink hover:text-ink";

// The dialog keeps the thread it last showed while it fades out, since the shell forgets the
// thread the moment the dialog is asked to close.
function useRemembered<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

// The field that shows an address, whole, and selects it on focus so it can be copied by hand.
function AddressField({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted pr-1 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50">
      <Input
        readOnly
        aria-label={label}
        value={value}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        className="h-8 rounded-lg border-0 bg-transparent px-2.5 text-[13px] text-ink focus-visible:ring-0 dark:bg-transparent"
      />
      {children}
    </div>
  );
}

// The thread's own address, or, while it is public, the public link: what Copy link copies and
// Open link opens.
function UrlSection({ shell, thread, share }: AccessProps) {
  const own = useHref()(thread.id); // → string
  const url = share === undefined ? own : share.link;
  const label = share === undefined ? "URL" : "Public URL";
  return (
    <section aria-label={label} className={SECTION}>
      <p className={LABEL}>{label}</p>
      <AddressField label={label} value={url}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copy link"
          className={FIELD_BUTTON}
          onClick={() => {
            if (share === undefined) shell.copyUrl(thread.id);
            else shell.copyPublicLink(thread.id);
          }}
        >
          <LinkIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open link"
          className={FIELD_BUTTON}
          onClick={() => {
            window.open(url, "_blank", "noopener");
          }}
        >
          <ExternalIcon />
        </Button>
      </AddressField>
    </section>
  );
}

// Who can read the thread. Teams need a backend the web build does not have (ADR-137), so the
// Workspace row stands, disabled, as the welcome's Open file does.
function PermissionsSection(props: AccessProps) {
  return (
    <section aria-label="Permissions" className={`${SECTION} gap-1`}>
      <p className={LABEL}>Permissions</p>
      <div className="flex flex-col divide-y divide-border">
        <PermissionRow
          icon={<Users aria-hidden="true" />}
          title="Workspace"
          subtitle="Share threads with your team."
        >
          <Button
            variant="outline"
            size="sm"
            disabled
            title={NOT_HERE}
            className="h-8 px-3 text-[13px] disabled:pointer-events-auto"
          >
            Create Workspace
          </Button>
        </PermissionRow>
        <PublicAccess {...props} />
      </div>
    </section>
  );
}

const PRIVATE_WORDS = {
  Icon: Lock,
  title: "Private",
  note: "Only you can see this thread.",
  isPublic: false,
};

// What the box says of the thread: private, or public until when the share ends.
function wordsOf(share: AccessProps["share"]) {
  if (share === undefined) return PRIVATE_WORDS;
  const until = wakeText(new Date(share.expiresAt), "row");
  return {
    Icon: Globe,
    title: `Public until ${until}`,
    note: "Anyone with the link can read this thread.",
    isPublic: true,
  };
}

// Where the thread stands now, in words, so the choice above is never a guess.
function StatusBox({ share }: Pick<AccessProps, "share">) {
  const { Icon, title, note, isPublic } = wordsOf(share);
  return (
    <div className="p-4">
      <output
        data-public={isPublic ? "" : undefined}
        className="flex items-start gap-3 rounded-lg border border-border bg-muted px-3 py-2.5"
      >
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-soft-ink" />
        <div className="flex flex-col">
          <span className="font-medium text-ink">{title}</span>
          <span className="text-xs text-soft-ink">{note}</span>
        </div>
      </output>
    </div>
  );
}

/**
 * The share permissions dialog (ADR-131), Google's share pattern: the thread's address to copy
 * or open, who can read it (Workspace waits on a backend; Public Access is the Share menu's
 * lifetimes), and a box saying where it stands. It opens with `shell.askSharePermissions(id)`,
 * from any Share menu, and is mounted once at the window.
 */
export function SharePermissions() {
  const shell = useShell();
  const asked = shell?.workspace.threads.find((each) => each.id === shell.sharePermissions);
  const thread = useRemembered(asked);
  // Focus starts on the dialog itself, so the address is not selected the moment it opens.
  const popup = useRef<HTMLDivElement>(null);
  if (shell === null || thread === undefined) return null;
  const share = liveShare(shell.workspace.shares, thread.id);
  return (
    <Dialog
      open={asked !== undefined}
      onOpenChange={(open) => {
        if (!open) shell.askSharePermissions(null);
      }}
    >
      <DialogContent ref={popup} initialFocus={popup}>
        <DialogHeader className="border-b border-border">
          <DialogTitle>Share</DialogTitle>
          <DialogDescription className="sr-only">
            Who can read “{thread.title}”, and its address.
          </DialogDescription>
        </DialogHeader>
        <UrlSection shell={shell} thread={thread} share={share} />
        <PermissionsSection shell={shell} thread={thread} share={share} />
        <StatusBox share={share} />
      </DialogContent>
    </Dialog>
  );
}
