"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Trash2 } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isStandalone } from "@/features/pwa/standalone";
import { SettingsBlock } from "@/features/settings/components/settings-section";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  setNotificationPreferences,
} from "../actions";

export type NotificationPreferences = {
  emailReplies: boolean;
  emailStatus: boolean;
  pushSupport: boolean;
};
export type PushDevice = { id: string; label: string; endpoint: string; createdAt: string };

type Support = "checking" | "supported" | "unsupported" | "ios-install";

/** What this browser can do with push. It does not change while the page is open. */
function pushSupport(): Support {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
    return "supported";
  }
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !isStandalone()
    ? "ios-install"
    : "unsupported";
}
const unchanging = () => () => {};

/** A short name for this device, from the browser's own description of itself. */
function deviceLabel() {
  const agent = navigator.userAgent;
  const os = /iPhone|iPad/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Mac/.test(agent)
        ? "macOS"
        : /Windows/.test(agent)
          ? "Windows"
          : /Linux/.test(agent)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : "Browser";
  return os ? `${browser} · ${os}` : browser;
}

function urlBase64ToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * Notifications' three cards, as every settings page sets them out: optional
 * email, push, and the devices that receive push. A switch saves the moment it
 * is pressed; permission is asked only when "Turn On" is pressed.
 */
export function NotificationSettings({
  preferences: initial,
  devices,
}: {
  preferences: NotificationPreferences;
  devices: PushDevice[];
}) {
  const t = useT("notifications").settings;
  const locale = useLocale();
  const router = useRouter();
  const [preferences, setPreferences] = useState(initial);
  const support = useSyncExternalStore(unchanging, pushSupport, (): Support => "checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (support !== "supported") return;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setEndpoint(subscription?.endpoint ?? null))
      .catch(() => undefined);
  }, [support]);

  function run(task: () => Promise<ActionResult>) {
    setResult(null);
    startTransition(async () => {
      const outcome = await task().catch((): ActionResult => ({ ok: false, message: t.failed }));
      setResult(outcome);
      router.refresh();
    });
  }

  function toggle(key: keyof NotificationPreferences, value: boolean) {
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    run(async () => {
      const outcome = await setNotificationPreferences({ [key]: value });
      if (!outcome.ok) setPreferences(previous);
      return outcome;
    });
  }

  function enable() {
    run(async () => {
      // Asked only here, because the person pressed the button.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { ok: false, message: t.denied };
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(vapidKey!),
        }));
      const json = subscription.toJSON();
      const outcome = await savePushSubscription({
        endpoint: subscription.endpoint,
        keys: json.keys,
        label: deviceLabel(),
      });
      if (outcome.ok) setEndpoint(subscription.endpoint);
      return outcome;
    });
  }

  function disable() {
    run(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const known = subscription?.endpoint ?? endpoint;
      await subscription?.unsubscribe().catch(() => false);
      setEndpoint(null);
      return known
        ? removePushSubscription({ endpoint: known })
        : { ok: true, message: t.disabled };
    });
  }

  const here = endpoint !== null && devices.some((device) => device.endpoint === endpoint);

  return (
    <>
      <SettingsBlock id="email" title={t.email} description={t.emailDescription}>
        <div className="space-y-5">
          <Switch
            label={t.emailReplies}
            checked={preferences.emailReplies}
            onChange={(value) => toggle("emailReplies", value)}
            disabled={busy}
          />
          <Switch
            label={t.emailStatus}
            checked={preferences.emailStatus}
            onChange={(value) => toggle("emailStatus", value)}
            disabled={busy}
          />
        </div>
      </SettingsBlock>

      <SettingsBlock id="push" title={t.push} description={t.pushDescription}>
        <div className="space-y-5">
          <Switch
            label={t.pushSupport}
            checked={preferences.pushSupport}
            onChange={(value) => toggle("pushSupport", value)}
            disabled={busy}
          />
          {!vapidKey ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{t.notConfigured}</p>
          ) : support === "ios-install" ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{t.iosInstall}</p>
          ) : support === "unsupported" ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{t.unsupported}</p>
          ) : support === "supported" ? (
            <div className="flex flex-wrap gap-2">
              {here ? (
                <Button variant="outline" onClick={disable} disabled={busy}>
                  {t.disable}
                </Button>
              ) : (
                <Button onClick={enable} disabled={busy}>
                  {t.enable}
                </Button>
              )}
              {devices.length > 0 && (
                <Button variant="outline" onClick={() => run(sendTestPush)} disabled={busy}>
                  {t.test}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </SettingsBlock>

      <SettingsBlock id="devices" title={t.devices}>
        {devices.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{t.noDevices}</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-surface">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center gap-3 px-4 py-3">
                <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {device.label}
                    {device.endpoint === endpoint && (
                      <span className="font-normal text-muted-foreground"> · {t.thisDevice}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                    {t.addedOn(formatDate(new Date(device.createdAt), locale))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t.removeFrom(device.label)}
                  disabled={busy}
                  onClick={() => run(() => removePushSubscription({ id: device.id }))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsBlock>

      <ActionStatus result={result} />
    </>
  );
}
