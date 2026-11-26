/*
 * Microphone permission helpers for the app view: which browser the visitor
 * is in (the steps to unblock the mic differ per browser and platform) and
 * what the browser reports about the permission.
 *
 * A page can't unblock the mic itself. iOS Safari refuses without a prompt
 * once the visitor tapped "Don't Allow" (until a reload), when the site or
 * Safari is set to Deny, and in many in-app browsers (MIT, Nov 2026).
 */

export type MicBrowser =
  | "ios-safari"
  | "ios-chrome"
  | "ios-firefox"
  | "android-chrome"
  | "android-firefox"
  | "desktop-chrome"
  | "desktop-safari"
  | "desktop-firefox"
  | "in-app"
  | "other";

export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

/** blocked = refused (unblock in settings); dismissed = the prompt was closed
 * (tap Start again); unavailable = no mic or it's in use (e.g. a call) */
export type MicProblem = "blocked" | "dismissed" | "unavailable";

// social and messaging apps that open links in their own browser
const IN_APP =
  /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|GSA\/|Snapchat|musical_ly|BytedanceWebview|TikTok|Twitter|Pinterest|WhatsApp|MicroMessenger/i;

export function detectMicBrowser(
  ua: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints ?? 0,
): MicBrowser {
  if (IN_APP.test(ua)) return "in-app";

  // iPadOS reports itself as a Mac; touch points give it away
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (ios) {
    if (/CriOS/.test(ua)) return "ios-chrome";
    if (/FxiOS/.test(ua)) return "ios-firefox";
    // other iOS browsers keep the Safari token; an app's web view drops it
    if (!/Safari\//.test(ua)) return "in-app";
    if (/EdgiOS|OPiOS|DuckDuckGo/.test(ua)) return "other";
    return "ios-safari";
  }

  if (/Android/.test(ua)) {
    // Android web views mark themselves with "; wv)"
    if (/; wv\)/.test(ua)) return "in-app";
    if (/Firefox\//.test(ua)) return "android-firefox";
    if (/SamsungBrowser|OPR\/|EdgA\//.test(ua)) return "other";
    if (/Chrome\//.test(ua)) return "android-chrome";
    return "other";
  }

  if (/Firefox\//.test(ua)) return "desktop-firefox";
  if (/Edg\/|Chrome\//.test(ua)) return "desktop-chrome";
  if (/Safari\//.test(ua)) return "desktop-safari";
  return "other";
}

/** What the browser reports for the mic permission. Firefox (and older
 * Safari) can't be asked, so "unknown" is common: go by the error then. */
export async function getMicPermission(): Promise<MicPermission> {
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return "unknown";
  }
}

/** Sorts a getUserMedia failure into what the visitor can do about it. */
export function classifyMicError(
  err: unknown,
  permission: MicPermission,
): MicProblem {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotFoundError" || name === "NotReadableError")
    return "unavailable";
  if (name === "OverconstrainedError" || name === "AbortError")
    return "unavailable";
  // Chrome closes the prompt with "Permission dismissed" and asks again on
  // the next try. Safari also still reports "prompt" after "Don't Allow",
  // but refuses without asking until a reload: that counts as blocked
  const message = err instanceof Error ? err.message : "";
  if (permission === "prompt" && /dismiss/i.test(message)) return "dismissed";
  return "blocked";
}

// set once the mic has been granted on this device, so the heads-up before
// the browser's prompt isn't shown again (Firefox can't report the permission)
const GRANTED_KEY = "ww_mic_granted";

export function rememberMicGranted() {
  try {
    localStorage.setItem(GRANTED_KEY, "1");
  } catch {
    // private mode or blocked storage: the heads-up just shows again
  }
}

export function micGrantedBefore(): boolean {
  try {
    return localStorage.getItem(GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}
