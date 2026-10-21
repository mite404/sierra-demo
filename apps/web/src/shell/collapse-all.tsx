import { collapseLanes, type Runtime } from "@yaklabs/runtime";
import { Button } from "@yaklabs/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@yaklabs/ui/components/tooltip";
import { FoldHorizontal, UnfoldHorizontal } from "lucide-react";
import { arrangeFrom } from "../components/arrange";
import { useStartedRuntime } from "../runtime";
import type { Shell } from "./model";
import { foldOffer, type FoldOffer } from "./state";

// What the button says and shows for each offer; with nothing to fold it waits as Collapse all.
const LOOKS = {
  collapse: { label: "Collapse all lanes", Icon: FoldHorizontal },
  expand: { label: "Expand all lanes", Icon: UnfoldHorizontal },
} as const;

// The offer for the thread on screen, with the runtime that carries it out, once it has one.
type Offer = FoldOffer & { runtime: Runtime };

function offerIn(shell: Shell | null, runtime: Runtime | null): Offer | null {
  const offer = shell === null ? null : foldOffer(shell.workspace, shell.doc, shell.active);
  return offer === null || runtime === null ? null : { ...offer, runtime };
}

// Every lane on the canvas collapsed, or every one expanded, as the offer says.
function foldAll({ runtime, main, collapse }: Offer): void {
  arrangeFrom(runtime, main, (lanes) => collapseLanes(lanes, collapse));
}

/**
 * Collapse all or Expand all for the canvas on screen (ADR-134), in the title bar: beside the
 * layout on a desktop, and in the top row on a phone, never the row of views. It stays in its
 * place, disabled, while there is nothing on screen to fold, so the bar never shifts.
 */
export function CollapseAll({ shell }: { shell: Shell | null }) {
  const offer = offerIn(shell, useStartedRuntime());
  const { label, Icon } = LOOKS[offer?.collapse === false ? "expand" : "collapse"];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            data-slot="collapse-all"
            aria-label={label}
            disabled={offer === null}
            className="shrink-0 text-soft-ink hover:text-ink"
            onClick={() => {
              if (offer !== null) foldAll(offer);
            }}
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
