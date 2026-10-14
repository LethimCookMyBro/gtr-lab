import { r35Recording } from "./r35Recording";

export const R35_SAMPLE_MUTED_KEY = "gtr-lab:r35-sample-muted";
export type R35AudioSnapshot = {
  phase: "idle" | "loading" | "playing" | "error";
  muted: boolean;
  error: string | null;
};
const MAX_LOAD_MS = 12_000;
const EXIT_FADE_SECONDS = 0.08;
let activePreview: R35AudioController | null = null;
/** Opening a film must silence the recording before its own player mounts. */
export function stopR35Recording() {
  activePreview?.stop();
}

/** Owns the unchanged field recording, independently of synthetic UI tones. */
export class R35AudioController {
  private snapshot: R35AudioSnapshot;
  private listeners = new Set<() => void>();
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private request: AbortController | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private disposed = false;
  private unlocked = false;
  private wantsPlayback = false;
  private fading = false;
  private startedAt = 0;

  constructor() {
    let muted = false;
    try {
      muted = localStorage.getItem(R35_SAMPLE_MUTED_KEY) === "true";
    } catch {
      // Playback still works when storage is unavailable.
    }
    this.snapshot = { phase: "idle", muted, error: null };
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.stop);
    window.addEventListener("popstate", this.stop);
    window.addEventListener("hashchange", this.stop);
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<R35AudioSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") this.stop();
  };
  private clearLoadTimer() {
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    this.loadTimer = null;
  }
  private allowed() {
    return (
      !this.disposed &&
      !this.snapshot.muted &&
      document.visibilityState !== "hidden"
    );
  }
  private claimPlayback() {
    if (activePreview !== this) activePreview?.stop();
    activePreview = this;
    this.wantsPlayback = true;
  }

  // Callers must supply an explicit gesture. The section controller additionally
  // checks native event trust; scroll/IntersectionObserver never call resume().
  prepareFromGesture = (): boolean => this.startFromGesture(false);
  playFromGesture = () => {
    this.startFromGesture(true);
  };
  private startFromGesture(play: boolean): boolean {
    if (!this.allowed()) return false;
    if (this.snapshot.phase === "playing" || this.snapshot.phase === "loading")
      return true;
    if (navigator.userActivation?.isActive === false) {
      this.update({
        phase: "error",
        error: "Use the Hear button or Sound control to start the recording.",
      });
      return false;
    }
    const AudioConstructor = window.AudioContext;
    if (!AudioConstructor) {
      this.update({
        phase: "error",
        error:
          "Audio is unavailable in this browser. You can continue without sound.",
      });
      return false;
    }
    try {
      this.context ??= new AudioConstructor();
      const context = this.context;
      // This invocation remains synchronous inside the trusted gesture.
      const resumed = context.resume();
      this.unlocked = true;
      if (play) this.claimPlayback();
      this.beginPreparation(context, resumed);
      return true;
    } catch {
      this.fail(
        "The recording could not start. Retry to try again, or continue without sound.",
      );
      return false;
    }
  }

  /** A viewport entry can use an already gesture-unlocked context, never unlock it. */
  playPrepared = (): boolean => {
    if (!this.allowed() || !this.unlocked || !this.context) return false;
    if (this.fading) this.stop();
    if (this.source) return true;
    this.claimPlayback();
    if (this.snapshot.phase === "loading") return true;
    if (this.context.state !== "running") {
      this.fail(
        "Sound is paused by your browser. Use the Sound control to retry.",
      );
      return false;
    }
    // A cancelled fetch can be retried on a later genuine entry, without resume.
    this.beginPreparation(this.context, Promise.resolve());
    return true;
  };

  private beginPreparation(context: AudioContext, resumed: Promise<void>) {
    const attempt = ++this.attempt;
    this.request = new AbortController();
    this.update({ phase: "loading", error: null });
    this.loadTimer = setTimeout(() => {
      if (attempt === this.attempt)
        this.fail(
          "The recording took too long to load. Retry when your connection is ready.",
        );
    }, MAX_LOAD_MS);
    void this.loadAndPrepare(context, resumed, attempt, this.request.signal);
  }
  private async loadAndPrepare(
    context: AudioContext,
    resumed: Promise<void>,
    attempt: number,
    signal: AbortSignal,
  ) {
    try {
      await resumed;
      if (!this.isCurrent(attempt)) return;
      let buffer = this.buffer;
      if (!buffer) {
        const response = await fetch(r35Recording.url, { signal });
        if (!this.isCurrent(attempt)) return;
        if (!response.ok) throw new Error("Recording unavailable");
        const bytes = await response.arrayBuffer();
        if (!this.isCurrent(attempt)) return;
        buffer = await context.decodeAudioData(bytes);
      }
      if (!this.isCurrent(attempt)) return;
      if (context.state !== "running") throw new Error("Audio suspended");
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0)
        throw new Error("Invalid recording");
      this.buffer = buffer;
      this.clearLoadTimer();
      this.request = null;
      if (!this.wantsPlayback) {
        this.update({ phase: "idle", error: null });
        return;
      }
      const source = context.createBufferSource();
      this.source = source;
      const gain = context.createGain();
      this.gain = gain;
      source.buffer = buffer;
      source.loop = false;
      source.connect(gain);
      gain.connect(context.destination);
      const now = context.currentTime;
      const duration = buffer.duration;
      this.startedAt = now;
      // Full unchanged source; this quiet natural-end envelope is independent
      // of page progress, visual animation and video.
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(
        r35Recording.playbackGain,
        now + Math.min(0.12, duration / 4),
      );
      gain.gain.setValueAtTime(
        r35Recording.playbackGain,
        now + Math.max(duration - 0.65, duration / 2),
      );
      gain.gain.linearRampToValueAtTime(0, now + duration);
      source.onended = () => {
        if (attempt !== this.attempt || this.source !== source) return;
        this.stop();
      };
      source.start(now, 0, duration);
      this.update({ phase: "playing", error: null });
    } catch {
      if (this.isCurrent(attempt))
        this.fail(
          "The recording could not load or play. Retry to try again, or continue without sound.",
        );
    }
  }
  private isCurrent(attempt: number) {
    return this.allowed() && this.attempt === attempt;
  }
  private fail(error: string) {
    this.stop();
    this.update({ phase: "error", error });
  }

  /** Ordinary viewport exit: native audio-clock fade, no JavaScript fade timer. */
  fadeOut = () => {
    if (this.disposed || this.fading) return;
    if (!this.source || !this.gain || !this.context || !this.buffer) {
      this.stop();
      return;
    }
    this.fading = true;
    const now = this.context.currentTime;
    const elapsed = Math.max(0, now - this.startedAt);
    const duration = this.buffer.duration;
    const fadeIn = Math.min(0.12, duration / 4);
    const fadeOutStart = Math.max(duration - 0.65, duration / 2);
    const currentGain =
      r35Recording.playbackGain *
      Math.max(
        0,
        Math.min(
          1,
          elapsed / fadeIn,
          (duration - elapsed) / (duration - fadeOutStart),
        ),
      );
    const end =
      now + Math.min(EXIT_FADE_SECONDS, Math.max(0, duration - elapsed));
    try {
      if (typeof this.gain.gain.cancelAndHoldAtTime === "function")
        this.gain.gain.cancelAndHoldAtTime(now);
      else {
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(currentGain, now);
      }
      this.gain.gain.linearRampToValueAtTime(0, end);
      this.source.stop(end);
      // Keep source/gain/global ownership until native ended. Urgent stop,
      // replacement playback and disposal may still silence it synchronously.
    } catch {
      this.stop();
    }
  };
  stop = () => {
    ++this.attempt;
    this.wantsPlayback = false;
    this.fading = false;
    this.clearLoadTimer();
    this.request?.abort();
    this.request = null;
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* already ended */
      }
      this.source.disconnect();
    }
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
    if (activePreview === this) activePreview = null;
    this.update({ phase: "idle", error: null });
  };
  setMuted = (muted: boolean, persist = true) => {
    if (this.disposed) return;
    if (muted) this.stop();
    this.update({ muted, error: null });
    try {
      if (persist) localStorage.setItem(R35_SAMPLE_MUTED_KEY, String(muted));
    } catch {
      /* optional persistence */
    }
  };
  dispose = () => {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pagehide", this.stop);
    window.removeEventListener("popstate", this.stop);
    window.removeEventListener("hashchange", this.stop);
    this.listeners.clear();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.buffer = null;
    this.unlocked = false;
  };
}
