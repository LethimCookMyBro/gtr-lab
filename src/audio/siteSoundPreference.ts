export const SITE_SOUND_KEY = "gtr-lab:sound";
export const SITE_SOUND_EVENT = "gtr-lab:site-sound-change";
export function readSiteSound(): "on" | "off" | null {
  try {
    const value = localStorage.getItem(SITE_SOUND_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}
/** Storage handles other tabs; the event keeps controls in this tab in sync. */
export function rememberSiteSound(enabled: boolean) {
  try {
    localStorage.setItem(SITE_SOUND_KEY, enabled ? "on" : "off");
  } catch {
    /* optional persistence */
  }
  window.dispatchEvent(new CustomEvent(SITE_SOUND_EVENT, { detail: enabled }));
}
