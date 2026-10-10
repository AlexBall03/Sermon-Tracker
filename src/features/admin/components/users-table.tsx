"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { setUserRole, setUserStatus } from "../actions";
import type { DirectoryEntry } from "../clerk";

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
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                Person
              </th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                Role
              </th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                Status
              </th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                Added
              </th>
              <th scope="col" className="px-2 py-2.5 sm:px-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((entry) => {
              const label = entry.name ?? entry.email ?? "This person";
              const isSelf = entry.id === currentUserId;
              const role = (
                <Badge tone={entry.role === "admin" ? "accent" : "muted"}>
                  {entry.role === "admin" ? "Admin" : "User"}
                </Badge>
              );
              const status = (
                <Badge tone={entry.status === "active" ? "muted" : "danger"}>
                  {entry.status === "active" ? "Active" : "Disabled"}
                </Badge>
              );
              return (
                <tr key={entry.id}>
                  <th scope="row" className="max-w-0 px-4 py-3 font-normal sm:max-w-64 sm:px-5">
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
                    {/* Narrow screens: the Role and Status columns fold in here. */}
                    <span className="mt-2 flex gap-1.5 sm:hidden">
                      {role}
                      {status}
                    </span>
                  </th>
                  <td className="hidden px-4 py-3 sm:table-cell">{role}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{status}</td>
                  <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="w-px px-2 py-2 text-right sm:px-3">
                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Actions for ${label}`}
                          className="inline-grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 data-popup-open:bg-accent data-popup-open:text-foreground pointer-coarse:size-11"
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
