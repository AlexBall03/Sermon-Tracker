"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Error boundary for application pages. Details stay in the server log. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = useT("navigation").error;
  return (
    <div className="container-page py-16">
      <div role="alert" className="mx-auto max-w-lg rounded-xl border bg-surface p-8 shadow-card">
        <h1 className="font-display text-2xl leading-snug font-medium">{t.title}</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">{t.detail}</p>
        <Button className="mt-6" onClick={reset}>
          {t.retry}
        </Button>
      </div>
    </div>
  );
}
