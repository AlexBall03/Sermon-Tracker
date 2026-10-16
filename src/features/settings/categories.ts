import {
  AppWindow,
  Bell,
  BookOpen,
  HardDriveDownload,
  Palette,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { routes } from "@/lib/site";

/**
 * Settings' categories, in the order they are always shown: the sidebar beside
 * every settings page and the overview's list both read this. Each is its own
 * page under `/settings`; their words are `settings.categories` in the
 * dictionary.
 */
export const settingsCategories = [
  { key: "profile", href: routes.settingsProfile, icon: UserRound },
  { key: "bible", href: routes.settingsBible, icon: BookOpen },
  { key: "appearance", href: routes.settingsAppearance, icon: Palette },
  { key: "app", href: routes.settingsApp, icon: AppWindow },
  { key: "offline", href: routes.settingsOffline, icon: HardDriveDownload },
  { key: "sync", href: routes.settingsSync, icon: RefreshCw },
  { key: "notifications", href: routes.settingsNotifications, icon: Bell },
  { key: "account", href: routes.settingsAccount, icon: ShieldCheck },
] as const;

export type SettingsCategory = (typeof settingsCategories)[number]["key"];

/**
 * Where an address the single settings page used to have (`/settings#install`,
 * from a notice, a bookmark, or an old link) is now. A hash never reaches the
 * server, so `LegacySettingsHash` reads it in the browser and replaces the
 * address with this; anything not listed stays on the overview.
 */
export const legacySettingsHashes: Record<string, string> = {
  personal: routes.settingsProfile,
  ministry: `${routes.settingsProfile}#ministry`,
  "bible-language": routes.settingsBible,
  appearance: routes.settingsAppearance,
  install: `${routes.settingsApp}#install`,
  offline: routes.settingsOffline,
  "offline-capture": `${routes.settingsOffline}#offline-capture`,
  "offline-bible": `${routes.settingsOffline}#offline-bible`,
  account: routes.settingsAccount,
};
