"use client";

import { useState, useTransition } from "react";

import { ActionStatus } from "@/components/ui/action-status";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { setBibleTranslation, setLocale } from "@/features/preferences/actions";
import type { Preferences } from "@/features/preferences/resolve";
import {
  defaultTranslationFor,
  translations,
  type TranslationId,
} from "@/features/scripture/translations";
import { useT } from "@/i18n/client";
import { localeNames, locales, type Locale } from "@/i18n/locales";
import type { ActionResult } from "@/lib/action-result";

/** The translation is not chosen, and follows the interface language. */
const follow = "follow";

/**
 * The interface language and the Bible translation. Unlike the settings
 * beside them these are saved to the account, so they follow the person to
 * every device.
 *
 * Choosing a language brings its translation with it, and the translation can
 * then be chosen on its own: the interface can be in English with the Bible in
 * Spanish. A chosen translation stays until the language is changed again.
 *
 * While an administrator has Spanish switched off there is nothing to choose
 * between, and this says so; what was saved is kept.
 */
export function LanguageSettings({ preferences }: { preferences: Preferences }) {
  const t = useT("settings").language;
  const { stored, spanishEnabled } = preferences;
  // Shown as chosen at once; the server's answer follows, and a refusal puts it back.
  const [locale, setChosenLocale] = useState<Locale>(stored.locale);
  const [translation, setChosenTranslation] = useState<TranslationId | null>(
    stored.bibleTranslation,
  );
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!spanishEnabled) {
    return (
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{t.unavailable}</p>
    );
  }

  function run(action: () => Promise<ActionResult>, undo: () => void) {
    setResult(null);
    startTransition(async () => {
      const outcome = await action().catch(() => ({ ok: false, message: t.offline }));
      if (!outcome.ok) undo();
      setResult(outcome);
    });
  }

  function chooseLocale(next: Locale) {
    if (next === locale) return;
    const before = { locale, translation };
    setChosenLocale(next);
    // The translation goes with the language, as the server will save it.
    setChosenTranslation(null);
    run(
      () => setLocale(next),
      () => {
        setChosenLocale(before.locale);
        setChosenTranslation(before.translation);
      },
    );
  }

  function chooseTranslation(value: string) {
    const before = translation;
    const next = value === follow ? null : (value as TranslationId);
    setChosenTranslation(next);
    run(
      () => setBibleTranslation(next),
      () => setChosenTranslation(before),
    );
  }

  return (
    <div className="space-y-7" aria-busy={pending}>
      <div>
        <Segmented
          label={t.interface}
          name="interface-language"
          options={locales.map((value) => ({ value, label: localeNames[value] }))}
          value={locale}
          onChange={chooseLocale}
          disabled={pending}
          className="max-w-xs"
        />
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t.interfaceHelp}
        </p>
      </div>

      <div>
        <p id="bible-translation-label" className="mb-2 text-sm leading-none font-medium">
          {t.translation}
        </p>
        <Select
          label={t.translation}
          value={translation ?? follow}
          onChange={chooseTranslation}
          disabled={pending}
          options={[
            { value: follow, label: t.follow(translations[defaultTranslationFor(locale)].short) },
            ...preferences.translations.map((id) => ({
              value: id,
              label: `${translations[id].short} · ${translations[id].name}`,
            })),
          ]}
          className="w-full max-w-xs"
        />
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t.translationHelp}
        </p>
      </div>

      <ActionStatus result={result} />
    </div>
  );
}
