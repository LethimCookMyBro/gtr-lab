// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, createRoot, _roots } from "@react-three/fiber";
import { createRequire } from "node:module";
import type { WebGLRenderer } from "three";
import { prepareAsyncRendererDisposal } from "../src/components/three/asyncRendererDisposal";

const THREE: typeof import("three") = createRequire(import.meta.url)("three");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  let lost = false,
    status = 0x911b;
  const sync = {};
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    fenceSync: vi.fn(() => sync),
    flush: vi.fn(),
    clientWaitSync: vi.fn(() => status),
    deleteSync: vi.fn(),
    isContextLost: vi.fn(() => lost),
  };
  const dispose = vi.fn(),
    forceContextLoss = vi.fn();
  const renderer = {
    isWebGLRenderer: true,
    domElement: document.createElement("canvas"),
    getContext: () => context,
    dispose,
    forceContextLoss,
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    render() {},
    setPixelRatio() {},
    setSize() {},
    getPixelRatio: () => 1,
    renderLists: { dispose: vi.fn() },
  };
  return {
    renderer: renderer as unknown as WebGLRenderer,
    context,
    sync,
    dispose,
    forceContextLoss,
    complete: (conditionSatisfied = false) => {
      status = conditionSatisfied
        ? context.CONDITION_SATISFIED
        : context.ALREADY_SIGNALED;
    },
    fail: () => {
      status = context.WAIT_FAILED;
    },
    lose: () => {
      lost = true;
    },
  };
}
it("disposes resources once, then waits across tasks for a zero-timeout fence before resolving", async () => {
  const f = fixture();
  prepareAsyncRendererDisposal(f.renderer);
  prepareAsyncRendererDisposal(f.renderer);
  const pending = f.renderer.dispose();
  expect(pending).toBeInstanceOf(Promise);
  expect(f.renderer.dispose()).toBe(pending);
  expect(f.dispose).toHaveBeenCalledTimes(1);
  expect(f.context.fenceSync).toHaveBeenCalledExactlyOnceWith(
    f.context.SYNC_GPU_COMMANDS_COMPLETE,
    0,
  );
  expect(f.context.flush).toHaveBeenCalledTimes(1);
  expect(f.context.clientWaitSync).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(16);
  expect(f.context.clientWaitSync).toHaveBeenCalledExactlyOnceWith(
    f.sync,
    0,
    0,
  );
  expect(f.context.deleteSync).not.toHaveBeenCalled();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await pending;
  expect(f.context.deleteSync).toHaveBeenCalledExactlyOnceWith(f.sync);
  expect(f.forceContextLoss).not.toHaveBeenCalled(); // R3F owns the final call.
  expect(vi.getTimerCount()).toBe(0);
});
it("accepts CONDITION_SATISFIED as a completed fence", async () => {
  const f = fixture();
  prepareAsyncRendererDisposal(f.renderer);
  f.complete(true);
  const pending = f.renderer.dispose();
  await vi.advanceTimersByTimeAsync(16);
  await pending;
  expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
});
it("keeps explicit live context loss unchanged and immediately settles an already-lost disposal", async () => {
  const f = fixture();
  prepareAsyncRendererDisposal(f.renderer);
  f.renderer.forceContextLoss();
  expect(f.forceContextLoss).toHaveBeenCalledTimes(1);
  f.lose();
  await f.renderer.dispose();
  expect(f.dispose).toHaveBeenCalledTimes(1);
  expect(f.context.fenceSync).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["event", "poll"])(
  "context loss during waiting cancels the pending %s path and deletes its sync",
  async (kind) => {
    const f = fixture();
    prepareAsyncRendererDisposal(f.renderer);
    const pending = f.renderer.dispose();
    f.lose();
    if (kind === "event")
      f.renderer.domElement.dispatchEvent(new Event("webglcontextlost"));
    else await vi.advanceTimersByTimeAsync(16);
    await pending;
    expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const queries = f.context.clientWaitSync.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.context.clientWaitSync).toHaveBeenCalledTimes(queries);
  },
);
it("rejects WAIT_FAILED, deletes the sync and stops polling for R3F's existing finite fallback", async () => {
  const f = fixture();
  prepareAsyncRendererDisposal(f.renderer);
  f.fail();
  const rejected = expect(f.renderer.dispose()).rejects.toThrow(
    /fence wait failed/i,
  );
  await vi.advanceTimersByTimeAsync(16);
  await rejected;
  expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
  expect(f.dispose).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("rejects a null fence without retaining polling or inventing successful drainage", async () => {
  const f = fixture();
  f.context.fenceSync.mockImplementation(() => null as unknown as object);
  prepareAsyncRendererDisposal(f.renderer);
  await expect(f.renderer.dispose()).rejects.toThrow(/create.*fence/i);
  expect(f.context.deleteSync).not.toHaveBeenCalled();
  expect(f.dispose).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["fenceSync", "flush", "clientWaitSync"] as const)(
  "cleans up and rejects a thrown %s call",
  async (method) => {
    const f = fixture();
    f.context[method].mockImplementation(() => {
      throw new Error("device rejected");
    });
    prepareAsyncRendererDisposal(f.renderer);
    const rejected = expect(f.renderer.dispose()).rejects.toThrow(
      "device rejected",
    );
    if (method === "clientWaitSync") await vi.advanceTimersByTimeAsync(16);
    await rejected;
    expect(f.context.deleteSync).toHaveBeenCalledTimes(
      method === "fenceSync" ? 0 : 1,
    );
    expect(vi.getTimerCount()).toBe(0);
  },
);
it("terminates unsignaled polling after the finite 30-second background drain budget", async () => {
  const f = fixture();
  prepareAsyncRendererDisposal(f.renderer);
  const rejected = expect(f.renderer.dispose()).rejects.toThrow(
    /30.*second|30000/i,
  );
  await vi.advanceTimersByTimeAsync(30_016);
  await rejected;
  expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
  expect(f.dispose).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["drained", "failed"])(
  "installed R3F detaches and disposes now, then releases the context after %s settlement",
  async (outcome) => {
    const f = fixture();
    prepareAsyncRendererDisposal(f.renderer);
    const geometry = new THREE.BoxGeometry(),
      texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    const geometryDisposed = vi.spyOn(geometry, "dispose"),
      materialDisposed = vi.spyOn(material, "dispose"),
      textureDisposed = vi.spyOn(texture, "dispose");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    function OwnedModel() {
      useEffect(
        () => () => {
          geometry.dispose();
          material.dispose();
          texture.dispose();
        },
        [],
      );
      return <primitive object={mesh} dispose={null} />;
    }
    const root = createRoot(f.renderer.domElement);
    await root.configure({
      gl: () => f.renderer,
      frameloop: "never",
      size: { width: 40, height: 40, top: 0, left: 0 },
    });
    await act(async () => root.render(<OwnedModel />));
    const store = _roots.get(f.renderer.domElement)!.store;
    await act(async () => root.unmount());
    expect(_roots.has(f.renderer.domElement)).toBe(false);
    expect(store.getState().internal.active).toBe(false);
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(textureDisposed).toHaveBeenCalledTimes(1);
    expect(f.dispose).toHaveBeenCalledTimes(1);
    expect(f.forceContextLoss).not.toHaveBeenCalled();
    if (outcome === "drained") f.complete();
    else f.fail();
    await act(async () => vi.advanceTimersByTimeAsync(16));
    expect(f.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    if (outcome === "failed")
      expect(warning).toHaveBeenCalledWith(
        "[R3F] Error disposing renderer",
        expect.any(Error),
      );
    else expect(warning).not.toHaveBeenCalled();
  },
);

it("clears polling even when sync deletion throws and preserves the finite error fallback", async () => {
  const f = fixture();
  prepareAsyncRendererDisposal(f.renderer);
  f.complete();
  f.context.deleteSync.mockImplementation(() => {
    throw new Error("sync deletion failed");
  });
  const rejected = expect(f.renderer.dispose()).rejects.toThrow(
    "sync deletion failed",
  );
  await vi.advanceTimersByTimeAsync(16);
  await rejected;
  expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("releases every retired root exactly once across 24 overlapping root lifecycles", async () => {
  const initialRoots = _roots.size;
  const attempts = [];
  for (let index = 0; index < 24; index++) {
    const f = fixture();
    prepareAsyncRendererDisposal(f.renderer);
    const root = createRoot(f.renderer.domElement);
    await root.configure({
      gl: () => f.renderer,
      frameloop: "never",
      size: { width: 40, height: 40, top: 0, left: 0 },
    });
    await act(async () => root.render(null));
    await act(async () => root.unmount());
    attempts.push(f);
  }
  expect(_roots.size).toBe(initialRoots);
  expect(vi.getTimerCount()).toBe(24);
  for (const f of attempts) {
    expect(f.dispose).toHaveBeenCalledTimes(1);
    expect(f.forceContextLoss).not.toHaveBeenCalled();
    f.complete();
  }
  await act(async () => vi.advanceTimersByTimeAsync(16));
  for (const f of attempts) {
    expect(f.dispose).toHaveBeenCalledTimes(1);
    expect(f.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
  }
  expect(_roots.size).toBe(initialRoots);
  expect(vi.getTimerCount()).toBe(0);
});
