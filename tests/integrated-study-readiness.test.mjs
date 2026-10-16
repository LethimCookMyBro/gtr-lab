// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installFunctionalCaptureObserver } from "../scripts/functional-capture-readiness.mjs";
let install = installFunctionalCaptureObserver;
try {
  install = (
    await import(
      /* @vite-ignore */ "../scripts/" + "integrated-study-readiness.mjs"
    )
  ).installIntegratedStudyCaptureObserver;
} catch {
  /* Existing observer demonstrates the absent integrated contract. */
}
let state, observer;
const path = "/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb";
const expected = { preset: "hero", seat: null, lights: false, proxy: false };
const api = () => globalThis.__gtrFunctionalCapture;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance"] });
  vi.stubGlobal("devicePixelRatio", 1);
  document.body.innerHTML = '<div class="scene-stage"><canvas></canvas></div>';
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
      url: path,
      exterior: true,
      full: true,
      proxy: false,
      lights: false,
      cabinSeat: null,
      lamps: [],
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
  install();
  observer = globalThis.__gtrFunctionalCaptureObserver;
  observer({
    kind: "attach",
    owner: 1,
    canvas: document.querySelector("canvas"),
    context: {},
    read: () => state,
    pending: () => false,
  });
  api().arm();
});
afterEach(() => {
  api()?.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const submit = () => {
  observer({
    kind: "main",
    owner: 1,
    id: 1,
    snapshot: JSON.parse(JSON.stringify(state)),
    stable: true,
  });
  observer({ kind: "fence", owner: 1, id: 1, draws: [1] });
};
const signal = () => {
  observer({ kind: "wait", owner: 1, id: 1, status: 0x911c });
  observer({ kind: "retire", owner: 1, id: 1, reason: "signaled" });
};
it("certifies only the exact integrated full exterior after a native-positive fence", () => {
  submit();
  expect(api().poll({ expected, deadline: 20000 })).toBeNull();
  signal();
  expect(api().poll({ expected, deadline: 20000 })).toMatchObject({
    owner: 1,
    nativeStatus: 0x911c,
    snapshot: { vehicle: { url: path, full: true, proxy: false, lamps: [] } },
  });
});
it.each(["wrong-url", "missing-full", "proxy", "dynamic-lamp"])(
  "fails closed for %s",
  (kind) => {
    if (kind === "wrong-url") state.vehicle.url = "/models/ciasny-r35.glb";
    if (kind === "missing-full") state.vehicle.full = false;
    if (kind === "proxy") state.vehicle.proxy = true;
    if (kind === "dynamic-lamp")
      state.vehicle.lamps = [
        { role: "taillights", intensity: 0, emissive: [1, 0, 0] },
      ];
    submit();
    signal();
    expect(api().poll({ expected, deadline: 20000 })).toBeNull();
  },
);
it("preserves the original deadline rather than treating late completion as success", () => {
  submit();
  signal();
  vi.advanceTimersByTime(20001);
  expect(() => api().poll({ expected, deadline: 20000 })).toThrow(/deadline/i);
});
