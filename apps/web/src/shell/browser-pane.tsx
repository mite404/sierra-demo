import type { ThreadId } from "@yaklabs/runtime";
import { Badge } from "@yaklabs/ui/components/badge";
import { Button } from "@yaklabs/ui/components/button";
import { Input } from "@yaklabs/ui/components/input";
import { ArrowLeft, ArrowRight, Globe, RotateCw } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { pageAt, parseAddress, type PageAddress } from "./browser";
import type { Shell } from "./model";
import { PageBody, type Go } from "./pages";
import type { BrowserState, BrowserStep } from "./state";

// One of the pane's controls: an icon button named by what it does.
function PaneButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

// Why the address field refused what was typed: a note hung under the field, which describes
// it. The alert stays mounted, hidden while empty, so its words are announced as they arrive.
function Refusal({ id, refused }: { id: string; refused: boolean }) {
  return (
    <p
      id={id}
      role="alert"
      className="absolute top-full left-0 z-10 mt-1.5 w-max max-w-full bg-foreground px-3 py-1.5 text-xs text-background empty:hidden"
    >
      {refused ? "Not a web address" : null}
    </p>
  );
}

// The address field: what was typed until Enter, then whatever the pane shows. A field that
// cannot be read as an address keeps what was typed and says why.
function AddressField({ current, onGo }: { current: PageAddress; onGo: Go }) {
  const [field, setField] = useState<{ over: PageAddress; text: string; refused: boolean }>({
    over: current,
    text: current,
    refused: false,
  });
  const refusal = useId();
  // A new page, by any route (a link, back, forward), replaces whatever was being typed.
  if (field.over !== current) setField({ over: current, text: current, refused: false });
  return (
    <form
      className="relative min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        const to = parseAddress(field.text); // → PageAddress | null
        if (to === null) setField({ ...field, refused: true });
        else onGo(to);
      }}
    >
      <Globe
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-soft-ink"
      />
      <Input
        aria-label="Address"
        aria-invalid={field.refused || undefined}
        aria-describedby={refusal}
        value={field.text}
        spellCheck={false}
        className="h-7 rounded-[var(--radius)] border-hairline bg-[var(--control-bg)] pr-22 pl-8 text-xs text-ellipsis dark:bg-[var(--control-bg)]"
        onChange={(event) => {
          setField({ over: current, text: event.target.value, refused: false });
        }}
      />
      <Badge
        variant="outline"
        className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded-[var(--radius)] border-hairline text-soft-ink"
      >
        Simulated
      </Badge>
      <Refusal id={refusal} refused={field.refused} />
    </form>
  );
}

// The pane's bar in Kay's order: back, forward, reload, then the address.
function BrowserBar({
  browser,
  onStep,
  onReload,
}: {
  browser: BrowserState;
  onStep: (move: BrowserStep) => void;
  onReload: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline px-2">
      <PaneButton
        label="Back"
        disabled={browser.back.length === 0}
        onClick={() => {
          onStep({ kind: "back" });
        }}
      >
        <ArrowLeft />
      </PaneButton>
      <PaneButton
        label="Forward"
        disabled={browser.forward.length === 0}
        onClick={() => {
          onStep({ kind: "forward" });
        }}
      >
        <ArrowRight />
      </PaneButton>
      <PaneButton label="Reload" onClick={onReload}>
        <RotateCw />
      </PaneButton>
      <AddressField
        current={browser.current}
        onGo={(to) => {
          onStep({ kind: "go", to });
        }}
      />
    </header>
  );
}

/**
 * The simulated browser beside a thread, with the page below its bar. Pages come from the
 * registry of .example addresses; any other address draws a page that says it is simulated.
 * Back and forward walk this pane's own history, which the shell keeps; reload draws the page
 * again and keeps nothing.
 */
export function BrowserPane({
  shell,
  main,
  browser,
}: {
  shell: Shell;
  main: ThreadId;
  browser: BrowserState;
}) {
  const [reloads, setReloads] = useState(0);
  const page = pageAt(browser.current);
  const step = (move: BrowserStep) => {
    shell.browse(main, move);
  };
  return (
    <section aria-label="Browser" className="flex h-full min-w-0 flex-col bg-paper">
      <BrowserBar
        browser={browser}
        onStep={step}
        onReload={() => {
          setReloads((n) => n + 1);
        }}
      />
      <div key={reloads} className="min-h-0 flex-1 overflow-auto bg-[var(--compose-bg)] p-8">
        <PageBody
          page={page}
          go={(to) => {
            step({ kind: "go", to });
          }}
        />
      </div>
    </section>
  );
}
