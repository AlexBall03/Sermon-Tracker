import { Suspense } from "react";
import type { Metadata } from "next";
import { Mail } from "lucide-react";

import { sectionLead, sectionTitle } from "@/components/marketing/sections/shared";
import { ContactForm } from "@/features/support/components/contact-form";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getT("support")).contact;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: { canonical: routes.contact },
  };
}

/**
 * The public contact form, for anyone. It says nothing about the
 * administrators or who reads it, and shows nothing that was sent before:
 * a message goes in and only the confirmation comes out. Accounts are pointed
 * to Help & Feedback, where they can follow replies.
 */
export default function ContactPage() {
  return (
    <Suspense fallback={null}>
      <Localized />
    </Suspense>
  );
}

async function Localized() {
  const t = (await getT("support")).contact;
  return (
    <div className="container-page grid gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div className="max-w-md">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Mail className="size-4" aria-hidden />
          {t.eyebrow}
        </p>
        <h1 className={`mt-4 ${sectionTitle}`}>{t.title}</h1>
        <p className={sectionLead}>{t.description}</p>
      </div>
      <div className="min-w-0">
        <ContactForm />
      </div>
    </div>
  );
}
