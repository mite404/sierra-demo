import { CatalogCard, InteractiveCard } from "@yaklabs/catalog";
import type { SharedCard } from "@yaklabs/catalog/share";
import type { ReactNode } from "react";

/** A canvas card, also used in the inert destination preview before it lands. */
export function CanvasCard({
  card,
  leading,
  trailing,
}: {
  card: SharedCard;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return card.kind === "interactive" ? (
    <InteractiveCard
      payload={card.payload}
      turnId="canvas"
      onChoose={() => {}}
      leading={leading}
      trailing={trailing}
    />
  ) : (
    <CatalogCard payload={card.payload} context="thread" leading={leading} trailing={trailing} />
  );
}
