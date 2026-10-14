import { LogoMark } from "@/components/brand/logo-mark";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { DashboardPhone } from "../preview/dashboard-preview";
import { Preview } from "../preview/frames";
import { sectionLead, sectionTitle } from "./shared";

/**
 * The application installed on a phone: the dashboard further down the page
 * than the hero showed it, its icon as a home screen has it, and how to
 * install it from the browser. The installed application is the signed-in
 * workspace; this page is never what it opens on.
 */
export function MobileApp({ locale }: { locale: Locale }) {
  const t = dictionary(locale, "marketing").mobile;
  return (
    <section id="mobile-app" aria-labelledby="mobile-heading" className="overflow-x-clip">
      <div className="container-page grid items-center gap-x-16 gap-y-12 py-14 lg:grid-cols-2 lg:py-20">
        <div className="reveal lg:order-2">
          <h2 id="mobile-heading" className={sectionTitle}>
            {t.title}
          </h2>
          <p className={sectionLead}>{t.body}</p>

          <h3 className="mt-9 text-[1.0625rem] font-semibold tracking-[-0.015em]">
            {t.stepsTitle}
          </h3>
          <ol className="mt-4 max-w-xl divide-y border-y">
            {t.steps.map((step, index) => (
              <li key={step} className="flex gap-4 py-3.5 text-[0.9375rem] leading-relaxed">
                <span
                  aria-hidden
                  className="w-4 shrink-0 font-serif text-lg leading-[1.45] text-gold-ink italic"
                >
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {t.signedIn}
          </p>
        </div>

        <Preview description={t.alt} className="reveal">
          <div className="relative mx-auto w-fit">
            <DashboardPhone locale={locale} part="lower" />
            {/* The icon as a home screen shows it: beside the phone, or under it where there is no room. */}
            <div className="mx-auto mt-5 flex w-fit stagger flex-col items-center gap-2 rounded-2xl border bg-surface-raised px-4 pt-4 pb-3 shadow-raised sm:absolute sm:-right-24 sm:bottom-24 sm:mt-0">
              <LogoMark className="size-14 rounded-[0.875rem] shadow-card" />
              <span className="text-xs font-medium">{t.iconLabel}</span>
            </div>
          </div>
        </Preview>
      </div>
    </section>
  );
}
