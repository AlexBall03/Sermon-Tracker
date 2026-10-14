import { Check } from "lucide-react";

import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { DashboardPhone, DashboardWindow } from "../preview/dashboard-preview";
import { Preview } from "../preview/frames";
import { LibraryWindow } from "../preview/library-preview";
import { OutlineWindow } from "../preview/outline-preview";
import { BiblePhone, PreachingPhone } from "../preview/phone-previews";
import { Cropped, sectionLead, sectionTitle } from "./shared";

type Copy = { name: string; title: string; body: string; points: string[]; alt: string };

/** A window in a feature row: drawn at a desktop's width, scaled, and cropped at the right. */
const featureWindow = "w-[62rem] [zoom:0.7]";

/**
 * One capability: what it is in words, and the screen it is on. A window
 * sits to the right of its words and a phone to the left of them, so the two
 * devices alternate down the page; on a narrow screen each follows its words.
 */
function Feature({
  copy,
  phone = false,
  children,
}: {
  copy: Copy;
  /** The screen is a phone, set on the other side. */
  phone?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-x-16 gap-y-10 lg:grid-cols-12">
      <div className={cn("reveal", phone ? "lg:order-2 lg:col-span-7" : "lg:col-span-5")}>
        <p className="text-sm font-semibold text-primary">{copy.name}</p>
        <h3 className="mt-2 font-display text-[1.625rem] leading-tight font-medium tracking-[-0.015em] text-balance sm:text-[2rem]">
          {copy.title}
        </h3>
        <p className={sectionLead}>{copy.body}</p>
        <ul className="mt-5 space-y-2.5">
          {copy.points.map((point) => (
            <li key={point} className="flex gap-2.5 text-[0.9375rem] leading-relaxed">
              <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("min-w-0 reveal", phone ? "lg:col-span-5" : "lg:col-span-7")}>
        {children}
      </div>
    </div>
  );
}

/**
 * What the application does, each with its screen reconstructed. The windows
 * and the phones are both here at every width: a visitor on a computer sees
 * the application on a phone, and one on a phone sees it on a computer.
 */
export function Features({ locale }: { locale: Locale }) {
  const t = dictionary(locale, "marketing").features;
  return (
    // Clipped sideways: on a narrow screen the windows run out to the screen's edge.
    <section id="features" aria-labelledby="features-heading" className="overflow-x-clip">
      <div className="container-page py-14 lg:py-20">
        <div className="max-w-2xl reveal">
          <h2 id="features-heading" className={sectionTitle}>
            {t.title}
          </h2>
          <p className={sectionLead}>{t.body}</p>
        </div>

        <div className="mt-12 space-y-20 lg:mt-16 lg:space-y-28">
          <Feature copy={t.library}>
            <Preview description={t.library.alt}>
              <Cropped>
                <LibraryWindow locale={locale} className={featureWindow} />
              </Cropped>
            </Preview>
          </Feature>

          <Feature copy={t.bible} phone>
            <Preview description={t.bible.alt}>
              <BiblePhone locale={locale} className="mx-auto" />
            </Preview>
          </Feature>

          <Feature copy={t.outlines}>
            <Preview description={t.outlines.alt}>
              <Cropped>
                <OutlineWindow locale={locale} className={featureWindow} />
              </Cropped>
            </Preview>
          </Feature>

          <Feature copy={t.preaching} phone>
            <Preview description={t.preaching.alt}>
              <PreachingPhone locale={locale} className="mx-auto" />
            </Preview>
          </Feature>

          {/* The hero showed one device's dashboard; this shows the other's. */}
          <Feature copy={t.dashboard}>
            <Preview description={t.dashboard.alt}>
              <DashboardPhone locale={locale} className="mx-auto max-md:hidden" />
              <Cropped className="md:hidden">
                <DashboardWindow locale={locale} className="w-[72rem] [zoom:0.62]" />
              </Cropped>
            </Preview>
          </Feature>
        </div>
      </div>
    </section>
  );
}
