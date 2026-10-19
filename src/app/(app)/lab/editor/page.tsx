import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { labAvailable } from "@/features/editor-lab/availability";
import { EditorLab } from "@/features/editor-lab/components/editor-lab";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  if (!labAvailable()) notFound();
  return { title: (await getT("editorLab")).metaTitle, robots: { index: false, follow: false } };
}

/**
 * The development-only editor lab (PS-1A). Outside development the proxy has
 * already answered 404; this refuses again before anything else, as defense
 * in depth. It reads no account data and persists nothing: fixtures only.
 */
export default async function EditorLabPage() {
  if (!labAvailable()) notFound();
  await requireActiveUser();
  const t = await getT("editorLab");
  return (
    <div className="container-page max-w-7xl py-8 lg:py-10">
      <PageHeader title={t.title} description={t.description} />
      <EditorLab />
    </div>
  );
}
