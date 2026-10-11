/** Dedicated opt-in functional pixel readiness. Never imported by native-motion QA. */
export function installFunctionalCaptureObserver() {
  const owners = new Map();
  let nextRequest = 0,
    inputRevision = 0,
    pointer = null,
    ownerGeneration = 0;
  let request = null,
    certificate = null;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  // Providers may unregister/re-register without changing the rendered state.
  // Compare every JSON value, ignoring only object-key insertion order.
  const equal = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object")
      return false;
    if (Array.isArray(a) || Array.isArray(b))
      return (
        Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((value, index) => equal(value, b[index]))
      );
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]))
    );
  };
  const now = () => performance.now();
  const current = () => {
    const canvas = document.querySelector(".scene-stage canvas");
    return [...owners.values()].findLast(
      (owner) => owner.canvas === canvas && !owner.stopped,
    );
  };
  const sample = (owner) => {
    if (!owner || owner.invalid || owner.stopped) return null;
    try {
      return clone(owner.read());
    } catch {
      return null;
    }
  };
  const completed = (owner) => {
    const batch = owner?.batches.get(owner.latestFence);
    if (
      !batch ||
      ![0x911a, 0x911c].includes(batch.status) ||
      (batch.retired && batch.retired !== "signaled")
    )
      return null;
    const draw = owner.draws.get(owner.latestMain);
    if (!draw || !draw.stable || !draw.completion) return null;
    return {
      batch: draw.completion,
      draw,
      drainFenceId: batch.id,
      drainNativeStatus: batch.status,
    };
  };
  const arm = ({
    allowUnchanged = false,
    replacement = false,
    cameraRequest = false,
  } = {}) => {
    const owner = current(),
      baseline = completed(owner);
    const priorCameraRequest = sample(owner)?.camera?.requestId;
    if (cameraRequest && !Number.isSafeInteger(priorCameraRequest))
      throw new Error(
        "Cannot arm camera action without its current committed request",
      );
    request = {
      id: ++nextRequest,
      owner: replacement ? null : (owner?.id ?? null),
      beforeMain: replacement ? 0 : (owner?.latestMain ?? 0),
      baseline:
        allowUnchanged && baseline
          ? {
              owner: owner.id,
              snapshot: baseline.draw.snapshot,
              draw: baseline.draw.id,
              fence: baseline.batch.id,
            }
          : null,
      armedAt: now(),
      inputRevision,
      replacement,
      afterOwnerGeneration: ownerGeneration,
      cameraRequestAfter: cameraRequest ? priorCameraRequest : null,
    };
    certificate = null;
    return request.id;
  };
  const observe = (event) => {
    if (event.kind === "attach") {
      owners.set(event.owner, {
        id: event.owner,
        generation: ++ownerGeneration,
        canvas: event.canvas,
        context: event.context,
        read: event.read,
        pending: event.pending,
        draws: new Map(),
        batches: new Map(),
        latestMain: 0,
        latestFence: 0,
        invalid: null,
        stopped: false,
      });
      if (!request) arm();
      else if (
        request.replacement &&
        request.owner === null &&
        ownerGeneration > request.afterOwnerGeneration
      )
        request.owner = event.owner;
      return;
    }
    const owner = owners.get(event.owner);
    if (!owner || owner.stopped) return;
    if (event.kind === "main") {
      const prior = owner.draws.get(owner.latestMain);
      owner.stateRevision =
        (owner.stateRevision ?? 0) +
        (prior && equal(prior.snapshot, event.snapshot) ? 0 : 1);
      owner.latestMain = event.id;
      owner.draws.set(event.id, {
        ...clone(event),
        appliedRevision: owner.stateRevision,
        inputRevision,
        observedAt: now(),
      });
      // Only the latest main draw can qualify. Bounded storage avoids retaining a run's scene history.
      for (const id of owner.draws.keys())
        if (id !== event.id) owner.draws.delete(id);
    } else if (event.kind === "fence") {
      owner.latestFence = event.id;
      owner.batches.set(event.id, { ...clone(event), status: null });
      for (const id of owner.batches.keys())
        if (id !== event.id && id !== event.previous) owner.batches.delete(id);
    } else if (event.kind === "wait") {
      const batch = owner.batches.get(event.id);
      if (batch) {
        batch.status = event.status;
        batch.observedAt = now();
        const draw = owner.draws.get(owner.latestMain);
        if (
          draw &&
          batch.draws.includes(draw.id) &&
          [0x911a, 0x911c].includes(event.status)
        )
          draw.completion = {
            id: batch.id,
            status: event.status,
            observedAt: batch.observedAt,
          };
      }
      if (event.status === 0x911d) owner.invalid = "native WAIT_FAILED";
    } else if (event.kind === "retire") {
      const batch = owner.batches.get(event.id);
      if (batch) batch.retired = event.reason;
    } else if (event.kind === "buffer-replaced") owner.draws.clear();
    else if (event.kind === "invalid") owner.invalid = event.reason;
    else if (event.kind === "stop") {
      owner.stopped = true;
      owner.read = null;
      owner.pending = null;
      owner.canvas = null;
      owner.context = null;
      owner.draws.clear();
      owner.batches.clear();
      owners.delete(event.owner);
    }
  };
  const onInput = (event) => {
    if (event.target !== current()?.canvas || !event.isTrusted) return;
    if (event.type === "pointerdown") {
      pointer = event.pointerId;
      inputRevision++;
    } else if (event.type === "pointerup" || event.type === "pointercancel") {
      if (pointer === event.pointerId) pointer = null;
    } else if (event.type === "pointermove" && pointer === event.pointerId)
      inputRevision++;
    else if (
      event.type === "wheel" ||
      (event.type === "keydown" &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(
          event.key,
        ))
    )
      inputRevision++;
  };
  const events = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "wheel",
    "keydown",
  ];
  events.forEach((type) => document.addEventListener(type, onInput, true));
  const matches = (snapshot, expected) => {
    if (
      !snapshot?.live ||
      !snapshot.camera?.settled ||
      !snapshot.vehicle?.exterior
    )
      return false;
    const { camera, vehicle, dimensions: d, pose } = snapshot;
    const finiteTuple = (value, length) =>
      Array.isArray(value) &&
      value.length === length &&
      value.every(Number.isFinite);
    if (
      !Number.isSafeInteger(camera.requestId) ||
      camera.requestId < 0 ||
      !Number.isFinite(camera.targetFov) ||
      camera.targetFov <= 0 ||
      !finiteTuple(camera.target, 3) ||
      !finiteTuple(camera.destination, 3) ||
      !finiteTuple(pose?.position, 3) ||
      !finiteTuple(pose?.quaternion, 4) ||
      !finiteTuple(pose?.projection, 16) ||
      !Array.isArray(vehicle.lamps) ||
      !vehicle.lamps.every(
        (lamp) =>
          finiteTuple(lamp.emissive, 3) && Number.isFinite(lamp.intensity),
      )
    )
      return false;
    if (
      !d ||
      ![
        d.width,
        d.height,
        d.cssWidth,
        d.cssHeight,
        d.renderWidth,
        d.renderHeight,
        d.pixelRatio,
      ].every((value) => Number.isFinite(value) && value > 0)
    )
      return false;
    const density = Math.min(
      devicePixelRatio,
      1.5,
      Math.sqrt(2_000_000 / Math.max(1, d.renderWidth * d.renderHeight)),
    );
    if (
      d.pixelRatio !== density ||
      d.width !== Math.floor(d.renderWidth * density) ||
      d.height !== Math.floor(d.renderHeight * density) ||
      Math.abs(d.renderWidth - d.cssWidth) > 1 ||
      Math.abs(d.renderHeight - d.cssHeight) > 1 ||
      Math.abs(
        d.width / d.cssWidth -
          Math.min(
            devicePixelRatio,
            1.5,
            Math.sqrt(2_000_000 / Math.max(1, d.cssWidth * d.cssHeight)),
          ),
      ) >= 0.02
    )
      return false;
    if (
      camera.preset !== expected.preset ||
      vehicle.lights !== expected.lights ||
      vehicle.cabinSeat !== expected.seat
    )
      return false;
    if (
      expected.seat
        ? !vehicle.full || vehicle.proxy
        : vehicle.full || vehicle.proxy !== expected.proxy
    )
      return false;
    const rearLenses = vehicle.lamps.some(
      (lamp) => lamp.role === "taillight-lens",
    );
    return (
      vehicle.lamps.length > 0 &&
      vehicle.lamps.every(
        (lamp) =>
          lamp.intensity ===
          (expected.lights
            ? lamp.role === "headlights"
              ? 3
              : lamp.role === "taillight-lens"
                ? 0.92
                : rearLenses
                  ? 0.14
                  : 2
            : 0),
      )
    );
  };
  const readiness = (expected, deadline) => {
    // This guard is evaluated before every success, even if timers or JS were stalled.
    if (now() >= deadline)
      throw new Error(
        "Functional scene/native completion readiness deadline exceeded",
      );
    const owner = current();
    if (!request)
      throw new Error("Functional capture was not armed before the action");
    if (!owner) return null;
    if (request.replacement && request.owner === null) return null;
    if (request.owner === null) request.owner = owner.id;
    if (request.owner !== owner.id)
      throw new Error("Functional capture owner/context was replaced");
    if (owner.invalid)
      throw new Error(`Functional capture invalidated: ${owner.invalid}`);
    const state = sample(owner),
      completion = completed(owner);
    if (!state?.live)
      throw new Error("Functional capture context is lost or disconnected");
    if (
      !completion ||
      owner.pending() ||
      pointer !== null ||
      !matches(state, expected) ||
      (request.cameraRequestAfter !== null &&
        state.camera.requestId <= request.cameraRequestAfter)
    )
      return null;
    const { draw, batch } = completion;
    if (draw.inputRevision !== inputRevision || !equal(draw.snapshot, state))
      return null;
    const afterArm = draw.id > request.beforeMain;
    const unchanged =
      request.baseline?.owner === owner.id &&
      request.baseline.draw === draw.id &&
      request.baseline.fence === batch.id &&
      equal(request.baseline.snapshot, state) &&
      request.inputRevision === inputRevision;
    if (!afterArm && !unchanged) return null;
    if (now() >= deadline)
      throw new Error(
        "Functional scene/native completion readiness deadline exceeded",
      );
    certificate = {
      requestId: request.id,
      owner: owner.id,
      mainDrawId: draw.id,
      appliedRevision: draw.appliedRevision,
      fenceId: batch.id,
      nativeStatus: batch.status,
      armedAt: request.armedAt,
      readyAt: now(),
      deadline,
      snapshot: state,
      inputRevision,
      reusedUnchanged: !afterArm,
      drainFenceId: completion.drainFenceId,
      drainNativeStatus: completion.drainNativeStatus,
    };
    return clone(certificate);
  };
  globalThis.__gtrFunctionalCaptureObserver = observe;
  globalThis.__gtrFunctionalCapture = {
    version: 1,
    arm,
    begin(expected, timeout) {
      return { expected, deadline: now() + timeout };
    },
    poll({ expected, deadline }) {
      return readiness(expected, deadline);
    },
    startCapture() {
      if (!certificate) throw new Error("No native completion certificate");
      certificate.captureStartedAt = now();
    },
    snapshot() {
      const owner = current();
      return clone({
        request,
        certificate,
        current: sample(owner),
        lastMain: owner?.draws.get(owner.latestMain),
        lastBatch: owner?.batches.get(owner.latestFence),
        invalid: owner?.invalid,
      });
    },
    verify() {
      if (!certificate) throw new Error("No native completion certificate");
      const owner = current(),
        latest = completed(owner),
        state = sample(owner);
      if (
        owner?.id !== certificate.owner ||
        owner.pending() ||
        !latest ||
        latest.draw.id !== certificate.mainDrawId ||
        latest.batch.id !== certificate.fenceId ||
        latest.drainFenceId !== certificate.drainFenceId ||
        latest.drainNativeStatus !== certificate.drainNativeStatus ||
        inputRevision !== certificate.inputRevision ||
        !equal(state, certificate.snapshot)
      )
        throw new Error(
          "Scene, draw, fence, dimensions or context changed during capture",
        );
      const result = { ...clone(certificate), captureEndedAt: now() };
      arm();
      return result;
    },
    stop() {
      events.forEach((type) =>
        document.removeEventListener(type, onInput, true),
      );
      owners.clear();
      request = null;
      certificate = null;
      if (globalThis.__gtrFunctionalCaptureObserver === observe)
        delete globalThis.__gtrFunctionalCaptureObserver;
      delete globalThis.__gtrFunctionalCapture;
    },
  };
}

export async function armFunctionalCapture(page, options = {}) {
  return page.evaluate(
    (options) => globalThis.__gtrFunctionalCapture.arm(options),
    options,
  );
}

export async function waitForFunctionalCapture(page, { preset, timeout }) {
  const readiness = await page.evaluate(
    ({ preset, timeout }) => {
      const api = globalThis.__gtrFunctionalCapture;
      if (api?.version !== 1)
        throw new Error("Functional observation opt-in is missing");
      const rail = document.querySelector(
        'footer[aria-label="Cabin preview controls"]',
      );
      const selected = rail
        ?.querySelector('button[aria-pressed="true"]')
        ?.textContent.trim();
      const seat =
        { Driver: "driver", Passenger: "passenger", "Rear seat": "rear" }[
          selected
        ] ?? null;
      const lights = [...document.querySelectorAll("button")].find(
        (button) =>
          button.getAttribute("aria-label") === "Lights" ||
          button.textContent.trim() === "Lights",
      );
      const proxy =
        !seat &&
        document.querySelector(".cabin-window-status")?.textContent.trim() ===
          "Window view ready · Simplified cabin";
      return api.begin(
        {
          preset: seat ? "interior" : preset,
          seat,
          lights: lights?.getAttribute("aria-pressed") === "true",
          proxy,
        },
        timeout,
      );
    },
    { preset, timeout },
  );
  // One original readiness budget covers dimensions AND scene/native completion.
  await page.waitForFunction(
    (value) => globalThis.__gtrFunctionalCapture.poll(value),
    readiness,
    { timeout, polling: 16 },
  );
  await page.evaluate(() => globalThis.__gtrFunctionalCapture.startCapture());
}

export async function verifyFunctionalCapture(page) {
  return page.evaluate(() => globalThis.__gtrFunctionalCapture.verify());
}
