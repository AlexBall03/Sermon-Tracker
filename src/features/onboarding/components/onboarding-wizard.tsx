"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Layers,
  Lightbulb,
  List,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";

import { useThemeChoice } from "@/components/layout/theme-toggle";
import { ActionStatus } from "@/components/ui/action-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { updateProfile } from "@/features/preferences/actions";
import { profileLimits } from "@/features/preferences/model";
import type { StoredProfile } from "@/features/preferences/preferences";
import type { Preferences } from "@/features/preferences/resolve";
import { profileSchemas } from "@/features/preferences/schemas";
import { LanguageSettings } from "@/features/settings/components/language-settings";
import { TextField } from "@/features/settings/components/text-field";
import { fieldErrors } from "@/features/settings/schemas";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { advanceOnboarding, finishOnboarding } from "../actions";
import {
  firstOnboardingStep,
  onboardingSteps,
  stepAfter,
  stepBefore,
  type OnboardingStep,
} from "../model";

type OnboardingWizardProps = {
  /**
   * `required` is a new account's first-time setup: its progress is kept on
   * the account and it ends by finishing setup. `review` is an account that
   * owes no setup going through the same steps from Settings: it may leave at
   * any point, and its progress and its status are never written.
   */
  mode: "required" | "review";
  /** The step to open on: the furthest a new account reached. */
  initialStep?: OnboardingStep;
  profile: StoredProfile;
  preferences: Preferences;
  /** Ends the session, for an account that would rather not go on now. */
  signOut?: React.ReactNode;
};

/** One icon to each line of the welcome step, in the dictionary's order. */
const featureIcons: LucideIcon[] = [Lightbulb, Layers, BookOpen, List, CalendarCheck];

const themes = ["system", "light", "dark"] as const;
type Theme = (typeof themes)[number];

const subscribe = () => () => {};

/**
 * The four steps of account setup. What is typed stays in the browser until a
 * step is left with Continue: then it is saved, through the same actions
 * Settings uses, and only when that has succeeded is the next step recorded
 * and shown. A save that fails leaves the step and what was typed as they
 * were. Back never saves and never moves what is recorded.
 */
export function OnboardingWizard({
  mode,
  initialStep = firstOnboardingStep,
  profile,
  preferences,
  signOut,
}: OnboardingWizardProps) {
  const t = useT("onboarding");
  const locale = useLocale();
  const router = useRouter();
  const required = mode === "required";

  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [result, setResult] = useState<ActionResult | null>(null);
  // Plain state, not a transition: the step and the end of waiting must change together.
  const [pending, setPending] = useState(false);
  // Stays true once the dashboard has been asked for, so the button cannot be pressed twice.
  const [leaving, setLeaving] = useState(false);

  const [churchName, setChurchName] = useState(profile.churchName ?? "");
  const [ministryRole, setMinistryRole] = useState(profile.ministryRole ?? "");
  const [attends, setAttends] = useState(profile.attendsPreachingClass);
  // What the account holds, as last saved from here, so an unchanged step is not sent again.
  const [saved, setSaved] = useState(profile);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // The page is kept while another is open, and Settings saves the same three things. A
  // value that was saved from elsewhere replaces what this step holds of it, and only that.
  const [seen, setSeen] = useState(profile);
  if (
    profile.churchName !== seen.churchName ||
    profile.ministryRole !== seen.ministryRole ||
    profile.attendsPreachingClass !== seen.attendsPreachingClass
  ) {
    setSeen(profile);
    setSaved(profile);
    if (profile.churchName !== seen.churchName) setChurchName(profile.churchName ?? "");
    if (profile.ministryRole !== seen.ministryRole) setMinistryRole(profile.ministryRole ?? "");
    if (profile.attendsPreachingClass !== seen.attendsPreachingClass) {
      setAttends(profile.attendsPreachingClass);
    }
  }

  const offline: ActionResult = { ok: false, message: t.actions.offline };

  // A new step is announced by moving to its heading; the first one is left to the page.
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    heading.current?.focus();
  }, [step]);

  /** One thing on its way to the server at a time. */
  function run(work: () => Promise<void>) {
    setPending(true);
    void work().finally(() => setPending(false));
  }

  function show(next: OnboardingStep) {
    setResult(null);
    setErrors({});
    setStep(next);
  }

  /** Records the step on a new account. An account that owes no setup has nothing to record. */
  async function record(next: OnboardingStep): Promise<boolean> {
    if (!required) return true;
    const outcome = await advanceOnboarding(next).catch(() => offline);
    if (!outcome.ok) setResult(outcome);
    return outcome.ok;
  }

  function goOn() {
    const next = stepAfter(step);
    setResult(null);
    run(async () => {
      if (await record(next)) show(next);
    });
  }

  function saveMinistry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = profileSchemas(locale).profileUpdate.safeParse({
      churchName,
      ministryRole,
      attendsPreachingClass: attends,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setResult(null);
      return;
    }
    setErrors({});
    setResult(null);
    const next: StoredProfile = {
      churchName: parsed.data.churchName ?? null,
      ministryRole: parsed.data.ministryRole ?? null,
      attendsPreachingClass: attends,
    };
    const changed =
      next.churchName !== saved.churchName ||
      next.ministryRole !== saved.ministryRole ||
      next.attendsPreachingClass !== saved.attendsPreachingClass;

    run(async () => {
      if (changed) {
        const outcome = await updateProfile(parsed.data).catch(() => offline);
        if (!outcome.ok) {
          setResult(outcome);
          return;
        }
        setSaved(next);
        // As they were saved: tidied, and empty where they were cleared.
        setChurchName(next.churchName ?? "");
        setMinistryRole(next.ministryRole ?? "");
      }
      if (await record("preferences")) show("preferences");
    });
  }

  function finish() {
    setResult(null);
    run(async () => {
      const outcome = await finishOnboarding().catch(() => offline);
      if (!outcome.ok) {
        setResult(outcome);
        return;
      }
      setLeaving(true);
      router.replace(routes.dashboard);
    });
  }

  const busy = pending || leaving;
  const index = onboardingSteps.indexOf(step);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-12">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-muted-foreground">
          {t.progress.position(index + 1, onboardingSteps.length)}
        </p>
        {required ? (
          signOut
        ) : (
          <Link
            href={routes.settings}
            className={buttonVariants({ variant: "ghost", size: "sm", className: "-mr-3" })}
          >
            {t.exit}
          </Link>
        )}
      </div>

      <nav aria-label={t.progress.label} className="mt-3">
        <ol className="grid grid-cols-4 gap-2">
          {onboardingSteps.map((name, position) => (
            <li key={name} aria-current={position === index ? "step" : undefined}>
              <span
                aria-hidden
                className={cn(
                  "block h-1 rounded-full transition-colors duration-300",
                  position <= index ? "bg-primary" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "mt-2 block truncate text-[0.8125rem] font-medium max-sm:sr-only",
                  position === index ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t.steps[name]}
                {position < index && <span className="sr-only">. {t.progress.done}</span>}
                {position === index && <span className="sr-only">. {t.progress.current}</span>}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-6 rounded-xl border bg-surface p-6 shadow-raised sm:mt-8 sm:p-10">
        {/* Keyed by step, so each one arrives rather than replacing the last in place. */}
        <div key={step} className="animate-rise" aria-busy={busy}>
          {step === "welcome" && (
            <>
              <p className="text-[0.8125rem] font-semibold text-primary">{t.welcome.eyebrow}</p>
              <StepHeading ref={heading} className="mt-3">
                {t.welcome.title}
              </StepHeading>
              <StepBody>{t.welcome.body}</StepBody>
              <ul className="mt-7 space-y-4">
                {t.welcome.features.map((feature, position) => {
                  const Icon = featureIcons[position] ?? Lightbulb;
                  return (
                    <li key={feature.title} className="flex gap-3.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-secondary text-muted-foreground">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{feature.title}</span>
                        <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                          {feature.body}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-7 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
                {t.welcome.outlineNote}
              </p>
              <ActionStatus result={result} />
              <StepActions note={t.welcome.lead}>
                <Button size="lg" onClick={goOn} disabled={busy} aria-busy={busy}>
                  {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                  {t.welcome.start}
                  {!busy && <ArrowRight data-trailing aria-hidden />}
                </Button>
              </StepActions>
            </>
          )}

          {step === "ministry" && (
            <form onSubmit={saveMinistry} noValidate>
              <StepHeading ref={heading}>{t.ministry.title}</StepHeading>
              <StepBody>{t.ministry.body}</StepBody>
              <MinistryFields
                churchName={churchName}
                ministryRole={ministryRole}
                attends={attends}
                errors={errors}
                disabled={busy}
                onChurchName={setChurchName}
                onMinistryRole={setMinistryRole}
                onAttends={setAttends}
              />
              <ActionStatus result={result} />
              <StepActions>
                <BackButton onClick={() => show(stepBefore(step))} disabled={busy} />
                <Button type="submit" disabled={busy} aria-busy={busy}>
                  {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                  {busy ? t.saving : t.continue}
                </Button>
              </StepActions>
            </form>
          )}

          {step === "preferences" && (
            <>
              <StepHeading ref={heading}>{t.preferences.title}</StepHeading>
              <StepBody>{t.preferences.body}</StepBody>
              <div className="mt-7 space-y-8">
                <section aria-labelledby="onboarding-language">
                  <h3 id="onboarding-language" className="text-[0.9375rem] font-semibold">
                    {t.preferences.language}
                  </h3>
                  <div className="mt-4">
                    <LanguageSettings
                      // Its own controls start again from what was saved whenever that changes.
                      key={`${preferences.stored.locale}.${preferences.stored.bibleTranslation}.${preferences.spanishEnabled}`}
                      preferences={preferences}
                    />
                  </div>
                </section>
                <section aria-labelledby="onboarding-appearance" className="border-t pt-7">
                  <h3 id="onboarding-appearance" className="text-[0.9375rem] font-semibold">
                    {t.preferences.appearance}
                  </h3>
                  <ThemeChoice />
                </section>
              </div>
              <ActionStatus result={result} />
              <StepActions>
                <BackButton onClick={() => show(stepBefore(step))} disabled={busy} />
                <Button onClick={goOn} disabled={busy} aria-busy={busy}>
                  {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                  {busy ? t.saving : t.continue}
                </Button>
              </StepActions>
            </>
          )}

          {step === "finish" && (
            <>
              <StepHeading ref={heading}>{t.finish.title}</StepHeading>
              <StepBody>{required ? t.finish.body : t.finish.reviewBody}</StepBody>
              <ActionStatus result={result} />
              <StepActions>
                <BackButton onClick={() => show(stepBefore(step))} disabled={busy} />
                {required ? (
                  <Button size="lg" onClick={finish} disabled={busy} aria-busy={busy}>
                    {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                    {busy ? t.finish.opening : t.finish.open}
                    {!busy && <ArrowRight data-trailing aria-hidden />}
                  </Button>
                ) : (
                  <div className="flex flex-wrap justify-end gap-3">
                    <Link href={routes.settings} className={buttonVariants({ variant: "outline" })}>
                      {t.finish.settings}
                    </Link>
                    <Link href={routes.dashboard} className={buttonVariants()}>
                      {t.finish.open}
                      <ArrowRight data-trailing aria-hidden />
                    </Link>
                  </div>
                )}
              </StepActions>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepHeading({
  ref,
  className,
  children,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      ref={ref}
      tabIndex={-1}
      className={cn(
        "font-display text-[1.625rem] leading-tight font-medium tracking-[-0.015em] text-balance outline-none sm:text-[1.875rem]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function StepBody({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/** The step's ways on: Back at the start, the main action at the end. */
function StepActions({ note, children }: { note?: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t pt-6">
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {children}
    </div>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const t = useT("onboarding");
  return (
    <Button type="button" variant="ghost" onClick={onClick} disabled={disabled} className="-ml-3">
      <ArrowLeft aria-hidden />
      {t.back}
    </Button>
  );
}

type MinistryFieldsProps = {
  churchName: string;
  ministryRole: string;
  attends: boolean;
  errors: Record<string, string>;
  disabled: boolean;
  onChurchName: (value: string) => void;
  onMinistryRole: (value: string) => void;
  onAttends: (value: boolean) => void;
};

/**
 * The same three things Settings asks, in the same words. Here nothing is
 * saved as it is typed or switched: the step saves them together.
 */
function MinistryFields({
  churchName,
  ministryRole,
  attends,
  errors,
  disabled,
  onChurchName,
  onMinistryRole,
  onAttends,
}: MinistryFieldsProps) {
  const t = useT("settings").ministry;
  return (
    <div className="mt-7 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="onboarding-church-name"
          name="churchName"
          label={`${t.churchName} ${t.optional}`}
          placeholder={t.churchNamePlaceholder}
          autoComplete="organization"
          value={churchName}
          onChange={(event) => onChurchName(event.target.value)}
          error={errors.churchName}
          maxLength={profileLimits.churchName}
          disabled={disabled}
        />
        <TextField
          id="onboarding-ministry-role"
          name="ministryRole"
          label={`${t.ministryRole} ${t.optional}`}
          placeholder={t.ministryRolePlaceholder}
          autoComplete="off"
          value={ministryRole}
          onChange={(event) => onMinistryRole(event.target.value)}
          error={errors.ministryRole}
          hint={t.ministryRoleHint}
          maxLength={profileLimits.ministryRole}
          disabled={disabled}
        />
      </div>
      <Switch
        label={t.preachingClass}
        description={t.preachingClassHelp}
        checked={attends}
        onChange={onAttends}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Following the device, light, or dark: the same stored choice as the bar's
 * control and the one in Settings. Kept in the browser, never on the account.
 */
function ThemeChoice() {
  const t = useT("onboarding").preferences;
  const { theme } = useTheme();
  const { choose } = useThemeChoice();
  // The stored choice is unknown on the server.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const value = mounted && themes.includes(theme as Theme) ? (theme as Theme) : "system";

  return (
    <div className="mt-4">
      <Segmented
        label={t.appearance}
        hideLabel
        name="onboarding-theme"
        options={themes.map((option) => ({ value: option, label: t.theme[option] }))}
        value={value}
        onChange={choose}
        className="max-w-xs"
      />
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.appearanceHelp}</p>
    </div>
  );
}
