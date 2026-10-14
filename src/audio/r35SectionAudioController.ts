import { R35AudioController, R35_SAMPLE_MUTED_KEY } from "./r35AudioController";
import type { R35AudioSnapshot } from "./r35AudioController";
import {
  readSiteSound,
  rememberSiteSound,
  SITE_SOUND_EVENT,
  SITE_SOUND_KEY,
} from "./siteSoundPreference";

export type SectionSoundPreferences = {
  reducedMotion: boolean;
  saveData: boolean;
};
export type SectionSoundSnapshot = R35AudioSnapshot & { enabled: boolean };
type Bounds = Pick<
  DOMRectReadOnly,
  "left" | "right" | "top" | "bottom" | "width" | "height"
>;
/** Unlike IntersectionObserver.intersectionRatio, this can reach 1 for a runway. */
export function sectionViewportFraction(
  bounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
) {
  const available =
    Math.min(bounds.width, viewportWidth) *
    Math.min(bounds.height, viewportHeight);
  if (!Number.isFinite(available) || available <= 0) return 0;
  const width = Math.max(
    0,
    Math.min(bounds.right, viewportWidth) - Math.max(bounds.left, 0),
  );
  const height = Math.max(
    0,
    Math.min(bounds.bottom, viewportHeight) - Math.max(bounds.top, 0),
  );
  return Math.max(0, Math.min(1, (width * height) / available));
}
const OPEN_MODAL_SELECTOR =
  'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
function modalIsOpen() {
  return document.querySelector(OPEN_MODAL_SELECTOR) !== null;
}
function openingContinueGate(event: Event): HTMLDialogElement | null {
  if (!(event.target instanceof Element)) return null;
  const button = event.target.closest("button.home-opening-continue");
  if (!(button instanceof HTMLButtonElement) || button.disabled) return null;
  if (
    event.type === "keydown" &&
    !["Enter", " "].includes((event as KeyboardEvent).key)
  )
    return null;
  const gate = button.closest<HTMLDialogElement>(
    "dialog.home-loading-gate[open]",
  );
  const modals = document.querySelectorAll(OPEN_MODAL_SELECTOR);
  return gate && modals.length === 1 && modals[0] === gate ? gate : null;
}
function trustedActivation(event: Event, explicitControl = false) {
  if (
    !event.isTrusted ||
    event.defaultPrevented ||
    navigator.userActivation?.isActive === false
  )
    return false;
  if (event.type === "keydown") {
    const key = event as KeyboardEvent;
    if (
      key.repeat ||
      key.isComposing ||
      key.metaKey ||
      key.ctrlKey ||
      key.altKey ||
      [
        "Shift",
        "Control",
        "Alt",
        "AltGraph",
        "Meta",
        "CapsLock",
        "NumLock",
        "ScrollLock",
        "Escape",
        "Fn",
      ].includes(key.key)
    )
      return false;
  } else if (event.type === "pointerdown" || event.type === "pointerup") {
    if (
      (event as PointerEvent).button !== 0 ||
      (event as PointerEvent).isPrimary === false
    )
      return false;
  } else if (!explicitControl || event.type !== "click") return false;
  return true;
}

/** Policy/entry ownership; transport remains the only owner of audio nodes. */
export class R35SectionAudioController {
  private transport = new R35AudioController();
  private listeners = new Set<() => void>();
  private snapshot: SectionSoundSnapshot;
  private unsubscribe: () => void;
  private preferences: SectionSoundPreferences;
  private siteMuted = readSiteSound() === "off";
  private optedIn = false;
  private armed = false;
  private inside = false;
  private attemptedEntry = false;
  private disposed = false;
  private modalOpen = modalIsOpen();
  private modalObserver: MutationObserver;
  private continueGate: HTMLDialogElement | null = null;
  constructor(preferences: SectionSoundPreferences) {
    this.preferences = preferences;
    this.snapshot = {
      ...this.transport.getSnapshot(),
      enabled: this.enabled(),
    };
    this.unsubscribe = this.transport.subscribe(this.publish);
    // One observer for this section handles existing menu/dialog components.
    // Only modal-relevant attributes are watched; no animation/style polling.
    this.modalObserver = new MutationObserver(() => {
      if (this.disposed) return;
      const open = modalIsOpen();
      const gate = this.continueGate;
      if (gate) {
        const otherModal = [
          ...document.querySelectorAll(OPEN_MODAL_SELECTOR),
        ].some((modal) => modal !== gate);
        if (otherModal) this.stopForNavigation();
        else if (!gate.isConnected || !gate.open) {
          this.continueGate = null;
          // Only the first Continue gesture can release an unattempted entry.
          // Ordinary menu/film dismissal never calls maybePlay.
          this.maybePlay();
        }
      } else if (open && !this.modalOpen) this.stopForNavigation();
      this.modalOpen = open;
    });
    this.modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "role", "aria-modal"],
    });
    document.addEventListener("pointerdown", this.onGesture, true);
    document.addEventListener("pointerup", this.onGesture, true);
    document.addEventListener("keydown", this.onGesture, true);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.stopForNavigation);
    window.addEventListener("popstate", this.stopForNavigation);
    window.addEventListener("hashchange", this.stopForNavigation);
    window.addEventListener(SITE_SOUND_EVENT, this.onSiteSound);
    window.addEventListener("storage", this.onStorage);
  }
  private enabled() {
    return (
      !this.siteMuted &&
      !this.transport.getSnapshot().muted &&
      (this.optedIn ||
        (!this.preferences.reducedMotion && !this.preferences.saveData))
    );
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish = () => {
    if (this.disposed) return;
    this.snapshot = {
      ...this.transport.getSnapshot(),
      enabled: this.enabled(),
    };
    this.listeners.forEach((listener) => listener());
  };
  setPreferences(preferences: SectionSoundPreferences) {
    if (this.disposed) return;
    const wasEnabled = this.enabled();
    this.preferences = preferences;
    if (wasEnabled && !this.enabled()) this.stopForNavigation();
    this.publish();
  }
  onGesture = (event: Event) => {
    if (
      this.disposed ||
      this.armed ||
      !this.enabled() ||
      !trustedActivation(event)
    )
      return;
    // The Sound control owns its own explicit opt-in/off action at click time.
    const gate = openingContinueGate(event);
    if (modalIsOpen() && !gate) return;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-r35-sound-control], [inert]")
    )
      return;
    this.armed = this.transport.prepareFromGesture();
    if (this.armed && gate) {
      this.continueGate = gate;
      this.modalOpen = true;
      this.attemptedEntry = false;
    }
    this.maybePlay();
  };
  toggleFromGesture = (event: Event) => {
    if (this.disposed || !trustedActivation(event, true)) return;
    if (this.enabled() && this.transport.getSnapshot().phase !== "error") {
      this.transport.setMuted(true);
      rememberSiteSound(false);
      return;
    }
    this.optedIn = true;
    this.siteMuted = false;
    this.transport.stop();
    this.transport.setMuted(false);
    rememberSiteSound(true);
    this.attemptedEntry = false;
    this.armed = this.transport.prepareFromGesture();
    this.maybePlay();
    this.publish();
  };
  setViewportFraction(fraction: number) {
    if (this.disposed) return;
    if (!this.inside && fraction >= 0.55) {
      this.inside = true;
      this.attemptedEntry = false;
      this.maybePlay();
    } else if (this.inside && fraction <= 0.15) {
      this.inside = false;
      this.attemptedEntry = false;
      this.transport.fadeOut();
    }
  }
  private maybePlay() {
    if (
      !this.inside ||
      this.attemptedEntry ||
      !this.armed ||
      !this.enabled() ||
      document.visibilityState === "hidden" ||
      modalIsOpen() ||
      this.transport.getSnapshot().phase === "error"
    )
      return;
    this.attemptedEntry = true;
    this.transport.playPrepared();
  }
  stopForNavigation = () => {
    if (this.disposed) return;
    this.attemptedEntry = true;
    this.continueGate = null;
    this.transport.stop();
  };
  private onVisibility = () => {
    if (document.visibilityState === "hidden") this.stopForNavigation();
  };
  private onSiteSound = (event: Event) => {
    const enabled = (event as CustomEvent<unknown>).detail;
    if (typeof enabled !== "boolean") return;
    this.siteMuted = !enabled;
    if (!enabled) this.stopForNavigation();
    // An external unmute changes the preference, but never resumes this entry.
    this.publish();
  };
  private onStorage = (event: StorageEvent) => {
    if (event.key === SITE_SOUND_KEY || event.key === null) {
      this.siteMuted = readSiteSound() === "off";
      if (this.siteMuted) this.stopForNavigation();
    }
    if (event.key === R35_SAMPLE_MUTED_KEY || event.key === null) {
      let muted = false;
      try {
        muted = localStorage.getItem(R35_SAMPLE_MUTED_KEY) === "true";
      } catch {
        /* optional persistence */
      }
      if (muted) this.stopForNavigation();
      this.transport.setMuted(muted, false);
    }
    this.publish();
  };
  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.modalObserver.disconnect();
    this.continueGate = null;
    this.transport.dispose();
    document.removeEventListener("pointerdown", this.onGesture, true);
    document.removeEventListener("pointerup", this.onGesture, true);
    document.removeEventListener("keydown", this.onGesture, true);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.stopForNavigation);
    window.removeEventListener("popstate", this.stopForNavigation);
    window.removeEventListener("hashchange", this.stopForNavigation);
    window.removeEventListener(SITE_SOUND_EVENT, this.onSiteSound);
    window.removeEventListener("storage", this.onStorage);
    this.listeners.clear();
  };
}
