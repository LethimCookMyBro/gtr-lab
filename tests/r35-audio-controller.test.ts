// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  R35AudioController,
  R35_SAMPLE_MUTED_KEY,
} from "../src/audio/r35AudioController";

// Browser Web Audio has no jsdom implementation. This small port records actual
// playback/stop commands while the real controller owns races and lifecycle.
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = "running";
  currentTime = 10;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = "closed";
  });
  decodeAudioData = vi.fn(async () => ({ duration: 7.60056689342404 }));
  sources: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    buffer: unknown;
    onended: (() => void) | null;
  }[] = [];
  gain = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  createGain = vi.fn(() => this.gain);
  createBufferSource = vi.fn(() => {
    const source = {
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      buffer: null as unknown,
      onended: null as (() => void) | null,
    };
    this.sources.push(source);
    return source;
  });
  constructor() {
    FakeAudioContext.instances.push(this);
  }
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const controllers: R35AudioController[] = [];
const create = () => {
  const controller = new R35AudioController();
  controllers.push(controller);
  return controller;
};
let fetchSample: ReturnType<typeof vi.fn>;
beforeEach(() => {
  FakeAudioContext.instances = [];
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: FakeAudioContext,
  });
  fetchSample = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  }));
  vi.stubGlobal("fetch", fetchSample);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { isActive: true },
  });
  localStorage.clear();
});
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("standalone genuine R35 sample", () => {
  it("does not fetch, create a context, or play on mount, even with an unmuted preference", () => {
    localStorage.setItem(R35_SAMPLE_MUTED_KEY, "false");
    expect(create().getSnapshot()).toEqual({
      phase: "idle",
      muted: false,
      error: null,
    });
    expect(fetchSample).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });
  it("starts only after a gesture, decodes the original recording and fades quiet playback", async () => {
    const controller = create();
    controller.playFromGesture();
    expect(controller.getSnapshot().phase).toBe("loading");
    await flush();
    const context = FakeAudioContext.instances[0];
    expect(controller.getSnapshot().phase).toBe("playing");
    expect(fetchSample.mock.calls[0][0]).toBe(
      "/audio/nissan-gtr-specv-edvvc.ogg",
    );
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].start).toHaveBeenCalledWith(
      10,
      0,
      7.60056689342404,
    );
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.2,
      10.12,
    );
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0,
      17.60056689342404,
    );
    context.sources[0].onended?.();
    expect(controller.getSnapshot().phase).toBe("idle");
  });
  it("refuses programmatic playback without active user activation", async () => {
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: false },
    });
    const controller = create();
    controller.playFromGesture();
    await flush();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(controller.getSnapshot().error).toContain("Hear");
  });
  it("ignores repeated Hear actions while loading or playing", async () => {
    const controller = create();
    controller.playFromGesture();
    controller.playFromGesture();
    await flush();
    controller.playFromGesture();
    expect(fetchSample).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances[0].sources).toHaveLength(1);
  });
  it("cancels pending decode so Stop cannot be undone by a late result", async () => {
    let resolve!: (value: ArrayBuffer) => void;
    fetchSample.mockResolvedValue({
      ok: true,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((r) => {
          resolve = r;
        }),
    });
    const controller = create();
    controller.playFromGesture();
    await flush();
    controller.stop();
    resolve(new ArrayBuffer(8));
    await flush();
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(FakeAudioContext.instances[0].sources).toHaveLength(0);
  });
  it("stops and aborts loading when muted, persists it, and unmute does not play", async () => {
    const controller = create();
    controller.playFromGesture();
    await flush();
    controller.setMuted(true);
    expect(FakeAudioContext.instances[0].sources[0].stop).toHaveBeenCalled();
    expect(localStorage.getItem(R35_SAMPLE_MUTED_KEY)).toBe("true");
    expect(create().getSnapshot().muted).toBe(true);
    controller.playFromGesture();
    controller.setMuted(false);
    await flush();
    expect(FakeAudioContext.instances[0].sources).toHaveLength(1);
    expect(controller.getSnapshot().phase).toBe("idle");
  });
  it.each(["visibilitychange", "pagehide", "popstate", "hashchange"])(
    "stops for %s and never resumes automatically",
    async (event) => {
      const controller = create();
      controller.playFromGesture();
      await flush();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      (event === "visibilitychange" ? document : window).dispatchEvent(
        new Event(event),
      );
      expect(controller.getSnapshot().phase).toBe("idle");
      expect(FakeAudioContext.instances[0].sources[0].stop).toHaveBeenCalled();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await flush();
      expect(FakeAudioContext.instances[0].sources).toHaveLength(1);
    },
  );
  it("stops another mounted preview before starting this one", async () => {
    const first = create();
    const second = create();
    first.playFromGesture();
    await flush();
    second.playFromGesture();
    await flush();
    expect(first.getSnapshot().phase).toBe("idle");
    expect(FakeAudioContext.instances[0].sources[0].stop).toHaveBeenCalled();
    expect(second.getSnapshot().phase).toBe("playing");
  });
  it("reports failed requests and requires a fresh gesture for retry", async () => {
    fetchSample.mockRejectedValueOnce(new Error("offline"));
    const controller = create();
    controller.playFromGesture();
    await flush();
    expect(controller.getSnapshot().phase).toBe("error");
    expect(controller.getSnapshot().error).toContain("Retry");
    expect(FakeAudioContext.instances[0].sources).toHaveLength(0);
    controller.playFromGesture();
    await flush();
    expect(controller.getSnapshot().phase).toBe("playing");
    expect(fetchSample).toHaveBeenCalledTimes(2);
  });
  it("reports decode errors without substituting synthetic audio", async () => {
    const controller = create();
    controller.playFromGesture();
    FakeAudioContext.instances[0].decodeAudioData.mockRejectedValueOnce(
      new Error("bad format"),
    );
    await flush();
    expect(controller.getSnapshot().phase).toBe("error");
    expect(FakeAudioContext.instances[0].sources).toHaveLength(0);
  });
  it("bounds a hanging load and prevents its late result from starting audio", async () => {
    vi.useFakeTimers();
    let resolve!: (value: {
      ok: boolean;
      arrayBuffer: () => Promise<ArrayBuffer>;
    }) => void;
    fetchSample.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const controller = create();
    controller.playFromGesture();
    await flush();
    await vi.advanceTimersByTimeAsync(12000);
    expect(controller.getSnapshot().phase).toBe("error");
    resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    await flush();
    expect(FakeAudioContext.instances[0].sources).toHaveLength(0);
  });
  it("cancels pending resume on disposal and closes its context", async () => {
    const controller = create();
    controller.playFromGesture();
    const context = FakeAudioContext.instances[0];
    controller.dispose();
    await flush();
    expect(context.close).toHaveBeenCalled();
    expect(context.sources).toHaveLength(0);
  });
  it("fails clearly when Web Audio is unavailable and survives denied storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const controller = create();
    controller.setMuted(true);
    controller.setMuted(false);
    controller.playFromGesture();
    await flush();
    expect(controller.getSnapshot().error).toContain("unavailable");
  });
});
