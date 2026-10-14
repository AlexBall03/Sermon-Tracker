import type { Metadata } from "next";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { FeedbackForm } from "@/features/support/components/feedback-form";
import { appTicketKinds, type TicketKind } from "@/features/support/model";
import { getT } from "@/i18n/server";
import { isBlobConfigured } from "@/lib/env";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("support")).compose.metaTitle };
}

/**
 * A new message to the team. `?kind=bug` opens it on a kind; `?from=/path`
 * names the page it was reported from, and only an address within the
 * application is kept.
 */
export default async function NewSupportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireActiveUser();
  const params = (await searchParams) ?? {};
  const asked = typeof params.kind === "string" ? params.kind : "";
  const kind: TicketKind = (appTicketKinds as readonly string[]).includes(asked)
    ? (asked as TicketKind)
    : "bug";
  const from =
    typeof params.from === "string" && /^\/(?!\/)\S*$/.test(params.from) ? params.from : null;
  const t = await getT("support");

  return (
    <div className="container-page max-w-3xl py-10 lg:py-12">
      <BackLink href={routes.support}>{t.compose.back}</BackLink>
      <PageHeader title={t.compose.title} description={t.compose.description} />
      <div className="mt-8">
        <FeedbackForm initialKind={kind} from={from} screenshots={isBlobConfigured()} />
      </div>
    </div>
  );
}
