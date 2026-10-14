/*
 * Which way of installing to describe. Browsers do not say whether they can
 * install an application, and a missing `beforeinstallprompt` proves nothing
 * (it is also missing once the application is installed), so the browser is
 * recognized only to choose which instructions to show. No server code.
 */

export type InstallGuide =
  /** Running as the installed application. */
  | "installed"
  /** Installed from this page a moment ago. */
  | "just-installed"
  /** The browser offered its own install prompt: a real button. */
  | "prompt"
  /** iPhone or iPad: Share, then Add to Home Screen. */
  | "ios"
  /** Safari on a Mac: File, then Add to Dock. */
  | "mac-safari"
  /** Android, in a browser that did not offer its prompt. */
  | "android"
  /** Chrome or Edge on a computer that did not offer its prompt. */
  | "desktop"
  /** A browser that cannot install applications (Firefox on a computer). */
  | "unsupported"
  /** Anything else: general directions. */
  | "unknown";

export type InstallContext = {
  userAgent: string;
  /** `navigator.maxTouchPoints`: an iPad says it is a Mac, but has a touch screen. */
  maxTouchPoints: number;
  standalone: boolean;
  canPrompt: boolean;
  justInstalled: boolean;
};

export function installGuide(context: InstallContext): InstallGuide {
  if (context.standalone) return "installed";
  if (context.justInstalled) return "just-installed";
  if (context.canPrompt) return "prompt";
  const ua = context.userAgent;
  const mac = /Macintosh/.test(ua);
  if (/iPhone|iPad|iPod/.test(ua) || (mac && context.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Firefox\//.test(ua)) return "unsupported";
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(ua);
  if (mac && /Safari\//.test(ua) && !chromium) return "mac-safari";
  if (chromium) return "desktop";
  return "unknown";
}
