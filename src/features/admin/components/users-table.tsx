"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setUserRole, setUserStatus, type ActionResult } from "../actions";
import type { DirectoryEntry } from "../clerk";
import { ActionStatus, ConfirmDialog, type Confirmation } from "./confirm-dialog";

// A fixed zone keeps server and browser output identical.
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export function formatDate(date: Date) {
  return dateFormat.format(date);
}

export function Badge({
  tone,
  children,
}: {
  tone: "accent" | "muted" | "danger";
  children: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold",
        tone === "accent" && "border-primary/30 text-primary",
        tone === "muted" && "text-muted-foreground",
        tone === "danger" && "border-destructive/30 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

function confirmationsFor(entry: DirectoryEntry, label: string): Confirmation[] {
  const role: Confirmation =
    entry.role === "admin"
      ? {
          title: "Remove administrator access?",
          description: `${label} will no longer be able to invite people or manage accounts.`,
          confirmLabel: "Make standard user",
          run: () => setUserRole(entry.id, "user"),
        }
      : {
          title: "Make this person an administrator?",
          description: `${label} will be able to invite people, change roles, and disable accounts.`,
          confirmLabel: "Make administrator",
          run: () => setUserRole(entry.id, "admin"),
        };
  const status: Confirmation =
    entry.status === "active"
      ? {
          title: "Disable this account?",
          description: `${label} will be locked out of Sermon Tracker straight away. Nothing is deleted, and you can re-enable the account later.`,
          confirmLabel: "Disable account",
          destructive: true,
          run: () => setUserStatus(entry.id, "disabled"),
        }
      : {
          title: "Re-enable this account?",
          description: `${label} will be able to use Sermon Tracker again.`,
          confirmLabel: "Re-enable account",
          run: () => setUserStatus(entry.id, "active"),
        };
  return [role, status];
}

type UsersTableProps = {
  entries: DirectoryEntry[];
  /** Application ID of the signed-in administrator, who cannot edit their own row. */
  currentUserId: string;
};

export function UsersTable({ entries, currentUserId }: UsersTableProps) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  function confirm(chosen: Confirmation) {
    startTransition(async () => {
      setResult(await chosen.run());
      setConfirmation(null);
    });
  }

  return (
    <>
      <ActionStatus result={result} />
      <div className="mt-4 overflow-x-auto rounded-xl border bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">People with access to Sermon Tracker</caption>
          <thead className="border-b text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Person
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Role
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="hidden px-4 py-3 font-semibold sm:table-cell">
                Added
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((entry) => {
              const label = entry.name ?? entry.email ?? "This person";
              const isSelf = entry.id === currentUserId;
              return (
                <tr key={entry.id}>
                  <th scope="row" className="max-w-56 px-4 py-3 font-normal">
                    <span className="block truncate font-semibold">
                      {entry.name ?? entry.email ?? "Unknown"}
                      {isSelf && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {entry.identityMissing
                        ? "Sign-in identity removed"
                        : entry.name
                          ? entry.email
                          : null}
                    </span>
                  </th>
                  <td className="px-4 py-3">
                    <Badge tone={entry.role === "admin" ? "accent" : "muted"}>
                      {entry.role === "admin" ? "Admin" : "User"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={entry.status === "active" ? "muted" : "danger"}>
                      {entry.status === "active" ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground sm:table-cell">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Actions for ${label}`}
                          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
                        >
                          <MoreHorizontal className="size-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {confirmationsFor(entry, label).map((option) => (
                            <DropdownMenuItem
                              key={option.confirmLabel}
                              variant={option.destructive ? "destructive" : "default"}
                              onClick={() => setConfirmation(option)}
                            >
                              {option.confirmLabel}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setConfirmation(null)}
      />
    </>
  );
}
