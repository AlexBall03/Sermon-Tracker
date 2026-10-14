"use client";

import { useState, useSyncExternalStore } from "react";
import { CircleCheck, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Dictionaries } from "@/i18n";
import { useT } from "@/i18n/client";
import { installGuide, type InstallGuide } from "../install";
import { promptInstall, usePwa } from "../pwa";

const subscribe = () => () => {};
type Browser = { userAgent: string; maxTouchPoints: number };
let browser: Browser | null = null;
// One object for the page's life: a snapshot must be the same value each time it is read.
const browserOf = () =>
  (browser ??= { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 });

/**
 * Installing the application, in Settings. A real button only where the
 * browser offered its own prompt; elsewhere, the steps for the browser in
 * use. Once running installed it says so and offers nothing. This is the one
 * place installing is offered: no banner asks anywhere else.
 */
export function InstallAppSettings() {
  const t = useT("pwa").install;
  const pwa = usePwa();
  // The browser is only known in the browser; nothing is drawn until it is.
  const device = useSyncExternalStore(subscribe, browserOf, () => null);
  const [busy, setBusy] = useState(false);

  if (!device) return <div className="min-h-10" aria-hidden />;
  const guide = installGuide({ ...device, ...pwa });

  if (guide === "installed" || guide === "just-installed") {
    return (
      <p className="flex items-start gap-2 text-sm leading-relaxed" role="status">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {guide === "installed" ? t.installed : t.justInstalled}
      </p>
    );
  }

  if (guide === "prompt") {
    return (
      <div>
        <Button
          variant="outline"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={async () => {
            setBusy(true);
            try {
              await promptInstall();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download aria-hidden />
          {busy ? t.installing : t.button}
        </Button>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.signIn}</p>
      </div>
    );
  }

  if (guide === "unsupported") {
    return <p className="text-sm leading-relaxed text-muted-foreground">{t.unsupported}</p>;
  }

  const steps = stepsFor(guide, t.guides);
  return (
    <div>
      {pwa.declined && (
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground" role="status">
          {t.dismissed}
        </p>
      )}
      <ol aria-label={t.stepsLabel} className="max-w-xl divide-y border-y">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 py-2.5 text-sm leading-relaxed">
            <span
              aria-hidden
              className="w-4 shrink-0 font-medium text-muted-foreground tabular-nums"
            >
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.signIn}</p>
    </div>
  );
}

type Guides = Dictionaries["pwa"]["install"]["guides"];

function stepsFor(guide: InstallGuide, guides: Guides): readonly string[] {
  switch (guide) {
    case "ios":
      return guides.ios;
    case "mac-safari":
      return guides.macSafari;
    case "android":
      return guides.android;
    case "desktop":
      return guides.desktop;
    default:
      return guides.unknown;
  }
}
