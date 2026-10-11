// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  installFunctionalCaptureObserver,
  armFunctionalCapture,
  waitForGeometryBoundary,
  hashCompletedGeometryCanvas,
  retainGeometryReadinessState,
  geometryReadinessSources,
} from "../scripts/geometry-capture-boundaries.mjs";

let state, observer, pending, directory, screenshot, attachments;
const api = () => globalThis.__gtrFunctionalCapture;
const page = {
  evaluate: async (fn, arg) => fn(arg),
  waitForFunction: async (fn, arg, { timeout, polling }) => {
    expect(timeout).toBe(15000);
    expect(polling).toBe(16);
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
      if (fn(arg)) return true;
      await new Promise((resolve) => setTimeout(resolve, polling));
    }
    // The production observer rejects late completion even if JS was stalled.
    return fn(arg);
  },
  locator: (selector) => {
    expect(selector).toBe(".scene-stage canvas");
    return {
      screenshot: (...args) => {
        expect(args).toEqual([]);
        return screenshot();
      },
    };
  },
};
const info = {
  outputPath: (name) => join(directory, name),
  attach: async (name, item) => attachments.push({ name, ...item }),
};
const draw = (id) => {
  observer({
    kind: "main",
    owner: 1,
    id,
    snapshot: structuredClone(state),
    stable: true,
  });
  observer({ kind: "fence", owner: 1, id, draws: [id] });
};
const signal = (id) => observer({ kind: "wait", owner: 1, id, status: 0x911c });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "geometry-capture-"));
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  vi.stubGlobal("devicePixelRatio", 1);
  pending = false;
  attachments = [];
  screenshot = vi.fn(async () => Buffer.from("single original PNG bytes"));
  document.body.innerHTML =
    '<main class="configurator environment-studio is-scene-ready"><div class="scene-stage"><canvas></canvas></div><div class="paint-swatches"><button aria-label="Ultimate Silver" aria-pressed="true"><span class="swatch" style="background-color:#a6acb1"></span></button></div><div class="config-toolbar"><button aria-label="Lights" aria-pressed="false">Lights</button></div></main>';
  state = {
    camera: {
      preset: "hero",
      requestId: 0,
      settled: true,
      target: [0, 0, 0],
      destination: [0, 1, 5],
      targetFov: 34,
    },
    vehicle: {
      environment: "studio",
      paint: "#a6acb1",
      exterior: true,
      full: false,
      proxy: false,
      lights: false,
      cabinSeat: null,
      lamps: [{ role: "taillights", intensity: 0, emissive: [1, 0, 0] }],
    },
    pose: {
      position: [0, 1, 5],
      quaternion: [0, 0, 0, 1],
      projection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
    dimensions: {
      width: 100,
      height: 100,
      cssWidth: 100,
      cssHeight: 100,
      renderWidth: 100,
      renderHeight: 100,
      pixelRatio: 1,
    },
    live: true,
  };
  installFunctionalCaptureObserver();
  observer = globalThis.__gtrFunctionalCaptureObserver;
  observer({
    kind: "attach",
    owner: 1,
    canvas: document.querySelector("canvas"),
    context: {},
    read: () => state,
    pending: () => pending,
  });
});
afterEach(async () => {
  api()?.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  await rm(directory, { recursive: true, force: true });
});
it("replaces two-RAF readiness with the exact post-camera request native completion", async () => {
  draw(1);
  signal(1);
  await armFunctionalCapture(page, { cameraRequest: true });
  let done = false;
  const waiting = waitForGeometryBoundary(page, "studio").then(
    () => (done = true),
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(done).toBe(false);
  draw(2);
  signal(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(done).toBe(false);
  state.camera.requestId = 1;
  draw(3);
  await vi.advanceTimersByTimeAsync(1000);
  expect(done).toBe(false);
  signal(3);
  await vi.advanceTimersByTimeAsync(16);
  await waiting;
  expect(api().snapshot().certificate).toMatchObject({
    mainDrawId: 3,
    deadline: 15000,
    nativeStatus: 0x911c,
  });
});
it("Home cannot reuse the pre-action main or pass with native frame debt", async () => {
  draw(1);
  signal(1);
  await armFunctionalCapture(page);
  let done = false;
  const waiting = waitForGeometryBoundary(page, "studio").then(
    () => (done = true),
  );
  await vi.advanceTimersByTimeAsync(32);
  expect(done).toBe(false);
  state.camera.settled = false;
  draw(2);
  signal(2);
  await vi.advanceTimersByTimeAsync(32);
  expect(done).toBe(false);
  state.camera.settled = true;
  pending = true;
  draw(3);
  signal(3);
  await vi.advanceTimersByTimeAsync(32);
  expect(done).toBe(false);
  pending = false;
  await vi.advanceTimersByTimeAsync(16);
  await waiting;
  expect(api().snapshot().certificate.mainDrawId).toBe(3);
});
it("dimensions and native completion share the original 15-second deadline", async () => {
  draw(1);
  let outcome;
  const waiting = waitForGeometryBoundary(page, "studio").then(
    () => (outcome = "ready"),
    (error) => (outcome = error),
  );
  await vi.advanceTimersByTimeAsync(14999);
  expect(outcome).toBeUndefined();
  await vi.advanceTimersByTimeAsync(17);
  signal(1);
  await waiting;
  expect(outcome).toBeInstanceOf(Error);
  expect(outcome.message).toMatch(/deadline/);
  await retainGeometryReadinessState(page, info);
  const evidence = JSON.parse(
    await readFile(info.outputPath("geometry-readiness-final.json")),
  );
  expect(evidence.state.lastMain.id).toBe(1);
  expect(evidence.state.certificate).toBeNull();
  expect(screenshot).not.toHaveBeenCalled();
});
it("rejects a late positive result after a main-thread stall without another budget", async () => {
  draw(1);
  signal(1);
  const stalledPage = {
    ...page,
    waitForFunction: async (fn, arg) => {
      await vi.advanceTimersByTimeAsync(15001);
      return fn(arg);
    },
  };
  await expect(waitForGeometryBoundary(stalledPage, "studio")).rejects.toThrow(
    /deadline/,
  );
});
it("retains the original one-shot PNG and exact completed before/after state", async () => {
  draw(1);
  signal(1);
  await waitForGeometryBoundary(page, "studio");
  const hash = await hashCompletedGeometryCanvas(
    page,
    info,
    "studio-canonical",
  );
  const bytes = await readFile(info.outputPath("studio-canonical-canvas.png"));
  expect(hash).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(screenshot).toHaveBeenCalledTimes(1);
  expect(attachments[0].path).not.toBe(info.outputPath("studio-canonical.png"));
  const evidence = JSON.parse(
    await readFile(info.outputPath("studio-canonical-native.json")),
  );
  expect(evidence.before.certificate.mainDrawId).toBe(1);
  expect(evidence.certificate).toMatchObject({
    mainDrawId: 1,
    nativeStatus: 0x911c,
  });
  expect(evidence.after.current).toEqual(evidence.before.current);
  expect(evidence.readinessSources).toEqual(geometryReadinessSources);
  expect(attachments).toHaveLength(2);
});
it("keeps PNG and state but fails if native state changes during the single screenshot", async () => {
  draw(1);
  signal(1);
  await waitForGeometryBoundary(page, "studio");
  screenshot.mockImplementationOnce(async () => {
    state.pose.position[0] = 2;
    draw(2);
    signal(2);
    return Buffer.from("changed frame");
  });
  await expect(
    hashCompletedGeometryCanvas(page, info, "studio-manual-reset"),
  ).rejects.toThrow(/changed during capture/);
  expect(screenshot).toHaveBeenCalledTimes(1);
  expect(
    await readFile(info.outputPath("studio-manual-reset-canvas.png"), "utf8"),
  ).toBe("changed frame");
  const evidence = JSON.parse(
    await readFile(info.outputPath("studio-manual-reset-native.json")),
  );
  expect(evidence.before.lastMain.id).toBe(1);
  expect(evidence.after.lastMain.id).toBe(2);
  expect(evidence.error).toMatch(/changed during capture/);
});
it("retains readiness state and propagates screenshot failure without retry", async () => {
  draw(1);
  signal(1);
  await waitForGeometryBoundary(page, "studio");
  screenshot.mockRejectedValueOnce(new Error("original screenshot timeout"));
  await expect(
    hashCompletedGeometryCanvas(page, info, "studio-canonical"),
  ).rejects.toThrow("original screenshot timeout");
  expect(screenshot).toHaveBeenCalledTimes(1);
  const evidence = JSON.parse(
    await readFile(info.outputPath("studio-canonical-native.json")),
  );
  expect(evidence.error).toBe("original screenshot timeout");
  expect(evidence.before.certificate.nativeStatus).toBe(0x911c);
});
it("changes only the two venue Home boundaries and preserves exact equality and original capture options", async () => {
  const source = await readFile("e2e/environment-grounding.spec.ts", "utf8");
  expect(source).toMatch(
    /if \(completedBoundaries\)\s*await page\.addInitScript\(installFunctionalCaptureObserver\)/,
  );
  expect(source).toMatch(/await camera\(page, "Front ¾", id\)/);
  expect(source).toMatch(
    /await armFunctionalCapture\(page\);\s*await pressCameraKey\(page, "Home"\)/,
  );
  expect(source).toMatch(
    /Home restores canonical framing`[\s\S]*?\)\.toBe\(canonical\)/,
  );
  expect(
    source.match(/name: `\$\{id\}-(?:canonical|manual-reset)`/g),
  ).toHaveLength(2);
  const helper = await readFile(
    "scripts/geometry-capture-boundaries.mjs",
    "utf8",
  );
  expect(helper).not.toMatch(
    /invalidate\(|requestAnimationFrame\(|\.render\(|\.fenceSync\(|\.clientWaitSync\(/,
  );
  expect(helper.match(/\.screenshot\(\)/g)).toHaveLength(1);
  expect(geometryReadinessSources["functional-capture-readiness.mjs"]).toBe(
    "816f8123344a2ab9f98a2469a81758266fc3d60d69545977dae3e19412a2dffb",
  );
});
