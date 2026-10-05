import { r35Recording } from "./r35Recording";

export const R35_SAMPLE_MUTED_KEY = "gtr-lab:r35-sample-muted";
export type R35AudioSnapshot = {
  phase: "idle" | "loading" | "playing" | "error";
  muted: boolean;
  error: string | null;
};
const MAX_LOAD_MS = 12_000;
let activePreview: R35AudioController | null = null;

/** Owns only the real recording. The site's synthetic UI tones stay separate. */
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

  // The component calls this exclusively from its native button click handler.
  // Resume happens synchronously in that gesture, before network/decode awaits.
  playFromGesture = () => {
    if (
      this.disposed ||
      this.snapshot.muted ||
      this.snapshot.phase === "loading" ||
      this.snapshot.phase === "playing" ||
      document.visibilityState === "hidden"
    )
      return;
    if (navigator.userActivation?.isActive === false) {
      this.update({
        phase: "error",
        error: "Use the Hear button to start the recording.",
      });
      return;
    }
    const AudioConstructor = window.AudioContext;
    if (!AudioConstructor) {
      this.update({
        phase: "error",
        error:
          "Audio is unavailable in this browser. You can continue without sound.",
      });
      return;
    }
    activePreview?.stop();
    activePreview = this;
    const attempt = ++this.attempt;
    this.request = new AbortController();
    this.update({ phase: "loading", error: null });
    this.loadTimer = setTimeout(() => {
      if (attempt === this.attempt)
        this.fail(
          "The recording took too long to load. Retry when your connection is ready.",
        );
    }, MAX_LOAD_MS);
    try {
      this.context ??= new AudioConstructor();
      const context = this.context;
      const resumed = context.resume();
      void this.loadAndPlay(context, resumed, attempt, this.request.signal);
    } catch {
      this.fail(
        "The recording could not start. Retry to try again, or continue without sound.",
      );
    }
  };

  private async loadAndPlay(
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
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      const now = context.currentTime;
      // Full unchanged source, never looped or tied to page/animation progress.
      // A gain envelope is a playback adaptation, documented with the asset.
      const duration = buffer.duration;
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
      this.source = source;
      this.gain = gain;
      source.onended = () => {
        if (attempt !== this.attempt) return;
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
    return (
      !this.disposed &&
      this.attempt === attempt &&
      !this.snapshot.muted &&
      document.visibilityState !== "hidden"
    );
  }
  private fail(error: string) {
    this.stop();
    this.update({ phase: "error", error });
  }
  stop = () => {
    ++this.attempt;
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
  setMuted = (muted: boolean) => {
    if (this.disposed) return;
    if (muted) this.stop();
    this.update({ muted, error: null });
    try {
      localStorage.setItem(R35_SAMPLE_MUTED_KEY, String(muted));
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
  };
}
