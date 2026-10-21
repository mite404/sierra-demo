import { useAuth } from "@workos-inc/authkit-react";
import { Avatar, AvatarFallback, AvatarImage } from "@yaklabs/ui/components/avatar";
import { Button } from "@yaklabs/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@yaklabs/ui/components/dropdown-menu";
import { UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { env } from "../env";
import type { ChromeChoice, ChromeStyle } from "../chrome";
import type { ThemeChoice, ThemePreference } from "../theme";

// What the account menu lets the visitor change: the theme and the title bar's look.
export type Looks = { theme: ThemeChoice; chrome: ChromeChoice };

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const CHROMES: { value: ChromeStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "painting", label: "Painting" },
];

// "Ethan Arnold" → "EA"; an email alone gives its first letter.
function initialsOf(names: (string | null)[], email: string): string {
  const letters = names.map((name) => name?.charAt(0) ?? "").join("");
  return (letters === "" ? email.charAt(0) : letters).toUpperCase();
}

// Light, dark, or whatever the OS or browser prefers, the default (ADR-162).
function ThemeChoices({ theme }: { theme: ThemeChoice }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme.preference}
        onValueChange={(value) => {
          const chosen = THEMES.find((each) => each.value === value);
          if (chosen) theme.choose(chosen.value);
        }}
      >
        {THEMES.map(({ value, label }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

// The title bar's flat green or its painting (ADR-115), while Ethan chooses between them.
function ChromeChoices({ chrome }: { chrome: ChromeChoice }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Title bar</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={chrome.style}
        onValueChange={(value) => {
          const chosen = CHROMES.find((each) => each.value === value);
          if (chosen) chrome.choose(chosen.value);
        }}
      >
        {CHROMES.map(({ value, label }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

// Where the menu opens from: below and to the end of its trigger by default, or wherever the
// host places it, such as upward from the sidebar's foot (ADR-121).
type Placement = { side?: "top" | "bottom"; align?: "start" | "end" };

// The avatar in the trigger's corner, and the menu it opens.
function AccountMenu({
  face,
  side,
  align = "end",
  children,
}: Placement & { face: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // A 40px square, as a rail button is, so the avatar sits on the rail's centre line. Focus
          // shows the site's own 2px ring (tokens.css), not shadcn's half-strength one, which is
          // too faint on the sidebar's paper.
          <Button
            variant="ghost"
            size="icon"
            aria-label="Account"
            className="size-10 rounded-full focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-(--focus)"
          />
        }
      >
        {/* The ring keeps the avatar's own blend: it darkens on the sidebar's paper, and a
            blend is also what keeps the page's text on greyscale smoothing (ADR-110). */}
        <Avatar>{face}</Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Signed in with WorkOS (ADR-084): the picture or initials, the email, and the way out.
function WorkOsAccount({ theme, chrome, side, align }: Looks & Placement) {
  const { user, signOut } = useAuth();
  if (user === null) return null;
  const face = (
    <>
      {user.profilePictureUrl !== null && <AvatarImage src={user.profilePictureUrl} alt="" />}
      {/* The ink, not the muted ink, so the initials read on the fill and on the hover fill. */}
      <AvatarFallback className="text-ink">
        {initialsOf([user.firstName, user.lastName], user.email)}
      </AvatarFallback>
    </>
  );
  return (
    <AccountMenu face={face} side={side} align={align}>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-soft-ink">{user.email}</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            signOut();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <ThemeChoices theme={theme} />
      <DropdownMenuSeparator />
      <ChromeChoices chrome={chrome} />
    </AccountMenu>
  );
}

// A build without sign-in: a person glyph, since there is no account to picture (ADR-114,
// amended), and a menu that says sign-in is off. A signed-in account keeps its own face.
function LocalAccount({ theme, chrome, side, align }: Looks & Placement) {
  const face = (
    <AvatarFallback className="text-ink">
      <UserRound className="size-3.5" />
    </AvatarFallback>
  );
  return (
    <AccountMenu face={face} side={side} align={align}>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-soft-ink">
          Sign-in is off in this build
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <ThemeChoices theme={theme} />
      <DropdownMenuSeparator />
      <ChromeChoices chrome={chrome} />
    </AccountMenu>
  );
}

/**
 * The account, with the theme and the bar's look; WorkOS's user when the build signs in. The
 * sidebar places it at its foot, opening upward so its menu stays on screen (ADR-121).
 * @param side Which side of the trigger the menu opens on.
 * @param align Which end of the trigger the menu aligns to.
 */
export const Account = env.auth.kind === "workos" ? WorkOsAccount : LocalAccount;
