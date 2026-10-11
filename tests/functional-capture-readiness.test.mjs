// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import orderFailures from "./fixtures/functional-readiness-order-failure.json";
import cabinResourceFailures from "./fixtures/cabin-resource-main-failure.json";
import cabinImages from "../qa/cabin-preview/realism-images.json";
import { cabinResourceCohort } from "../scripts/cabin-resource-assertions.mjs";
import {
  installFunctionalCaptureObserver,
  waitForFunctionalCapture,
} from "../scripts/functional-capture-readiness.mjs";
let state, canvas, pending, observer;
const expected = { preset: "hero", seat: null, lights: false, proxy: false };
const copy = (value) => JSON.parse(JSON.stringify(value));
const main = (id = 1, options = {}) =>
  observer({
    kind: "main",
    owner: 1,
    id,
    snapshot: copy(state),
    stable: true,
    ...options,
  });
const fence = (id = 1, draws = [1], previous = null) =>
  observer({ kind: "fence", owner: 1, id, draws, previous });
const signal = (id = 1, status = 0x911c) => {
  observer({ kind: "wait", owner: 1, id, status });
  observer({ kind: "retire", owner: 1, id, reason: "signaled" });
};
const api = () => globalThis.__gtrFunctionalCapture;
const poll = (deadline = 20000) => api().poll({ expected, deadline });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  vi.stubGlobal("devicePixelRatio", 1);
  document.body.innerHTML =
    '<div class="scene-stage"><canvas></canvas></div><button aria-label="Lights" aria-pressed="false">Lights</button>';
  canvas = document.querySelector("canvas");
  pending = false;
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
    canvas,
    context: {},
    read: () => state,
    pending: () => pending,
  });
});
afterEach(() => {
  api()?.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
it("ordinary RAF progress with no admitted draw is never readiness", async () => {
  await vi.advanceTimersByTimeAsync(1000);
  expect(poll()).toBeNull();
});
it("an old in-flight main fence completing after a new request cannot qualify", () => {
  main();
  fence();
  api().arm();
  signal();
  expect(poll()).toBeNull();
});
it("offscreen-only work cannot qualify", () => {
  fence(1, []);
  signal();
  expect(poll()).toBeNull();
});
it("matching main draw with pending native fence cannot qualify", () => {
  main();
  fence();
  observer({ kind: "wait", owner: 1, id: 1, status: 0x911b });
  expect(poll()).toBeNull();
});
it.each([0x911a, 0x911c])(
  "accepts genuine native positive status %s on the exact matching main batch",
  (status) => {
    main();
    fence();
    signal(1, status);
    expect(poll()).toMatchObject({
      mainDrawId: 1,
      fenceId: 1,
      nativeStatus: status,
      reusedUnchanged: false,
    });
    expect(api().verify().snapshot).toEqual(state);
  },
);
it("newer committed state supersedes otherwise completed evidence", () => {
  main();
  fence();
  signal();
  state.camera.requestId++;
  expect(poll()).toBeNull();
});
it("unsettled camera, wrong lights, incorrect attachment, or incorrect material values cannot qualify", () => {
  for (const change of [
    (s) => (s.camera.settled = false),
    (s) => (s.vehicle.lights = true),
    (s) => (s.vehicle.full = true),
    (s) => (s.vehicle.lamps[0].intensity = 2),
  ]) {
    const original = copy(state);
    change(state);
    main();
    fence();
    signal();
    expect(poll()).toBeNull();
    state = original;
  }
});
it("a later pending batch blocks a previously completed main even if state matches", () => {
  main();
  fence();
  signal();
  fence(2, [], 1);
  expect(poll()).toBeNull();
});
it("replaced pending prefix can qualify only through its new genuine positive fence", () => {
  main();
  fence();
  fence(2, [1], 1);
  observer({ kind: "retire", owner: 1, id: 1, reason: "superseded" });
  expect(poll()).toBeNull();
  signal(2);
  expect(poll()).toMatchObject({ fenceId: 2 });
});
it("deletion without observed signaled completion cannot qualify", () => {
  main();
  fence();
  observer({ kind: "retire", owner: 1, id: 1, reason: "retired" });
  expect(poll()).toBeNull();
});
it("pending newer demand must drain without forcing a frame", () => {
  main();
  fence();
  signal();
  pending = true;
  expect(poll()).toBeNull();
  pending = false;
  expect(poll()).not.toBeNull();
});
it("explicit unchanged reuse requires a pre-arm completed baseline and identical state", () => {
  main();
  fence();
  signal();
  api().arm({ allowUnchanged: true });
  expect(poll()).toMatchObject({ reusedUnchanged: true });
  state.pose.position[0]++;
  expect(poll()).toBeNull();
});
it("pre-arm reuse is off by default", () => {
  main();
  fence();
  signal();
  api().arm();
  expect(poll()).toBeNull();
});
it("native failure/loss invalidates all certificates", () => {
  main();
  fence();
  signal();
  observer({ kind: "invalid", owner: 1, reason: "context lost" });
  expect(() => poll()).toThrow(/context lost/);
});
it("WAIT_FAILED never becomes success", () => {
  main();
  fence();
  observer({ kind: "wait", owner: 1, id: 1, status: 0x911d });
  expect(() => poll()).toThrow(/WAIT_FAILED/);
});
it("silent native context loss is rejected", () => {
  main();
  fence();
  signal();
  state.live = false;
  expect(() => poll()).toThrow(/lost/);
});
it("a replacement owner cannot satisfy the old request", () => {
  observer({
    kind: "attach",
    owner: 2,
    canvas,
    context: {},
    read: () => state,
    pending: () => false,
  });
  expect(() => poll()).toThrow(/replaced/);
});
it("an explicitly requested route replacement starts with a new owner and new draw", () => {
  api().arm({ replacement: true });
  observer({ kind: "stop", owner: 1 });
  observer({
    kind: "attach",
    owner: 2,
    canvas,
    context: {},
    read: () => state,
    pending: () => false,
  });
  observer({ kind: "main", owner: 2, id: 1, snapshot: state, stable: true });
  observer({ kind: "fence", owner: 2, id: 1, draws: [1] });
  observer({ kind: "wait", owner: 2, id: 1, status: 0x911a });
  expect(poll()).toMatchObject({ owner: 2 });
});
it("late success is rejected despite delayed timeout callbacks", async () => {
  main();
  fence();
  signal();
  await vi.advanceTimersByTimeAsync(20001);
  expect(() => poll()).toThrow(/deadline/);
});
it("identity/state/dimensions changes across capture fail instead of retrying screenshots", () => {
  main();
  fence();
  signal();
  poll();
  state.dimensions.width++;
  expect(() => api().verify()).toThrow(/changed during capture/);
});
it("observer cleanup drops hooks and references", () => {
  api().stop();
  expect(globalThis.__gtrFunctionalCaptureObserver).toBeUndefined();
  expect(api()).toBeUndefined();
});
it.each([20000, 30000])(
  "the combined dimension/state/native readiness uses the original %s budget",
  async (timeout) => {
    main();
    fence();
    signal();
    const page = {
      evaluate: async (fn, arg) => fn(arg),
      waitForFunction: vi.fn(async (fn, arg, opts) => {
        expect(opts).toEqual({ timeout, polling: 16 });
        expect(fn(arg)).toBeTruthy();
      }),
    };
    await waitForFunctionalCapture(page, { preset: "hero", timeout });
    expect(page.waitForFunction).toHaveBeenCalledOnce();
  },
);

it("replacement intent cannot reuse the old completed owner and binds the next owner", () => {
  main();
  fence();
  signal();
  api().arm({ replacement: true });
  expect(poll()).toBeNull();
  observer({
    kind: "attach",
    owner: 2,
    canvas,
    context: {},
    read: () => state,
    pending: () => false,
  });
  expect(poll()).toBeNull();
  observer({
    kind: "attach",
    owner: 3,
    canvas,
    context: {},
    read: () => state,
    pending: () => false,
  });
  expect(() => poll()).toThrow(/replaced/);
});
it.each(["height", "renderHeight", "pixelRatio"])(
  "height/density mismatch in %s fails even with correct width",
  (key) => {
    state.dimensions[key] += 1;
    main();
    fence();
    signal();
    expect(poll()).toBeNull();
  },
);

it("replacement binds the first new attachment even without an intervening poll", () => {
  main();
  fence();
  signal();
  api().arm({ replacement: true });
  observer({
    kind: "attach",
    owner: 2,
    canvas,
    context: {},
    read: () => state,
    pending: () => false,
  });
  observer({
    kind: "attach",
    owner: 3,
    canvas,
    context: {},
    read: () => state,
    pending: () => false,
  });
  expect(() => poll()).toThrow(/replaced/);
});
it("completed offscreen-only work never impersonates a main but permits explicit unchanged baseline reuse", () => {
  main();
  fence();
  signal();
  api().arm({ allowUnchanged: true });
  fence(2, []);
  expect(poll()).toBeNull();
  signal(2);
  expect(poll()).toMatchObject({
    mainDrawId: 1,
    fenceId: 1,
    drainFenceId: 2,
    reusedUnchanged: true,
  });
});
it("screenshot completion does not implicitly permit the next capture to reuse a frame", () => {
  main();
  fence();
  signal();
  poll();
  api().verify();
  expect(poll()).toBeNull();
});

it("successful foreign default-framebuffer render invalidates retained main pixels", () => {
  main();
  fence();
  signal();
  api().arm({ allowUnchanged: true });
  observer({ kind: "buffer-replaced", owner: 1 });
  fence(2, []);
  signal(2);
  expect(poll()).toBeNull();
  main(2);
  fence(3, [2]);
  signal(3);
  expect(poll()).toMatchObject({ mainDrawId: 2, fenceId: 3 });
});
it("newer offscreen drain during capture invalidates the certificate bounds", () => {
  main();
  fence();
  signal();
  poll();
  fence(2, []);
  signal(2);
  expect(() => api().verify()).toThrow(/changed during capture/);
});

it.each(["position", "quaternion", "projection"])(
  "non-finite %s cannot be laundered into a valid JSON pose",
  (key) => {
    state.pose[key][0] = NaN;
    main();
    fence();
    signal();
    expect(poll()).toBeNull();
  },
);
it("non-finite camera request metadata cannot qualify", () => {
  state.camera.targetFov = Infinity;
  main();
  fence();
  signal();
  expect(poll()).toBeNull();
});

it("preset selection must apply a newer camera request even when the preset label is unchanged", () => {
  api().arm({ cameraRequest: true });
  main();
  fence();
  signal();
  expect(poll()).toBeNull();
  state.camera.requestId++;
  main(2);
  fence(2, [2]);
  signal(2);
  expect(poll()).toMatchObject({ mainDrawId: 2 });
});

// Source-bound desktop/mobile reports from CI run 38136396803. Native events
// below replay observed main/fence IDs and status; no browser or GPU is started.
it.each(orderFailures)(
  "$viewport completed unchanged pixels survive provider registration order",
  ({ expected: wanted, failure }) => {
    state = copy(failure.lastMain.snapshot);
    main(failure.lastMain.id);
    fence(
      failure.lastBatch.id,
      failure.lastBatch.draws,
      failure.lastBatch.previous,
    );
    signal(failure.lastBatch.id, failure.lastBatch.status);
    api().arm({ allowUnchanged: true });
    state = copy(failure.current);
    expect(state).toEqual(failure.lastMain.snapshot);
    expect(JSON.stringify(state)).not.toBe(
      JSON.stringify(failure.lastMain.snapshot),
    );
    expect(api().poll({ expected: wanted, deadline: 20000 })).toMatchObject({
      mainDrawId: 14,
      fenceId: 16,
      nativeStatus: 0x911c,
      drainFenceId: 16,
      reusedUnchanged: true,
      snapshot: failure.current,
    });
    expect(api().verify().snapshot).toEqual(failure.current);
  },
);
const reverseObjectKeys = (value) => {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseObjectKeys(child)]),
  );
};
it("object-key order is irrelevant through new draws, revisions and capture verification", () => {
  main();
  fence();
  signal();
  const revision = poll().appliedRevision;
  state = reverseObjectKeys(state);
  expect(api().verify().appliedRevision).toBe(revision);
  main(2);
  fence(2, [2]);
  signal(2);
  expect(poll()).toMatchObject({
    mainDrawId: 2,
    appliedRevision: revision,
    reusedUnchanged: false,
  });
  state = reverseObjectKeys(state);
  expect(api().verify().mainDrawId).toBe(2);
});
it.each([
  ["camera request", (s) => s.camera.requestId++],
  ["camera target", (s) => (s.camera.target[0] += 0.000001)],
  ["pose", (s) => (s.pose.position[0] += 0.000001)],
  ["lamp emissive", (s) => (s.vehicle.lamps[0].emissive[0] += 0.000001)],
  ["lamp intensity", (s) => s.vehicle.lamps[0].intensity++],
  ["geometry", (s) => s.dimensions.height++],
  ["array order", (s) => s.pose.position.reverse()],
  ["array length", (s) => s.pose.position.push(0)],
  [
    "array versus object",
    (s) => {
      s.pose.position = { ...s.pose.position };
    },
  ],
  [
    "missing key",
    (s) => {
      delete s.camera.targetFov;
    },
  ],
  [
    "extra key",
    (s) => {
      s.camera.extra = null;
    },
  ],
  [
    "null versus missing",
    (s) => {
      delete s.vehicle.cabinSeat;
    },
  ],
  [
    "scalar type",
    (s) => {
      s.camera.requestId = String(s.camera.requestId);
    },
  ],
])("key-order tolerance still rejects changed %s", (_name, change) => {
  main();
  fence();
  signal();
  api().arm({ allowUnchanged: true });
  expect(poll()).not.toBeNull();
  state = reverseObjectKeys(state);
  change(state);
  expect(poll()).toBeNull();
  expect(() => api().verify()).toThrow(/changed during capture/);
});
it("provider reordering does not create a pre-arm completion or allow implicit reuse", () => {
  main();
  fence();
  api().arm({ allowUnchanged: true });
  signal();
  state = reverseObjectKeys(state);
  expect(poll()).toBeNull();
  api().arm();
  expect(poll()).toBeNull();
});
it("provider reordering cannot bypass a pending later native drain", () => {
  main();
  fence();
  signal();
  api().arm({ allowUnchanged: true });
  state = reverseObjectKeys(state);
  fence(2, []);
  expect(poll()).toBeNull();
  signal(2);
  expect(poll()).toMatchObject({
    mainDrawId: 1,
    fenceId: 1,
    drainFenceId: 2,
    reusedUnchanged: true,
  });
});

// Actual failure evidence from run 38141028511: UI selection/decoded images
// precede the first driver main draw. Replayed native events are CPU contracts,
// not a claim that a GPU or browser ran in this test.
it.each(cabinResourceFailures)(
  "$viewport resource sampling rejects cabin UI readiness before an admitted main",
  async ({
    failure,
    attemptMark,
    candidateEvidence,
    expected: wanted,
    completedDriver,
  }) => {
    observer({ kind: "stop", owner: 1 });
    const owner = failure.request.owner;
    state = copy(failure.lastMain.snapshot);
    observer({
      kind: "attach",
      owner,
      canvas,
      context: {},
      read: () => state,
      pending: () => pending,
    });
    observer({ ...failure.lastMain, snapshot: copy(state) });
    observer({ ...failure.lastBatch, status: undefined });
    observer({
      kind: "wait",
      owner,
      id: failure.lastBatch.id,
      status: failure.lastBatch.status,
    });
    api().arm({ allowUnchanged: true });
    state = copy(failure.current);
    pending = true;
    expect(state.vehicle).toMatchObject({
      full: true,
      proxy: false,
      cabinSeat: "driver",
    });
    expect(state.camera.settled).toBe(false);
    expect(failure.lastMain.snapshot.vehicle.full).toBe(false);
    expect(failure.lastBatch.status).toBe(0x911b);
    const proof = api().begin(wanted, 20000);
    expect(api().poll(proof)).toBeNull();
    expect(() =>
      cabinResourceCohort(attemptMark, candidateEvidence, cabinImages.images),
    ).toThrow(/Actual candidate bitmaps reached WebGL textures/);
    // Elapsed RAF opportunities cannot complete native work. The same bound
    // remains active; an eventual genuine driver main and positive fence can.
    await vi.advanceTimersByTimeAsync(1000);
    expect(api().poll(proof)).toBeNull();
    pending = false;
    observer({ kind: "wait", owner, id: failure.lastBatch.id, status: 0x911c });
    expect(api().poll(proof)).toBeNull();
    state = copy(completedDriver.snapshot);
    state.camera.requestId = failure.current.camera.requestId;
    const draw = failure.lastMain.id + 1,
      batch = failure.lastBatch.id + 1;
    observer({
      kind: "main",
      owner,
      id: draw,
      snapshot: copy(state),
      stable: true,
    });
    observer({
      kind: "fence",
      owner,
      id: batch,
      draws: [draw],
      previous: null,
    });
    observer({ kind: "wait", owner, id: batch, status: 0x911b });
    expect(api().poll(proof)).toBeNull();
    observer({ kind: "wait", owner, id: batch, status: 0x911c });
    expect(api().poll(proof)).toMatchObject({
      owner,
      mainDrawId: draw,
      nativeStatus: 0x911c,
      deadline: 20000,
      reusedUnchanged: false,
    });
    // Completed rendering never replaces the independent real upload assertion.
    expect(() =>
      cabinResourceCohort(attemptMark, candidateEvidence, cabinImages.images),
    ).toThrow(/Actual candidate bitmaps reached WebGL textures/);
    await vi.advanceTimersByTimeAsync(19000);
    expect(() => api().poll(proof)).toThrow(/deadline/);
  },
);
