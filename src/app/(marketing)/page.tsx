import type { Metadata } from "next";

import { AppPreview } from "@/components/marketing/app-preview";
import { BetaNotice } from "@/components/marketing/beta-notice";
import { Capabilities } from "@/components/marketing/capabilities";
import { Hero } from "@/components/marketing/hero";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Phase 1B: signed-in visitors are redirected from here to /dashboard.
export default function HomePage() {
  return (
    <>
      <Hero />
      <Capabilities />
      <AppPreview />
      <BetaNotice />
    </>
  );
}
