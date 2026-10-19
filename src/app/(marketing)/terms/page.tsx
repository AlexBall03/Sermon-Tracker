import { Suspense } from "react";
import type { Metadata } from "next";

import { LegalPage } from "../legal-page";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getT("legal")).terms;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: { canonical: routes.terms },
  };
}

export default function TermsPage() {
  return (
    <Suspense fallback={null}>
      <LegalPage document="terms" />
    </Suspense>
  );
}
