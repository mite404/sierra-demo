"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "cn";

// The app's one hover label (design pillars, rule 28): a name in a pill, no arrow, the page's ink
// with the text on ink, so it stands out from the paper shell in either theme. Its 12px corners
// are half a one-line pill's height (a 16px line, 4px above and below), so one line is a capsule
// and a name that wraps keeps the same ends. It grows in from its trigger's side and leaves the
// same way, each in half the drawer's slide on the drawer's curve (rule 31: 110ms, the panel
// ease); opened at once (a neighbour's pill was up, or focus brought it) it does not move at all,
// and under reduced motion it only fades. Transitions, so a pill that closes as it opens turns
// back from where it is, and on its way out it takes no pointer.
const PILL =
  "z-50 w-fit max-w-xs origin-(--transform-origin) rounded-[12px] bg-ink px-2.5 py-1 text-[13px] leading-4 font-medium whitespace-nowrap text-(--on-ink) transition-[opacity,scale] duration-110 ease-[cubic-bezier(0.17,1.02,0.58,1)] data-ending-style:scale-97 data-ending-style:opacity-0 data-ending-style:pointer-events-none data-instant:transition-none data-starting-style:scale-97 data-starting-style:opacity-0 motion-reduce:data-ending-style:scale-100 motion-reduce:data-starting-style:scale-100";
// A pill shows once the pointer has rested on its trigger 350ms, then the next one in its group
// opens at once (Base UI's delay group), and it sits 8px off its trigger (ADR-144).
const PILL_DELAY_MS = 350;
const PILL_OFFSET_PX = 8;

function TooltipProvider({
  delay = PILL_DELAY_MS,
  closeDelay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = PILL_OFFSET_PX,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(PILL, className)}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
