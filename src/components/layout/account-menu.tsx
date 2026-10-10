"use client";

import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Settings, ShieldCheck } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
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
} from "@/components/ui/dropdown-menu";
import { routes } from "@/lib/site";
import { themeOptions, useThemeChoice } from "./theme-toggle";

/** Up to two initials from a name or email address. */
export function initialsOf(name: string) {
  return (
    name
      .split(/[\s@.]+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Name, email, and picture of the signed-in person, for presentation only. */
export function useAccountIdentity() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName || email || "Account";
  const imageUrl = user?.hasImage ? user.imageUrl : null;
  return { name, email, initials: initialsOf(name), imageUrl };
}

/** Sign-out. Used by the desktop menu and the mobile panel. */
export function useAccountActions() {
  const clerk = useClerk();
  return {
    signOut: () => clerk.signOut({ redirectUrl: routes.home }),
  };
}

/**
 * Desktop account menu in the application bar. It also holds the theme, as
 * menu radio items, so the bar keeps its space for navigation and capture.
 */
export function AccountMenu({ isAdmin }: { isAdmin: boolean }) {
  const { name, email, initials, imageUrl } = useAccountIdentity();
  const { signOut } = useAccountActions();
  const theme = useThemeChoice();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="grid size-9 place-items-center rounded-full border border-input bg-surface shadow-card transition-[border-color,box-shadow] duration-150 hover:border-primary/70 data-popup-open:border-ring data-popup-open:shadow-focus pointer-coarse:size-11"
      >
        <Avatar imageUrl={imageUrl} initials={initials} className="size-full bg-surface text-xs" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            {email && email !== name && <span className="truncate">{email}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={routes.settings} />}>
          <Settings aria-hidden />
          Settings
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem render={<Link href={routes.admin} />}>
            <ShieldCheck aria-hidden />
            Administration
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          aria-label="Colour theme"
          value={theme.current}
          onValueChange={theme.choose}
        >
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden className="text-muted-foreground" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
