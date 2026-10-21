import { useState } from "react";
import { IconButton } from "./IconButton";
import { ExternalIcon, LinkIcon, ShareIcon } from "./icons";
import { Menu, type TriggerProps } from "./Menu";
import { shareLink, type SharedCard } from "./share";

// How long "Link copied" stays after copying.
const COPIED_MS = 1800;

// The share icon that opens the menu, wearing the props the menu hands its trigger.
function renderShareTrigger(props: TriggerProps) {
  return (
    <IconButton {...props} label="Share this card">
      <ShareIcon />
    </IconButton>
  );
}

/**
 * Shares one card as a public page of its own (ADR-064): only this component, never the
 * conversation around it. Opens a menu to copy the link or open the page.
 */
export function ShareButton({ card }: { card: SharedCard }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard?.writeText(shareLink(card));
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);
  }

  return (
    <span className="share">
      <output className="share-status">{copied ? "Link copied" : ""}</output>
      <Menu
        label="Share this card"
        placement="below-end"
        items={[
          { label: "Copy public link", icon: <LinkIcon />, onSelect: () => void copy() },
          {
            label: "Open public page",
            icon: <ExternalIcon />,
            onSelect: () => window.open(shareLink(card), "_blank", "noopener"),
          },
        ]}
        trigger={renderShareTrigger}
      />
    </span>
  );
}
