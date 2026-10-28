import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { labAvailable } from "@/features/editor-lab/availability";
import { PersistenceProbeHarness } from "@/features/persistence-probe/probe";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  if (!labAvailable()) notFound();
  return {
    title: (await getT("editorLab")).persistenceProbe.metaTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * The persistence probe (A2.3B.2D): the harness tests/lab/persistence-probe
 * uses to show, in a real browser on a real Next.js server, that the
 * authoritative read does not wait for a pending save. Development only, like
 * every address under /lab: the proxy answers 404 elsewhere, and this refuses
 * again first. The one exception to the lab persisting nothing: it writes,
 * then deletes, a disposable sermon it makes for each run, and nothing else.
 */
export default async function PersistenceProbePage() {
  if (!labAvailable()) notFound();
  await requireActiveUser();
  const t = (await getT("editorLab")).persistenceProbe;
  return (
    <div className="container-page max-w-7xl py-8 lg:py-10">
      <PageHeader title={t.title} description={t.description} />
      <PersistenceProbeHarness />
    </div>
  );
}
