import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForFullResolutionFrames } from "../scripts/environment-capture-readiness.mjs";
let canvas;
let frames;
beforeEach(() => {
  vi.useFakeTimers();
  canvas = { clientWidth: 390, clientHeight: 392, width: 390, height: 392 };
  frames = [];
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("document", { querySelector: () => canvas });
  vi.stubGlobal("requestAnimationFrame", (callback) =>
    setTimeout(() => {
      const change = frames.shift();
      if (change) change();
      callback(performance.now());
    }, 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded full-resolution frame gate", () => {
  it("accepts an already stable canvas after exactly three native frames", async () => {
    let done = false;
    const waiting = waitForFullResolutionFrames().then((value) => {
      done = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(32);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(16);
    expect(await waiting).toMatchObject({
      css: [390, 392],
      drawingBuffer: [390, 392],
      sampledFrames: 3,
      fullFrames: 3,
      regressedFrames: 0,
      elapsedMs: 48,
    });
  });
  it("restarts the concluding frame sequence when DPR regresses after two full frames", async () => {
    frames = [
      () => {},
      () => {},
      () => {
        canvas.width = 234;
        canvas.height = 235;
      },
      () => {
        canvas.width = 390;
        canvas.height = 392;
      },
    ];
    const waiting = waitForFullResolutionFrames();
    await vi.advanceTimersByTimeAsync(96);
    expect(await waiting).toMatchObject({
      sampledFrames: 6,
      fullFrames: 3,
      regressedFrames: 1,
      drawingBuffer: [390, 392],
    });
  });
  it("checks height as well as width and restarts on a full-resolution size change", async () => {
    frames = [
      () => {
        canvas.height = 235;
      },
      () => {
        canvas.height = 392;
      },
      () => {},
      () => {
        canvas.clientHeight = 400;
        canvas.height = 400;
      },
    ];
    const waiting = waitForFullResolutionFrames();
    await vi.advanceTimersByTimeAsync(96);
    expect(await waiting).toMatchObject({
      sampledFrames: 6,
      regressedFrames: 1,
      drawingBuffer: [390, 400],
    });
  });
  it.each(["regressed", "missing", "collapsed"])(
    "rejects a persistently %s canvas at the unchanged 15-second deadline",
    async (condition) => {
      if (condition === "regressed") canvas.width = 234;
      if (condition === "missing") canvas = null;
      if (condition === "collapsed") canvas.clientWidth = 0;
      let failure;
      const waiting = waitForFullResolutionFrames().catch((error) => {
        failure = error;
      });
      await vi.advanceTimersByTimeAsync(14999);
      expect(failure).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await waiting;
      expect(failure.message).toMatch(/within 15000ms/);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("rejects a delayed third frame after the deadline even before the timeout callback runs", async () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    let outcome;
    const waiting = waitForFullResolutionFrames().then(
      () => {
        outcome = "passed";
      },
      (error) => {
        outcome = error;
      },
    );
    await vi.advanceTimersByTimeAsync(32);
    expect(outcome).toBeUndefined();
    // Model a blocked browser main thread: the RAF callback resumes after the
    // deadline while the scheduled timeout callback has not yet been serviced.
    now = 15001;
    await vi.advanceTimersByTimeAsync(16);
    await waiting;
    expect(outcome).toBeInstanceOf(Error);
    expect(outcome.message).toMatch(/within 15000ms/);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("honors the existing 1.75 DPR cap without accepting undersized buffers", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    canvas.width = Math.floor(390 * 1.75);
    canvas.height = 392 * 1.75;
    const waiting = waitForFullResolutionFrames();
    await vi.advanceTimersByTimeAsync(48);
    expect(await waiting).toMatchObject({
      expectedDpr: 1.75,
      drawingBuffer: [682, 686],
      sampledFrames: 3,
    });
  });
});
