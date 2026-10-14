import { Suspense } from "react";
import type { Metadata } from "next";

import { Landing } from "@/components/marketing/landing";
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getT("marketing")).meta;
  return {
    // The whole title: the root layout's template is for the pages beneath this one.
    title: { absolute: t.title },
    description: t.description,
    alternates: { canonical: "/" },
  };
}

/**
 * The public landing page, in the visitor's language. Signed-in visitors
 * never see it: the proxy sends them from here to the dashboard.
 */
export default function HomePage() {
  // The language is known only per request, so the page waits behind its own boundary.
  return (
    <Suspense fallback={null}>
      <Localized />
    </Suspense>
  );
}

async function Localized() {
  return <Landing locale={await getLocale()} />;
}
