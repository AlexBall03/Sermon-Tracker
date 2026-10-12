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
import type { Dictionaries } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { setUserRole, setUserStatus } from "../actions";
import type { DirectoryEntry } from "../clerk";

function confirmationsFor(
  entry: DirectoryEntry,
  label: string,
  t: Dictionaries["admin"]["users"],
): Confirmation[] {
  const ask = (
    words: { title: string; description: (name: string) => string; confirm: string },
    run: Confirmation["run"],
    destructive = false,
  ): Confirmation => ({
    title: words.title,
    description: words.description(label),
    confirmLabel: words.confirm,
    destructive,
    run,
  });
  return [
    entry.role === "admin"
      ? ask(t.removeAdmin, () => setUserRole(entry.id, "user"))
      : ask(t.makeAdmin, () => setUserRole(entry.id, "admin")),
    entry.status === "active"
      ? ask(t.disable, () => setUserStatus(entry.id, "disabled"), true)
      : ask(t.enable, () => setUserStatus(entry.id, "active")),
  ];
}

type UsersTableProps = {
  entries: DirectoryEntry[];
  /** Application ID of the signed-in administrator, who cannot edit their own row. */
  currentUserId: string;
};

export function UsersTable({ entries, currentUserId }: UsersTableProps) {
  const t = useT("admin").users;
  const locale = useLocale();
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
          <caption className="sr-only">{t.caption}</caption>
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                {t.person}
              </th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                {t.role}
              </th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                {t.status}
              </th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                {t.added}
              </th>
              <th scope="col" className="px-2 py-2.5 sm:px-3">
                <span className="sr-only">{t.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((entry) => {
              const label = entry.name ?? entry.email ?? t.thisPerson;
              const isSelf = entry.id === currentUserId;
              const role = (
                <Badge tone={entry.role === "admin" ? "accent" : "muted"}>
                  {entry.role === "admin" ? t.admin : t.user}
                </Badge>
              );
              const status = (
                <Badge tone={entry.status === "active" ? "muted" : "danger"}>
                  {entry.status === "active" ? t.active : t.disabled}
                </Badge>
              );
              return (
                <tr key={entry.id}>
                  <th scope="row" className="max-w-0 px-4 py-3 font-normal sm:max-w-64 sm:px-5">
                    <span className="block truncate font-semibold">
                      {entry.name ?? entry.email ?? t.unknown}
                      {isSelf && <span className="font-normal text-muted-foreground">{t.you}</span>}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {entry.identityMissing ? t.identityRemoved : entry.name ? entry.email : null}
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
                    {formatDate(entry.createdAt, locale)}
                  </td>
                  <td className="w-px px-2 py-2 text-right sm:px-3">
                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={t.actionsFor(label)}
                          className="inline-grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 data-popup-open:bg-accent data-popup-open:text-foreground pointer-coarse:size-11"
                        >
                          <MoreHorizontal className="size-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {confirmationsFor(entry, label, t).map((option) => (
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
