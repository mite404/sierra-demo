import { Button } from "@yaklabs/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@yaklabs/ui/components/dropdown-menu";
import { Paintbrush } from "lucide-react";
import { SPLASH_LOOKS, splashStyleOf, useSplash } from "../splash";

const labelOf = (style: string): string =>
  SPLASH_LOOKS.find((look) => look.id === style)?.label ?? "";

/**
 * The button that picks the painting behind a new thread's welcome (ADR-136) for this visit: the
 * landscape, the abstract strokes, Vitruvian's sheet, or Bonsai once its assets exist, so a
 * visitor can look through each. The welcome places it, since it shows there and nowhere else.
 * Its menu opens from the button's corner in 150ms, and Esc closes it.
 */
export function SplashSwitch({ className }: { className?: string }) {
  const { style, choose } = useSplash();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" data-slot="splash-switch" className={className} />
        }
      >
        <Paintbrush />
        Splash · {labelOf(style)}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>New thread painting</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={style}
            onValueChange={(value) => {
              const chosen = splashStyleOf(typeof value === "string" ? value : null);
              if (chosen !== null) choose(chosen);
            }}
          >
            {SPLASH_LOOKS.map(({ id, label, available }) => (
              <DropdownMenuRadioItem key={id} value={id} disabled={!available} closeOnClick>
                {label}
                {!available && <span className="ml-auto text-xs">Coming soon</span>}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
