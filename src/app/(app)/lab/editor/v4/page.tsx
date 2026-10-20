import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { labAvailable } from "@/features/editor-lab/availability";
import { EditorLabV4 } from "@/features/editor-lab/v4/components/editor-lab-v4";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  if (!labAvailable()) notFound();
  return { title: (await getT("editorLab")).v4.metaTitle, robots: { index: false, follow: false } };
}

/**
 * The schema v4 architecture-validation prototype, beside the v3 lab
 * (`/lab/editor`), which it leaves untouched. Development only, like every
 * address under /lab: the proxy answers 404 elsewhere, and this refuses
 * again first. It reads no account data and persists nothing.
 */
export default async function EditorLabV4Page() {
  if (!labAvailable()) notFound();
  await requireActiveUser();
  const t = (await getT("editorLab")).v4;
  return (
    <div className="container-page max-w-7xl py-8 lg:py-10">
      <PageHeader title={t.title} description={t.description} />
      <EditorLabV4 />
    </div>
  );
}
