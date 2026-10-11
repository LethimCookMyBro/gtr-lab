import { addAfterEffect, addEffect } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";

const POLL_MS = 16;
// Feedback threshold only: never a completion or failure deadline.
const SLOW_RENDER_NOTICE_MS = 5_000;

function frameCounterDescriptor(internal: RootState["internal"]) {
  const descriptor = Object.getOwnPropertyDescriptor(internal, "frames");
  return descriptor &&
    "value" in descriptor &&
    descriptor.configurable &&
    descriptor.writable &&
    typeof descriptor.value === "number" &&
    Number.isFinite(descriptor.value)
    ? descriptor
    : undefined;
}

/**
 * Whole-tick admission for this application's coalesced demand loop.
 *
 * This adapter intentionally depends on the installed R3F 9.8.1 loop ordering
 * and numeric internal.frames field. It is not a general R3F scheduler: legacy
 * additive invalidate(n) requests made by another root inside a gated RAF are
 * coalesced, not accumulated. App and installed Drei callers use invalidate().
 * Keep the installed-loop tests when changing either dependency.
 */
export function installDemandRenderBackpressure(
  get: () => RootState,
  onError: (message: string) => void,
  onPendingChange: (pending: boolean) => void = () => {},
): () => void {
  if (!frameCounterDescriptor(get().internal)) {
    onError(
      "The viewer's frame scheduler is incompatible. Reload or retry the viewer.",
    );
    return () => {};
  }
  const renderer = get().gl;
  const canvas = renderer.domElement;
  const initialContext = renderer.getContext();
  if (!("fenceSync" in initialContext)) {
    onError(
      "This viewer requires WebGL2 frame completion support. Retry on a supported graphics device.",
    );
    return () => {};
  }
  let context: WebGL2RenderingContext = initialContext;
  let stopped = false;
  let lost = context.isContextLost();
  let failed = false;
  let sync: WebGLSync | null = null;
  let pendingSince: number | undefined;
  let pendingNotice = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let windowOpen = false;
  let observedWork = false;
  let windowGeneration = 0;
  let batchGeneration = 0;
  let queuedBatch = false;
  let restoreFrames: (() => void) | undefined;

  function setPendingNotice(value: boolean) {
    if (pendingNotice === value) return;
    pendingNotice = value;
    onPendingChange(value);
  }
  function retireFence() {
    clearTimeout(timer);
    timer = undefined;
    const owned = sync;
    sync = null;
    pendingSince = undefined;
    setPendingNotice(false);
    if (owned) context.deleteSync(owned);
  }
  function fail() {
    if (stopped || failed || lost) return;
    failed = true;
    try {
      retireFence();
    } finally {
      onError(
        "The graphics device stopped completing frames. Retry the viewer to restore rendering.",
      );
    }
  }
  function wake() {
    const state = get();
    if (stopped || failed || lost || !state.internal.active) return;
    const pending = state.internal.frames;
    if (pending > 0) {
      state.invalidate();
      // Native invalidate() coalesces to one. Do not consume an already queued
      // finite demand budget merely to restart the stopped global RAF loop.
      state.internal.frames = Math.max(pending, state.internal.frames);
    }
  }
  function poll(shouldWake: boolean): boolean {
    if (stopped || failed || lost) return false;
    if (!sync) return true;
    try {
      if (context.isContextLost()) {
        onLost();
        return false;
      }
      const status = context.clientWaitSync(sync, 0, 0);
      if (
        status === context.ALREADY_SIGNALED ||
        status === context.CONDITION_SATISFIED
      ) {
        retireFence();
        if (shouldWake) wake();
        return true;
      }
      // TIMEOUT_EXPIRED with a zero timeout says only "still pending". A
      // legitimate startup prefix can exceed teardown's separate drain budget;
      // its age is not evidence of device failure. Lifecycle cleanup remains
      // responsible for ending a wait whose owner is no longer needed.
      if (status !== context.TIMEOUT_EXPIRED) fail();
      else if (
        pendingSince !== undefined &&
        performance.now() - pendingSince >= SLOW_RENDER_NOTICE_MS
      )
        setPendingNotice(true);
    } catch {
      fail();
    }
    return false;
  }
  function schedulePoll() {
    if (stopped || failed || lost || !sync || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      poll(true);
      schedulePoll();
    }, POLL_MS);
  }
  function sealBatch() {
    if (stopped || failed || lost) return;
    try {
      if (context.isContextLost()) {
        onLost();
        return;
      }
      // The new fence follows every command in the observed batch, including
      // nested water reflections and layout-effect cube captures. Never drop a
      // renderer.render call to obtain this limit.
      const next = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!next) {
        fail();
        return;
      }
      const previous = sync;
      sync = next;
      pendingSince ??= performance.now();
      if (previous) context.deleteSync(previous);
      context.flush();
      schedulePoll();
    } catch {
      fail();
    }
  }
  function closeWindow(seal = true) {
    if (!windowOpen) return;
    windowOpen = false;
    windowGeneration++;
    restoreFrames?.();
    restoreFrames = undefined;
    if (seal && observedWork) sealBatch();
    observedWork = false;
  }
  function hideEligibility(state: RootState) {
    const internal = state.internal;
    const descriptor = frameCounterDescriptor(internal);
    if (!descriptor) {
      fail();
      return;
    }
    let pending = internal.frames;
    const hidden = () => 0;
    Object.defineProperty(internal, "frames", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: hidden,
      set: (value: number) => {
        // R3F writes two for invalidate() inside any root's useFrame because
        // its usual tick then consumes one. This root is skipped, so retain
        // one requested future tick instead of inventing a second submission.
        pending = Math.max(pending, value === 2 ? 1 : value);
      },
    });
    restoreFrames = () => {
      if (Object.getOwnPropertyDescriptor(internal, "frames")?.get === hidden)
        Object.defineProperty(internal, "frames", {
          ...descriptor,
          value: pending,
        });
    };
  }
  const before = addEffect(() => {
    closeWindow();
    const state = get();
    if (
      stopped ||
      !state.internal.active ||
      state.frameloop !== "demand" ||
      renderer.xr.isPresenting
    )
      return;
    const mayRender = poll(false);
    windowOpen = true;
    const generation = ++windowGeneration;
    // Another root can throw before global after effects run. Never strand the
    // descriptor or its demand counter across the event-loop boundary.
    queueMicrotask(() => {
      if (!stopped && windowGeneration === generation) closeWindow();
    });
    if (!mayRender) hideEligibility(state);
  });
  const after = addAfterEffect(() => closeWindow());
  const render = renderer.render;
  const observedRender: typeof render = function (
    this: typeof renderer,
    ...args
  ) {
    try {
      return render.apply(this, args);
    } finally {
      if (!stopped && !failed && !lost) {
        if (windowOpen) observedWork = true;
        else if (!queuedBatch) {
          queuedBatch = true;
          const generation = ++batchGeneration;
          queueMicrotask(() => {
            if (stopped || generation !== batchGeneration) return;
            queuedBatch = false;
            sealBatch();
          });
        }
      }
    }
  };
  renderer.render = observedRender;
  function onLost() {
    lost = true;
    batchGeneration++;
    queuedBatch = false;
    closeWindow(false);
    try {
      retireFence();
    } catch {
      /* The lost context owns no usable sync. */
    }
  }
  function onRestored() {
    if (stopped) return;
    const restored = renderer.getContext();
    if (!("fenceSync" in restored)) {
      lost = false;
      fail();
      return;
    }
    context = restored;
    lost = context.isContextLost();
    failed = false;
    sealBatch();
    // Always redraw the restored drawing buffer, even if input was unchanged.
    get().invalidate();
  }
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  sealBatch();
  return () => {
    if (stopped) return;
    stopped = true;
    batchGeneration++;
    closeWindow(false);
    before();
    after();
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    if (renderer.render === observedRender) renderer.render = render;
    try {
      retireFence();
    } catch {
      /* Teardown must still release the owner. */
    }
  };
}
