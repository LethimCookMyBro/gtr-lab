// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  R35AudioController,
  R35_SAMPLE_MUTED_KEY,
  stopR35Recording,
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

describe("prepared section transport", () => {
  it("prepares on a gesture without playing, then starts without a second activation", async () => {
    const controller = create();
    expect(controller.prepareFromGesture()).toBe(true);
    await flush();
    const context = FakeAudioContext.instances[0];
    expect(fetchSample).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(0);
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: false },
    });
    expect(controller.playPrepared()).toBe(true);
    await flush();
    expect(context.sources).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
  });
  it("never lets a viewport request itself create or unlock audio", async () => {
    const controller = create();
    expect(controller.playPrepared()).toBe(false);
    await flush();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(fetchSample).not.toHaveBeenCalled();
  });
  it("fades exit with native gain and source stop, retaining nodes until ended", async () => {
    vi.useFakeTimers();
    const controller = create();
    controller.playFromGesture();
    await flush();
    const context = FakeAudioContext.instances[0];
    const source = context.sources[0];
    context.currentTime = 11;
    controller.fadeOut();
    expect(context.gain.gain.cancelScheduledValues).toHaveBeenCalledWith(11);
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      0,
      11.08,
    );
    expect(source.stop).toHaveBeenCalledExactlyOnceWith(11.08);
    expect(source.disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    context.currentTime = 11.05;
    controller.fadeOut();
    expect(source.stop).toHaveBeenCalledTimes(1);
    source.onended?.();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(context.gain.disconnect).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe("idle");
  });
  it("urgent stops supersede a pending fade and stale ended cannot stop a replacement", async () => {
    const controller = create();
    controller.playFromGesture();
    await flush();
    const context = FakeAudioContext.instances[0];
    const oldSource = context.sources[0];
    const ended = oldSource.onended;
    controller.fadeOut();
    controller.stop();
    expect(oldSource.stop).toHaveBeenLastCalledWith();
    controller.playPrepared();
    await flush();
    ended?.();
    expect(controller.getSnapshot().phase).toBe("playing");
    expect(context.sources[1].stop).not.toHaveBeenCalled();
  });
  it("a new preview supersedes a fading owner's nodes immediately", async () => {
    const first = create();
    first.playFromGesture();
    await flush();
    first.fadeOut();
    const second = create();
    second.playFromGesture();
    await flush();
    const source = FakeAudioContext.instances[0].sources[0];
    expect(source.stop).toHaveBeenLastCalledWith();
    expect(source.disconnect).toHaveBeenCalledOnce();
  });
  it("fades from the actual natural envelope gain rather than raising end-of-clip volume", async () => {
    const controller = create();
    controller.playFromGesture();
    await flush();
    const context = FakeAudioContext.instances[0];
    context.currentTime = 17.4;
    controller.fadeOut();
    const held = context.gain.gain.setValueAtTime.mock.calls.at(-1)!;
    expect(held[0]).toBeGreaterThan(0);
    expect(held[0]).toBeLessThan(0.1);
    expect(held[1]).toBe(17.4);
  });
  it("keeps the preparation deadline through a hanging decode and rejects late results", async () => {
    vi.useFakeTimers();
    let resolve!: (value: { duration: number }) => void;
    const controller = create();
    controller.prepareFromGesture();
    const context = FakeAudioContext.instances[0];
    context.decodeAudioData.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await flush();
    expect(controller.playPrepared()).toBe(true);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(controller.getSnapshot().phase).toBe("error");
    resolve({ duration: 7.6 });
    await flush();
    expect(context.sources).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("the modal interrupt urgently stops the globally owned fading recording", async () => {
  const controller = create();
  controller.playFromGesture();
  await flush();
  controller.fadeOut();
  stopR35Recording();
  expect(
    FakeAudioContext.instances[0].sources[0].stop,
  ).toHaveBeenLastCalledWith();
  expect(controller.getSnapshot().phase).toBe("idle");
});

describe("unlock-only audio transport", () => {
  it("unlocks synchronously without fetching, then loads on a later entry without a second resume", async () => {
    const controller = create();
    expect(controller.unlockFromGesture()).toBe(true);
    const context = FakeAudioContext.instances[0];
    expect(context.resume).toHaveBeenCalledOnce();
    await flush();
    expect(fetchSample).not.toHaveBeenCalled();
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("idle");
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: false },
    });
    controller.playPrepared();
    await flush();
    expect(fetchSample).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledOnce();
  });
  it("bounds a pending unlock and cannot fetch when its cancelled resume settles", async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    class PendingUnlock extends FakeAudioContext {
      constructor() {
        super();
        this.resume = vi.fn(
          () =>
            new Promise<void>((r) => {
              resolve = r;
            }),
        );
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: PendingUnlock,
    });
    const controller = create();
    controller.unlockFromGesture();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(controller.getSnapshot().phase).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
    resolve();
    await flush();
    expect(fetchSample).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].sources).toHaveLength(0);
  });
  it("stopping a pending unlock prevents its late result from reactivating transport", async () => {
    let resolve!: () => void;
    class PendingUnlock extends FakeAudioContext {
      constructor() {
        super();
        this.resume = vi.fn(
          () =>
            new Promise<void>((r) => {
              resolve = r;
            }),
        );
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: PendingUnlock,
    });
    const controller = create();
    controller.unlockFromGesture();
    controller.stop();
    resolve();
    await flush();
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(fetchSample).not.toHaveBeenCalled();
  });
});
