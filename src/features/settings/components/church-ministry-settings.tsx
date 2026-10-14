"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { updateProfile } from "@/features/preferences/actions";
import { profileLimits } from "@/features/preferences/model";
import type { StoredProfile } from "@/features/preferences/preferences";
import { profileSchemas } from "@/features/preferences/schemas";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { fieldErrors } from "../schemas";
import { TextField } from "./text-field";

/**
 * The person's church, what they do in ministry, and whether they attend
 * preaching class. All three are saved to the account, and all three are only
 * what the person says: the role is words and grants nothing, and attending
 * preaching class is never worked out from what they have recorded.
 *
 * The two lines are saved together with the button. The switch is saved the
 * moment it is pressed, shown at once, and put back if the server refuses it.
 */
export function ChurchMinistrySettings({ profile }: { profile: StoredProfile }) {
  const words = useT("settings");
  const t = words.ministry;
  const locale = useLocale();
  const [churchName, setChurchName] = useState(profile.churchName ?? "");
  const [ministryRole, setMinistryRole] = useState(profile.ministryRole ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  const [attends, setAttends] = useState(profile.attendsPreachingClass);
  const [switched, setSwitched] = useState<ActionResult | null>(null);
  const [switching, startSwitching] = useTransition();

  // The page is kept while another is open, and account setup saves the same three things.
  // A value that was saved from elsewhere replaces what this form holds of it, and only that.
  const [seen, setSeen] = useState(profile);
  // The two lines as last saved, which unsaved typing is measured against.
  const [baseline, setBaseline] = useState({
    churchName: profile.churchName ?? "",
    ministryRole: profile.ministryRole ?? "",
  });
  if (
    profile.churchName !== seen.churchName ||
    profile.ministryRole !== seen.ministryRole ||
    profile.attendsPreachingClass !== seen.attendsPreachingClass
  ) {
    setSeen(profile);
    setBaseline({ churchName: profile.churchName ?? "", ministryRole: profile.ministryRole ?? "" });
    if (profile.churchName !== seen.churchName) setChurchName(profile.churchName ?? "");
    if (profile.ministryRole !== seen.ministryRole) setMinistryRole(profile.ministryRole ?? "");
    if (profile.attendsPreachingClass !== seen.attendsPreachingClass) {
      setAttends(profile.attendsPreachingClass);
    }
  }

  // Typed lines not yet saved are held: leaving for another settings page asks first.
  const dirty =
    churchName.trim() !== baseline.churchName || ministryRole.trim() !== baseline.ministryRole;
  const guard = useLeaveGuard(dirty && !saving, words.unsaved, () => {
    setChurchName(baseline.churchName);
    setMinistryRole(baseline.ministryRole);
    setErrors({});
  });

  const offline: ActionResult = { ok: false, message: t.offline };

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = profileSchemas(locale).profileUpdate.safeParse({ churchName, ministryRole });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setResult(null);
      return;
    }
    setErrors({});
    setResult(null);
    startSaving(async () => {
      const outcome = await updateProfile(parsed.data).catch(() => offline);
      if (outcome.ok) {
        setBaseline({
          churchName: parsed.data.churchName ?? "",
          ministryRole: parsed.data.ministryRole ?? "",
        });
        // As they were saved: tidied, and empty where they were cleared.
        setChurchName(parsed.data.churchName ?? "");
        setMinistryRole(parsed.data.ministryRole ?? "");
      }
      setResult(outcome);
    });
  }

  function switchAttendance(next: boolean) {
    setAttends(next);
    setSwitched(null);
    startSwitching(async () => {
      const outcome = await updateProfile({ attendsPreachingClass: next }).catch(() => offline);
      if (!outcome.ok) setAttends(!next);
      setSwitched(outcome);
    });
  }

  return (
    <>
      {guard.dialog}
      <form onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="church-name"
            name="churchName"
            label={`${t.churchName} ${t.optional}`}
            placeholder={t.churchNamePlaceholder}
            autoComplete="organization"
            value={churchName}
            onChange={(event) => setChurchName(event.target.value)}
            error={errors.churchName}
            maxLength={profileLimits.churchName}
          />
          <TextField
            id="ministry-role"
            name="ministryRole"
            label={`${t.ministryRole} ${t.optional}`}
            placeholder={t.ministryRolePlaceholder}
            autoComplete="off"
            value={ministryRole}
            onChange={(event) => setMinistryRole(event.target.value)}
            error={errors.ministryRole}
            hint={t.ministryRoleHint}
            maxLength={profileLimits.ministryRole}
          />
        </div>
        <Button type="submit" className="mt-5" disabled={saving} aria-busy={saving}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden />}
          {saving ? t.saving : t.save}
        </Button>
        <ActionStatus result={result} />
      </form>

      <div aria-busy={switching}>
        <Switch
          label={t.preachingClass}
          description={t.preachingClassHelp}
          checked={attends}
          onChange={switchAttendance}
          disabled={switching}
        />
        <ActionStatus result={switched} />
      </div>
    </>
  );
}
