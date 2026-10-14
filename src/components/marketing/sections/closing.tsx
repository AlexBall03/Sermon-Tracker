import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { sectionLead, sectionTitle } from "./shared";

/** Closing band: a hairline with a short gold rule on it, and no panel. */
export function Closing({ locale }: { locale: Locale }) {
  const t = dictionary(locale, "marketing").closing;
  return (
    <section id="access" aria-labelledby="access-heading" className="container-page pb-16 lg:pb-24">
      <div className="relative grid reveal gap-8 border-t pt-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16 lg:pt-14">
        <span aria-hidden className="absolute -top-px left-0 h-px w-14 bg-gold" />
        <div>
          <h2 id="access-heading" className={cn("max-w-2xl", sectionTitle)}>
            {t.title}
          </h2>
          <p className={sectionLead}>{t.body}</p>
        </div>
        <Link
          href={routes.signIn}
          className={buttonVariants({ size: "lg", className: "justify-self-start" })}
        >
          {t.signIn}
          <ArrowRight data-trailing aria-hidden />
        </Link>
      </div>
    </section>
  );
}
