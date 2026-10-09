"use client";

import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routes } from "@/lib/site";

/** Name and email of the signed-in person, for presentation only. */
export function useAccountIdentity() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName || email || "Account";
  const initials =
    name
      .split(/[\s@.]+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return { name, email, initials };
}

/** Sign-out and account settings. Used by the desktop menu and the mobile panel. */
export function useAccountActions() {
  const clerk = useClerk();
  return {
    manageAccount: () => clerk.openUserProfile(),
    signOut: () => clerk.signOut({ redirectUrl: routes.home }),
  };
}

/** Desktop account menu in the application bar. */
export function AccountMenu({ isAdmin }: { isAdmin: boolean }) {
  const { name, email, initials } = useAccountIdentity();
  const { manageAccount, signOut } = useAccountActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="grid size-9 place-items-center rounded-full border bg-surface text-xs font-semibold text-foreground shadow-card transition-colors duration-200 hover:border-primary/50 data-popup-open:border-primary/50"
      >
        <span aria-hidden>{initials}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            {email && email !== name && <span className="truncate">{email}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={manageAccount}>
          <UserRound aria-hidden />
          Manage account
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem render={<Link href={routes.admin} />}>
            <ShieldCheck aria-hidden />
            Administration
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
