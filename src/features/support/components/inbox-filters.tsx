"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import { inboxSorts, ticketKinds, ticketSources, ticketStatuses } from "../model";
import { inboxSearch, type InboxQuery } from "../schemas";

const any = "any";

/**
 * The inbox's search, filters, and order. They live in the address (read by
 * `parseInboxQuery`), so a view can be reloaded or shared; a change always
 * goes back to the first page.
 */
export function InboxFilters({ query }: { query: InboxQuery }) {
  const t = useT("support");
  const router = useRouter();
  const [q, setQ] = useState(query.q);

  function apply(change: Partial<InboxQuery>) {
    router.push(`${routes.adminFeedback}${inboxSearch({ ...query, q, ...change, page: 1 })}`);
  }

  const pick = (value: string) => (value === any ? null : value);

  return (
    <div className="grid gap-4 rounded-xl border bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] lg:items-end">
      <form
        role="search"
        className="sm:col-span-2 lg:col-span-1"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: q.trim() });
        }}
      >
        <Label htmlFor="inbox-search">{t.admin.search}</Label>
        <div className="mt-2 flex gap-2">
          <Input
            id="inbox-search"
            type="search"
            value={q}
            placeholder={t.admin.searchPlaceholder}
            onChange={(event) => setQ(event.target.value)}
          />
          <Button type="submit" variant="outline" size="icon" aria-label={t.admin.search}>
            <Search aria-hidden />
          </Button>
        </div>
      </form>
      <Filter label={t.admin.kind}>
        <Select
          label={t.admin.kind}
          value={query.kind ?? any}
          onChange={(value) => apply({ kind: pick(value) as InboxQuery["kind"] })}
          options={[
            { value: any, label: t.admin.any },
            ...ticketKinds.map((kind) => ({ value: kind, label: t.kinds[kind] })),
          ]}
        />
      </Filter>
      <Filter label={t.admin.status}>
        <Select
          label={t.admin.status}
          value={query.status ?? any}
          onChange={(value) => apply({ status: pick(value) as InboxQuery["status"] })}
          options={[
            { value: any, label: t.admin.any },
            { value: "active", label: t.admin.active },
            ...ticketStatuses.map((status) => ({ value: status, label: t.statuses[status] })),
          ]}
        />
      </Filter>
      <Filter label={t.admin.source}>
        <Select
          label={t.admin.source}
          value={query.source ?? any}
          onChange={(value) => apply({ source: pick(value) as InboxQuery["source"] })}
          options={[
            { value: any, label: t.admin.any },
            ...ticketSources.map((source) => ({ value: source, label: t.sources[source] })),
          ]}
        />
      </Filter>
      <Filter label={t.admin.sort}>
        <Select
          label={t.admin.sort}
          value={query.sort}
          onChange={(value) => apply({ sort: value as InboxQuery["sort"] })}
          options={inboxSorts.map((sort) => ({ value: sort, label: t.admin.sorts[sort] }))}
        />
      </Filter>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p aria-hidden className="mb-2 text-sm leading-none font-medium">
        {label}
      </p>
      {children}
    </div>
  );
}
